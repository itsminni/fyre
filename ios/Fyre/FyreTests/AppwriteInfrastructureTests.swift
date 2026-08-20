import Foundation
import XCTest
@testable import Fyre

@MainActor
final class AppwriteInfrastructureTests: XCTestCase {
    func testConfigurationRejectsTemplatePlaceholders() {
        var values = validConfigurationValues()
        values["APPWRITE_PROJECT_ID"] = "<APPWRITE_PROJECT_ID>"

        XCTAssertThrowsError(try AppwriteConfiguration.load(dictionary: values)) { error in
            guard let configurationError = error as? AppwriteConfigurationError,
                  case let .missingValue(key) = configurationError else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertEqual(key, "APPWRITE_PROJECT_ID")
        }
    }

    func testConfigurationRejectsUnsupportedEndpointScheme() {
        var values = validConfigurationValues()
        values["APPWRITE_PUBLIC_ENDPOINT"] = "file:///tmp/appwrite"

        XCTAssertThrowsError(try AppwriteConfiguration.load(dictionary: values)) { error in
            guard let configurationError = error as? AppwriteConfigurationError,
                  case .invalidEndpoint = configurationError else {
                return XCTFail("Unexpected error: \(error)")
            }
        }
    }

    func testConfigurationRejectsRemoteHTTP() {
        var values = validConfigurationValues()
        values["APPWRITE_PUBLIC_ENDPOINT"] = "http://example.test/v1"

        XCTAssertThrowsError(try AppwriteConfiguration.load(dictionary: values))
    }

    func testConfigurationAllowsLoopbackHTTP() throws {
        var values = validConfigurationValues()
        values["APPWRITE_PUBLIC_ENDPOINT"] = "http://127.0.0.1:8080/v1"

        let configuration = try AppwriteConfiguration.load(dictionary: values)

        XCTAssertEqual(configuration.endpointURL.absoluteString, "http://127.0.0.1:8080/v1")
    }

    func testConfigurationRejectsRemoteHTTPFunctionDomain() {
        var values = validConfigurationValues()
        values["APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN"] = "http://functions.example.test"

        XCTAssertThrowsError(try AppwriteConfiguration.load(dictionary: values))
    }

    func testConfigurationRejectsEndpointQueryAndFragment() {
        for endpoint in [
            "https://appwrite.example.test/v1?project=attacker",
            "https://appwrite.example.test/v1#unexpected"
        ] {
            var values = validConfigurationValues()
            values["APPWRITE_PUBLIC_ENDPOINT"] = endpoint
            XCTAssertThrowsError(try AppwriteConfiguration.load(dictionary: values), endpoint)
        }
    }

    func testConfigurationRejectsFunctionDomainQueryFragmentAndUserInfo() {
        for domain in [
            "https://functions.example.test?type=json",
            "https://functions.example.test#unexpected",
            "https://user:secret@functions.example.test"
        ] {
            var values = validConfigurationValues()
            values["APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN"] = domain
            XCTAssertThrowsError(try AppwriteConfiguration.load(dictionary: values), domain)
        }
    }

    func testConfigurationReportsMissingRequiredFunctionIdentifier() {
        var values = validConfigurationValues()
        values.removeValue(forKey: "APPWRITE_MANAGE_PROFILE_FUNCTION_ID")

        XCTAssertThrowsError(try AppwriteConfiguration.load(dictionary: values)) { error in
            guard let configurationError = error as? AppwriteConfigurationError,
                  case let .missingValue(key) = configurationError else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertEqual(key, "APPWRITE_MANAGE_PROFILE_FUNCTION_ID")
        }
    }

    func testConfigurationReportsMissingRequiredDiscoveryFunctionIdentifier() {
        var values = validConfigurationValues()
        values.removeValue(forKey: "APPWRITE_DISCOVER_PROFILES_FUNCTION_ID")

        XCTAssertThrowsError(try AppwriteConfiguration.load(dictionary: values)) { error in
            guard let configurationError = error as? AppwriteConfigurationError,
                  case let .missingValue(key) = configurationError else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertEqual(key, "APPWRITE_DISCOVER_PROFILES_FUNCTION_ID")
        }
    }

    func testPaginationUsesCursorAndCollectsEveryPage() {
        var state = AppwritePaginationState()

        XCTAssertEqual(state.nextLimit, 100)
        XCTAssertNil(state.cursorAfter)
        XCTAssertEqual(state.offset, 0)

        state.receive(
            pageCount: 100,
            acceptedCount: state.acceptedCount(for: 100),
            lastRowId: "row-100",
            total: 125,
            requestedLimit: 100
        )

        XCTAssertFalse(state.isComplete)
        XCTAssertEqual(state.loadedCount, 100)
        XCTAssertEqual(state.cursorAfter, "row-100")

        state.receive(
            pageCount: 25,
            acceptedCount: state.acceptedCount(for: 25),
            lastRowId: "row-125",
            total: 125,
            requestedLimit: 100
        )

        XCTAssertTrue(state.isComplete)
        XCTAssertEqual(state.loadedCount, 125)
    }

