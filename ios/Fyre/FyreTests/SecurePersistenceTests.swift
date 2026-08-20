import Foundation
import XCTest
@testable import Fyre

@MainActor
final class SecurePersistenceTests: XCTestCase {
    func testKeychainRoundTripAndRemoval() throws {
        let key = "test.secure-persistence.\(UUID().uuidString)"
        let expected = Data("sensitive-value".utf8)
        defer { try? SecurePersistenceStore.removeData(forKey: key) }

        try SecurePersistenceStore.setData(expected, forKey: key)
        XCTAssertEqual(try SecurePersistenceStore.data(forKey: key), expected)

        try SecurePersistenceStore.removeData(forKey: key)
        XCTAssertNil(try SecurePersistenceStore.data(forKey: key))
    }

    func testRecentChatCacheIsMemoryOnlyAndAccountScoped() {
        let userId = "test-user-\(UUID().uuidString)"
        let otherUserId = "other-user-\(UUID().uuidString)"
        let thread = makeThread(remoteId: "thread-\(UUID().uuidString)")
        defer {
            RecentChatThreadStore.clear(currentUserId: userId)
            RecentChatThreadStore.clear(currentUserId: otherUserId)
        }

        RecentChatThreadStore.configure(currentUserId: userId)

        XCTAssertTrue(RecentChatThreadStore.all().isEmpty)

        RecentChatThreadStore.upsert(thread)
        XCTAssertEqual(RecentChatThreadStore.all(), [thread])

        RecentChatThreadStore.configure(currentUserId: otherUserId)
        XCTAssertTrue(RecentChatThreadStore.all().isEmpty)
        RecentChatThreadStore.configure(currentUserId: userId)
        XCTAssertTrue(RecentChatThreadStore.all().isEmpty)

        RecentChatThreadStore.clear(currentUserId: userId)
        RecentChatThreadStore.configure(currentUserId: userId)
        XCTAssertTrue(RecentChatThreadStore.all().isEmpty)
    }

    func testLogoutClearsInMemoryChatScope() {
        let userId = "logout-user-\(UUID().uuidString)"
        defer { RecentChatThreadStore.clearForLogout(currentUserId: userId) }

        RecentChatThreadStore.configure(currentUserId: nil)
        RecentChatThreadStore.upsert(makeThread(remoteId: "anonymous-thread"))
        RecentChatThreadStore.configure(currentUserId: userId)
        RecentChatThreadStore.upsert(makeThread(remoteId: "account-thread"))

        RecentChatThreadStore.clearForLogout(currentUserId: userId)

        XCTAssertTrue(RecentChatThreadStore.all().isEmpty)
    }

    func testSeenMatchesAreAccountScopedEncryptedAndClearedOnLogout() throws {
        let userId = "seen-user-\(UUID().uuidString)"
        let threadId = "thread-\(UUID().uuidString)"
        defer { MatchSeenStore.clearForLogout(currentUserId: userId) }

        XCTAssertTrue(MatchSeenStore.mark(threadId, currentUserId: userId))
        XCTAssertFalse(MatchSeenStore.mark(threadId, currentUserId: userId))
        XCTAssertNotNil(try SecurePersistenceStore.data(forKey: "match.seen.v1.\(userId)"))

        MatchSeenStore.clearForLogout(currentUserId: userId)
        XCTAssertNil(try SecurePersistenceStore.data(forKey: "match.seen.v1.\(userId)"))
    }

    func testCorruptSecureCurrentUserIsDeletedFailClosed() throws {
        resetLocalState()
        defer { resetLocalState() }

        try SecurePersistenceStore.setData(
            Data("not-json".utf8),
            forKey: "profile.current-user.v1"
        )

        XCTAssertNil(UserStore.loadCurrentUser())
        XCTAssertNil(try SecurePersistenceStore.data(forKey: "profile.current-user.v1"))
    }

