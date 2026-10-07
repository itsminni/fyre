import Foundation
import XCTest
@testable import Fyre

@MainActor
final class CompletionRegressionTests: XCTestCase {
    func testNotificationDestinationsRejectAmbiguousAndMalformedPayloads() throws {
        XCTAssertEqual(NotificationRoute(userInfo: ["threadId": "thread-1", "accountId": "user-a"])?.destination, .thread("thread-1"))
        XCTAssertEqual(NotificationRoute(userInfo: ["eventId": "event_2"])?.destination, .event("event_2"))
        for payload: [AnyHashable: Any] in [[:], ["threadId": "a", "eventId": "b"], ["threadId": "../a"],
                                           ["eventId": "https://example.test"], ["threadId": ""],
                                           ["threadId": String(repeating: "a", count: 37)], ["threadId": "a", "accountId": 42]] {
            XCTAssertNil(NotificationRoute(userInfo: payload))
        }
    }

    func testNewNotificationIsNotConsumedByAnOlderNavigation() throws {
        let router = NotificationRouter()
        router.receive(try XCTUnwrap(NotificationRoute(userInfo: ["threadId": "one"])))
        let previousRevision = router.revision
        router.receive(try XCTUnwrap(NotificationRoute(userInfo: ["eventId": "two"])))
        router.consume(revision: previousRevision)
        XCTAssertEqual(router.pending?.destination, .event("two"))
        router.consume(revision: router.revision)
        XCTAssertNil(router.pending)
    }

    func testAccountPreferencesRemainSeparateAndDeviceThemeIsPreserved() throws {
        let suite = "completion-tests-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("dark", forKey: "settings_theme_mode")
        AccountPreferenceScope.activate(accountId: "a", defaults: defaults)
        defaults.set(false, forKey: "settings_notifications_messages")
        defaults.set(false, forKey: "settings_show_age")
        AccountPreferenceScope.activate(accountId: nil, defaults: defaults)
        AccountPreferenceScope.activate(accountId: "b", defaults: defaults)
        XCTAssertTrue(defaults.bool(forKey: "settings_notifications_messages"))
        XCTAssertTrue(defaults.bool(forKey: "settings_show_age"))
        AccountPreferenceScope.activate(accountId: "a", defaults: defaults)
        XCTAssertFalse(defaults.bool(forKey: "settings_notifications_messages"))
        XCTAssertFalse(defaults.bool(forKey: "settings_show_age"))
        XCTAssertEqual(defaults.string(forKey: "settings_theme_mode"), "dark")
    }

    func testUploadCannotCommitAfterCancellationAndCannotCancelAfterCommit() throws {
        let cancelled = UploadControl()
        try cancelled.progress(completed: 5, total: 10)
        XCTAssertEqual(cancelled.fraction, 0.5)
        cancelled.cancel()
        XCTAssertThrowsError(try cancelled.beginCommit())
        let committing = UploadControl()
        try committing.beginCommit()
        committing.cancel()
        XCTAssertFalse(committing.isCancelled)
        XCTAssertNoThrow(try committing.checkCancellation())
    }

    func testRealtimeAcceptsWrappedAndUnwrappedPayloadAndRejectsControlMessages() throws {
        let payload: [String: Any] = ["events": ["tablesdb.db.tables.messages.rows.m.create"],
                                      "channels": ["tablesdb.db.tables.messages.rows"],
                                      "timestamp": "2026-10-01T12:30:00Z", "payload": ["$id": "m", "threadId": "t"]]
        let wrapped = try XCTUnwrap(RealtimePayload.parse(["type": "event", "data": payload]))
        let unwrapped = try XCTUnwrap(RealtimePayload.parse(payload))
        XCTAssertEqual(wrapped.stringValue(forKey: "threadId"), "t")
        XCTAssertEqual(wrapped.timestamp, unwrapped.timestamp)
        XCTAssertNotNil(wrapped.timestamp)
        XCTAssertNil(RealtimePayload.parse(["type": "connected", "data": ["channels": []]]))
        XCTAssertNil(RealtimePayload.parse(["events": [], "payload": [:]]))
    }