    func testPaginationFallsBackToOffsetWithoutRowIdentifier() {
        var state = AppwritePaginationState()
        state.receive(
            pageCount: 100,
            acceptedCount: state.acceptedCount(for: 100),
            lastRowId: nil,
            total: 102,
            requestedLimit: 100
        )

        XCTAssertFalse(state.isComplete)
        XCTAssertNil(state.cursorAfter)
        XCTAssertEqual(state.offset, 100)
    }

    func testPaginationStopsWhenBackendRepeatsCursor() {
        var state = AppwritePaginationState()
        state.receive(
            pageCount: 100,
            acceptedCount: 100,
            lastRowId: "row-100",
            total: nil,
            requestedLimit: 100
        )
        state.receive(
            pageCount: 100,
            acceptedCount: 100,
            lastRowId: "row-100",
            total: nil,
            requestedLimit: 100
        )

        XCTAssertTrue(state.isComplete)
    }

    func testPaginationHonorsExplicitMaximum() {
        var state = AppwritePaginationState(maximumRows: 1)

        XCTAssertEqual(state.nextLimit, 1)
        state.receive(
            pageCount: 1,
            acceptedCount: state.acceptedCount(for: 1),
            lastRowId: "row-1",
            total: 50,
            requestedLimit: 1
        )

        XCTAssertTrue(state.isComplete)
        XCTAssertEqual(state.loadedCount, 1)
    }

    func testDiscoveryPaginationAdvancesAcrossEmptyWindows() {
        var state = DiscoveryWindowPaginationState()

        XCTAssertNil(state.beginRequest())
        XCTAssertTrue(state.advanceAfterEmptyPage(nextCursor: "profile-100"))
        XCTAssertEqual(state.beginRequest(), "profile-100")
    }

    func testDiscoveryPaginationStopsOnRepeatedCursor() {
        var state = DiscoveryWindowPaginationState()

        _ = state.beginRequest()
        XCTAssertTrue(state.advanceAfterEmptyPage(nextCursor: "profile-100"))
        _ = state.beginRequest()
        XCTAssertFalse(state.advanceAfterEmptyPage(nextCursor: "profile-100"))
    }

    func testDiscoveryPaginationLimitsEmptyScansToFourWindows() {
        var state = DiscoveryWindowPaginationState()

        for window in 1...4 {
            XCTAssertTrue(state.canRequest)
            _ = state.beginRequest()
            XCTAssertEqual(
                state.advanceAfterEmptyPage(nextCursor: "profile-\(window * 100)"),
                window < 4
            )
        }

        XCTAssertFalse(state.canRequest)
        XCTAssertEqual(state.requestedWindowCount, 4)
    }

    func testAvatarPermissionsAreOwnerOnly() async throws {
        let configuration = try AppwriteConfiguration.load(dictionary: validConfigurationValues())
        let service = AppwriteService(configuration: configuration)

        let permissions = await service.avatarPermissions(ownerUserId: "owner-1")

        XCTAssertEqual(
            permissions,
            [
                "read(\"user:owner-1\")",
                "update(\"user:owner-1\")",
                "delete(\"user:owner-1\")"
            ]
        )
        XCTAssertFalse(permissions.contains("read(\"users\")"))
    }

    func testManageProfilePayloadKeepsIdentityServerManaged() async throws {
        let payload = ManageProfilePayload.upsert([
            "userId": "client-supplied-id",
            "email": "client@example.test",
            "profileReady": true,
            "firstName": "Ada"
        ])

        XCTAssertEqual(payload["firstName"] as? String, "Ada")
        XCTAssertNil(payload["userId"])
        XCTAssertNil(payload["email"])
        XCTAssertNil(payload["profileReady"])
    }

    func testDiscoveryPhotosUseOnlyTokenizedProjectionFields() {
        let urls = DiscoverPhotoProjectionContract.urls(from: [
            "photos": ["https://appwrite.example.test/avatar/view?token=short-lived"],
            "imageUrl": "https://cdn.example.test/fallback.jpg",
            "avatarFileId": "raw-avatar-id",
            "photoFileIds": ["raw-photo-id"]
        ])

        XCTAssertEqual(
            urls.map(\.absoluteString),
            ["https://appwrite.example.test/avatar/view?token=short-lived"]
        )
    }