    func testUserEncodingContainsNoCredentialField() throws {
        resetLocalState()
        defer { resetLocalState() }

        let user = User(
            email: "secure-\(UUID().uuidString.lowercased())@example.test"
        )
        let encodedUser = try JSONEncoder().encode(user)
        let encodedObject = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: encodedUser) as? [String: Any]
        )

        XCTAssertEqual(encodedObject["email"] as? String, user.email)
        XCTAssertNil(encodedObject["password"])
    }

    func testCurrentUserUsesKeychainWithoutPersistingCredentialsAndLogoutKeepsMemoryOnlyAccount() async throws {
        resetLocalState()
        defer { resetLocalState() }

        let store = UserStore.shared
        let email = "\(UUID().uuidString.lowercased())@example.test"
        let signUpError = await store.signUp(email: email, password: "password123")
        XCTAssertNil(signUpError)

        let persistedData = try XCTUnwrap(
            try SecurePersistenceStore.data(forKey: "profile.current-user.v1")
        )
        let persistedObject = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: persistedData) as? [String: Any]
        )
        XCTAssertEqual(persistedObject["email"] as? String, email)
        XCTAssertNil(persistedObject["password"])
        let passwordData = Data("password123".utf8)
        let appDefaultsData = UserDefaults.standard.dictionaryRepresentation()
            .compactMap { entry in
                entry.key.hasPrefix("fyre_") ? entry.value as? Data : nil
            }
        XCTAssertFalse(appDefaultsData.contains { $0.range(of: passwordData) != nil })
        XCTAssertNil(persistedData.range(of: passwordData))

        RecentChatThreadStore.configure(currentUserId: nil)
        RecentChatThreadStore.upsert(makeThread(remoteId: "logout-thread"))
        XCTAssertFalse(RecentChatThreadStore.all().isEmpty)

        await store.logOut()

        XCTAssertNil(store.currentUser)
        XCTAssertNil(try SecurePersistenceStore.data(forKey: "profile.current-user.v1"))

        let loginError = await store.logIn(email: email, password: "password123")
        XCTAssertNil(loginError)
        XCTAssertEqual(store.currentUser?.email, email)
    }

    func testClearingLocalAppwriteSessionDeletesEndpointCookies() async throws {
        let identifier = UUID().uuidString.lowercased()
        let host = "auth-\(identifier).example.test"
        let targetCookieName = "target-\(identifier)"
        let unrelatedCookieName = "unrelated-\(identifier)"
        let storage = HTTPCookieStorage.shared
        let targetCookie = try XCTUnwrap(makeCookie(name: targetCookieName, domain: host))
        let unrelatedCookie = try XCTUnwrap(makeCookie(name: unrelatedCookieName, domain: "unrelated.test"))
        defer {
            storage.deleteCookie(targetCookie)
            storage.deleteCookie(unrelatedCookie)
        }

        storage.setCookie(targetCookie)
        storage.setCookie(unrelatedCookie)

        var values = validConfigurationValues()
        values["APPWRITE_PUBLIC_ENDPOINT"] = "https://\(host)/v1"
        let configuration = try AppwriteConfiguration.load(dictionary: values)
        let service = AppwriteService(configuration: configuration)
        await service.clearLocalSession()

        let cookies = storage.cookies ?? []
        XCTAssertFalse(cookies.contains { $0.name == targetCookieName })
        XCTAssertTrue(cookies.contains { $0.name == unrelatedCookieName })
    }

    private func resetLocalState() {
        let defaults = UserDefaults.standard
        defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix("fyre_") }
            .forEach { defaults.removeObject(forKey: $0) }
        RecentChatThreadStore.clearForLogout(currentUserId: nil)
        UserStore.shared.resetForTests()
    }

    private func makeThread(remoteId: String) -> ChatThread {
        let message = ChatMessage(
            id: UUID(),
            remoteId: "message-\(UUID().uuidString)",
            text: "private message",
            messageType: .text,
            attachment: nil,
            isMe: true,
            time: "12:00",
            sentAt: Date()
        )
        return ChatThread(
            id: UUID(),
            remoteId: remoteId,
            name: "Test chat",
            avatar: "T",
            isOnline: false,
            lastSeenAt: nil,
            currentUserReadAt: nil,
            otherParticipantReadAt: nil,
            participantUserIds: ["user-a", "user-b"],
            notificationsEnabled: true,
            relationshipState: .matched,
            messages: [message]
        )
    }

    private func makeCookie(name: String, domain: String) -> HTTPCookie? {
        HTTPCookie(properties: [
            .domain: domain,
            .path: "/",
            .name: name,
            .value: "session-value",
            .secure: "TRUE",
            .expires: Date().addingTimeInterval(3_600)
        ])
    }

    private func validConfigurationValues() -> [String: Any] {
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