    func testRealtimeSharesConnectionAndDiscardsOldSessionEvents() throws {
        var connections: [RealtimeSpy] = []
        let hub = SharedRealtimeHub { _, channels, event, _, _ in
            let connection = RealtimeSpy(event: event)
            XCTAssertGreaterThanOrEqual(channels.count, 3)
            connections.append(connection)
            return connection
        }
        let configuration = try AppwriteConfiguration.load(dictionary: Self.configurationValues())
        var firstEvents = 0
        var secondEvents = 0
        hub.configure(accountId: "a", isActive: true, sessionRevision: 1)
        let first = hub.subscribe(configuration: configuration, accountId: "a", onEvent: { _ in firstEvents += 1 }, onError: { _ in })
        let second = hub.subscribe(configuration: configuration, accountId: "a", onEvent: { _ in secondEvents += 1 }, onError: { _ in })
        XCTAssertEqual(connections.count, 1)
        let event = try XCTUnwrap(RealtimePayload.parse(["events": ["message.create"], "payload": ["$id": "m"]]))
        connections[0].event(event)
        XCTAssertEqual(firstEvents, 1)
        XCTAssertEqual(secondEvents, 1)
        first.cancel()
        XCTAssertEqual(connections[0].cancellations, 0)
        hub.configure(accountId: "a", isActive: false, sessionRevision: 1)
        XCTAssertEqual(connections[0].cancellations, 1)
        connections[0].event(event)
        XCTAssertEqual(secondEvents, 1)
        hub.configure(accountId: "a", isActive: true, sessionRevision: 2)
        XCTAssertEqual(connections.count, 2)
        hub.configure(accountId: "b", isActive: true, sessionRevision: 3)
        connections[1].event(event)
        XCTAssertEqual(secondEvents, 1)
        second.cancel()
    }

    func testMessageIdentitiesUseSharedBackendFixtures() throws {
        struct Entry: Decodable { let userId: String; let threadId: String; let operationId: UUID; let messageId: String }
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { root.deleteLastPathComponent() }
        let file = root.appendingPathComponent("shared/contracts/fixtures/message-identity.json")
        let entries = try JSONDecoder().decode([Entry].self, from: Data(contentsOf: file))
        XCTAssertEqual(entries.count, 4)
        for entry in entries {
            XCTAssertEqual(OutgoingMessageAttempt.remoteMessageId(userId: entry.userId, threadId: entry.threadId, operationId: entry.operationId), entry.messageId)
        }
    }

    static func configurationValues() -> [String: Any] {
        [
            "APPWRITE_PROJECT_ID": "project-id",
            "APPWRITE_PUBLIC_ENDPOINT": "https://example.test/v1",
            "APPWRITE_DATABASE_ID": "database-id",
            "APPWRITE_PROFILES_TABLE_ID": "profiles-id",
            "APPWRITE_AVATARS_BUCKET_ID": "avatars-id",
            "APPWRITE_EVENTS_TABLE_ID": "events-id",
            "APPWRITE_EVENT_REGISTRATIONS_TABLE_ID": "registrations-id",
            "APPWRITE_THREADS_TABLE_ID": "threads-id",
            "APPWRITE_THREAD_PARTICIPANTS_TABLE_ID": "participants-id",
            "APPWRITE_MESSAGES_TABLE_ID": "messages-id",
            "APPWRITE_SWIPES_TABLE_ID": "swipes-id",
            "APPWRITE_MATCHES_TABLE_ID": "matches-id",
            "APPWRITE_RELATIONSHIPS_TABLE_ID": "relationships-id",
            "APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID": "register-id",
            "APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID": "cancel-id",
            "APPWRITE_MANAGE_PROFILE_FUNCTION_ID": "manage-profile-id",
            "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID": "thread-id",
            "APPWRITE_SEND_MESSAGE_FUNCTION_ID": "message-id",
            "APPWRITE_RECORD_SWIPE_FUNCTION_ID": "record-swipe-id",
            "APPWRITE_DISCOVER_PROFILES_FUNCTION_ID": "discover-id",
            "APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID": "relationship-id"
        ]
    }
}

@MainActor
private final class RealtimeSpy: RealtimeConnection {
    let event: (AppwriteRealtimeEvent) -> Void
    var cancellations = 0
    init(event: @escaping (AppwriteRealtimeEvent) -> Void) { self.event = event }
    func start() {}
    func cancel() { cancellations += 1 }
}