    func testDiscoveryProfileDTOExposesOnlyProjectedProfileFields() {
        let profile = DiscoverProfileDTO(
            id: "user-b",
            name: "Bea",
            age: 24,
            photos: [],
            compatibilityScore: 80,
            distance: 5,
            commonInterests: ["Musica"],
            bio: "Bio",
            city: "Rome",
            gender: "female",
            intent: "friendship",
            instagramTag: "bea",
            spotifyTag: "bea-music",
            relationshipState: .none
        )
        let fields = Set(Mirror(reflecting: profile).children.compactMap(\.label))

        XCTAssertTrue(fields.isSuperset(of: ["gender", "intent", "instagramTag", "spotifyTag"]))
        XCTAssertTrue(fields.isDisjoint(with: ["orientation", "smokes", "drinks"]))
    }

    func testDiscoveryPhotosNeverBuildURLsFromRawFileIdentifiers() {
        XCTAssertEqual(
            DiscoverPhotoProjectionContract.urls(from: [
                "avatarFileId": "raw-avatar-id",
                "photoFileIds": ["raw-photo-id"]
            ]),
            []
        )
    }

    func testDiscoveryPhotosRejectUntokenizedAndInsecureURLs() {
        XCTAssertEqual(
            DiscoverPhotoProjectionContract.urls(from: [
                "photos": [
                    "https://appwrite.example.test/avatar/view",
                    "http://remote.example.test/avatar/view?token=secret"
                ]
            ]),
            []
        )
    }

    func testManageProfilePresencePayloadMatchesContract() async throws {
        let payload = ManageProfilePayload.presence(isOnline: false)

        XCTAssertEqual(payload.count, 2)
        XCTAssertEqual(payload["action"] as? String, "presence")
        XCTAssertEqual(payload["online"] as? Bool, false)
    }

    func testEventCountersComeFromServerEventRow() {
        let counters = EventServerCounters(eventRow: [
            "maleCount": 17,
            "femaleCount": NSNumber(value: 19),
            "waitingListCount": "4"
        ])

        XCTAssertEqual(counters.maleCount, 17)
        XCTAssertEqual(counters.femaleCount, 19)
        XCTAssertEqual(counters.waitingListCount, 4)
    }

    func testMissingEventCountersDoNotUseRegistrationFallbacks() {
        let counters = EventServerCounters(eventRow: [
            "maleCount": -1
        ])

        XCTAssertEqual(counters.maleCount, 0)
        XCTAssertEqual(counters.femaleCount, 0)
        XCTAssertEqual(counters.waitingListCount, 0)
    }

    func testEventAdminRequiresExplicitAuthenticatedBootstrapTrue() {
        XCTAssertTrue(EventAdminBootstrapAuthorization.isAuthorized(["isAdmin": true]))
        XCTAssertFalse(EventAdminBootstrapAuthorization.isAuthorized([:]))
        XCTAssertFalse(EventAdminBootstrapAuthorization.isAuthorized(["isAdmin": false]))
        XCTAssertFalse(EventAdminBootstrapAuthorization.isAuthorized(["email": "admin@example.test"]))
    }

    func testEventAdminDraftContainsNoAuthorizationScope() {
        let draft = EventAdminDraft(
            title: "Event",
            startsAt: Date(timeIntervalSince1970: 1_800_000_000),
            maxParticipants: 48,
            maleLimit: 24,
            femaleLimit: 24,
            registrationClosesAt: nil,
            cancellationClosesAt: nil
        )
        let fieldNames = Mirror(reflecting: draft).children.compactMap(\.label)

        XCTAssertFalse(fieldNames.contains { $0.localizedCaseInsensitiveContains("admin") })
    }

    func testEventAdminParticipantPaginationCollectsBoundedPages() throws {
        var accumulator = EventAdminParticipantPageAccumulator()
        let firstParticipants: [[String: Any]] = (1...100).map { index in
            ["registrationId": "registration-\(index)"]
        }

        let nextCursor = try accumulator.append([
            "participants": firstParticipants,
            "participantPage": [
                "nextCursor": "registration-100",
                "total": 101
            ]
        ])
        XCTAssertEqual(nextCursor, "registration-100")
        XCTAssertEqual(accumulator.participantCount, 100)

        let finalCursor = try accumulator.append([
            "participants": [["registrationId": "registration-101"] as [String: Any]],
            "participantPage": [
                "nextCursor": NSNull(),
                "total": 101
            ]
        ])
        XCTAssertNil(finalCursor)
        XCTAssertEqual(accumulator.participantCount, 101)
    }

    func testEventAdminParticipantPaginationRejectsRepeatedCursor() throws {
        var accumulator = EventAdminParticipantPageAccumulator()
        let page: [String: Any] = [
            "participants": [[String: Any]](),
            "participantPage": ["nextCursor": "repeated-cursor", "total": 2]
        ]

        XCTAssertEqual(try accumulator.append(page), "repeated-cursor")
        XCTAssertThrowsError(try accumulator.append(page))
    }

    func testEventAdminParticipantPaginationRejectsRosterBeyondCap() {
        var accumulator = EventAdminParticipantPageAccumulator()

        XCTAssertThrowsError(try accumulator.append([
            "participants": [[String: Any]](),
            "participantPage": ["nextCursor": "cursor", "total": 1_001]
        ]))
    }

    func testThreadParticipantMarkReadPayloadMatchesFunctionContract() throws {
        let payload = try ThreadParticipantUpdatePayload.make(
            threadId: "thread-1",
            markRead: true
        )

        XCTAssertEqual(payload.count, 3)
        XCTAssertEqual(payload["action"] as? String, "updateParticipant")
        XCTAssertEqual(payload["threadId"] as? String, "thread-1")
        XCTAssertEqual(payload["markRead"] as? Bool, true)
        assertForbiddenParticipantFieldsAreAbsent(payload)
    }

    func testChatPeerProjectionConsumesOnlyServerAvatarURL() {
        let projection = ChatPeerProjectionContract.parse(
            response: [
                "threadId": "thread-1",
                "peer": [
                    "userId": "user-b",
                    "displayName": "Bea Rossi",
                    "avatarUrl": "https://appwrite.example.test/avatar/view?token=short-lived",
                    "avatarFileId": "raw-avatar-id",
                    "photoFileIds": ["raw-photo-id"],
                    "presenceUpdatedAt": "2030-01-02T03:04:05Z"
                ]
            ],
            expectedThreadId: "thread-1",
            expectedUserId: "user-b"
        )

        XCTAssertEqual(projection?.displayName, "Bea Rossi")
        XCTAssertEqual(
            projection?.avatarURL,
            "https://appwrite.example.test/avatar/view?token=short-lived"
        )
    }

    func testChatPeerProjectionNeverBuildsURLFromRawFileIdentifiers() {
        let projection = ChatPeerProjectionContract.parse(
            response: [
                "threadId": "thread-1",
                "peer": [
                    "userId": "user-b",
                    "displayName": "Bea",
                    "avatarFileId": "raw-avatar-id",
                    "photoFileIds": ["raw-photo-id"]
                ]
            ],
            expectedThreadId: "thread-1",
            expectedUserId: "user-b"
        )

        XCTAssertNotNil(projection)
        XCTAssertNil(projection?.avatarURL)
    }

    func testChatPeerProjectionRejectsUntokenizedAvatarURL() {
        let projection = ChatPeerProjectionContract.parse(
            response: [
                "threadId": "thread-1",
                "peer": [
                    "userId": "user-b",
                    "displayName": "Bea",
                    "avatarUrl": "https://appwrite.example.test/avatar/view"
                ]
            ],
            expectedThreadId: "thread-1",
            expectedUserId: "user-b"
        )

        XCTAssertNotNil(projection)
        XCTAssertNil(projection?.avatarURL)
    }

    func testChatPeerProjectionRejectsMismatchedIdentity() {
        XCTAssertNil(
            ChatPeerProjectionContract.parse(
                response: [
                    "threadId": "thread-2",
                    "peer": [
                        "userId": "attacker",
                        "displayName": "Attacker",
                        "avatarUrl": "https://example.test/avatar"
                    ]
                ],
                expectedThreadId: "thread-1",
                expectedUserId: "user-b"
            )
        )
    }

    func testThreadParticipantPreferencesExposeOnlyMutableFields() throws {
        let payload = try ThreadParticipantUpdatePayload.make(
            threadId: "thread-2",
            notificationsEnabled: false,
            pinned: true
        )

        XCTAssertEqual(payload["notificationsEnabled"] as? Bool, false)
        XCTAssertEqual(payload["pinned"] as? Bool, true)
        assertForbiddenParticipantFieldsAreAbsent(payload)
    }

    func testThreadParticipantUpdateRequiresAtLeastOneField() {
        XCTAssertThrowsError(
            try ThreadParticipantUpdatePayload.make(threadId: "thread-3")
        )
    }

    private func assertForbiddenParticipantFieldsAreAbsent(_ payload: [String: Any]) {
        ["currentUserId", "userId", "role", "lastReadAt", "muted"].forEach { field in
            XCTAssertNil(payload[field])
        }
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
