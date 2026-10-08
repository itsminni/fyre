import XCTest
@testable import Fyre

@MainActor
final class IOSRegressionTests: XCTestCase {
    func testBoundedReadAcceptsExactLimitAndRejectsLargerAndEmptyFiles() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        let data = Data(repeating: 42, count: 128)
        try data.write(to: url)
        XCTAssertEqual(try BoundedAttachment.read(url, limit: 128), data)
        XCTAssertThrowsError(try BoundedAttachment.read(url, limit: 127)) {
            guard case AttachmentReadError.tooLarge = $0 else { return XCTFail("Unexpected error: \($0)") }
        }
        try Data().write(to: url)
        XCTAssertThrowsError(try BoundedAttachment.read(url)) {
            guard case AttachmentReadError.empty = $0 else { return XCTFail("Unexpected error: \($0)") }
        }
    }

    func testBoundedReadRejectsMissingFileAndDirectory() {
        XCTAssertThrowsError(try BoundedAttachment.read(URL(fileURLWithPath: "/missing-fyre-file")))
        XCTAssertThrowsError(try BoundedAttachment.read(FileManager.default.temporaryDirectory))
    }

    func testUncertainWriteFailuresNeverTriggerDestructiveCleanup() {
        for status in [408, 409, 429, 500, 502, 503, 504] {
            XCTAssertFalse(isDefinitiveWriteRejection(AppwriteServiceError.api(statusCode: status, message: nil, type: nil)))
        }
        XCTAssertFalse(isDefinitiveWriteRejection(URLError(.timedOut)))
        XCTAssertFalse(isDefinitiveWriteRejection(CancellationError()))
        XCTAssertFalse(isDefinitiveWriteRejection(AppwriteServiceError.invalidResponse))
        XCTAssertFalse(isDefinitiveWriteRejection(AppwriteServiceError.api(statusCode: 403, message: nil, type: nil)))
        XCTAssertTrue(isDefinitiveWriteRejection(AppwriteServiceError.api(statusCode: 400, message: nil, type: "function")))
    }

    // Async XCTest supplies the task context required by actor-isolated deinitializers.
    func testBootstrapFailureBlocksCachedLoginUntilRetrySucceeds() async {
        let router = AppRouter()
        router.completeBootstrap(isLoggedIn: true, failure: .unavailable)
        XCTAssertEqual(router.root, .bootstrapFailed(.unavailable))
        router.sync(isLoggedIn: true)
        XCTAssertEqual(router.root, .bootstrapFailed(.unavailable))
        router.beginBootstrap()
        XCTAssertEqual(router.root, .loading)
        router.completeBootstrap(isLoggedIn: true)
        XCTAssertEqual(router.root, .main)
    }

    func testInvalidConfigurationDoesNotOpenLogin() async {
        let router = AppRouter()
        router.completeBootstrap(isLoggedIn: false, failure: .configuration)
        router.sync(isLoggedIn: false)
        XCTAssertEqual(router.root, .bootstrapFailed(.configuration))
    }

    func testMutationGateKeepsSecondWriteBehindSuspendedFirstWrite() async {
        let gate = AsyncOperationGate()
        var stored = "old"
        await gate.acquire()
        let second = Task {
            await gate.acquire()
            defer { gate.release() }
            XCTAssertEqual(stored, "first")
            stored = "second"
        }
        await Task.yield()
        XCTAssertEqual(stored, "old")
        stored = "first"
        gate.release()
        await second.value
        XCTAssertEqual(stored, "second")
    }

    func testTokenArrivingAfterLoginRegistersWithoutAnotherLogin() async {
        let service = PushServiceSpy()
        let coordinator = PushNotificationCoordinator(service: service, providerId: "provider", retryDelay: { _ in })
        await coordinator.sync(currentUserId: UUID().uuidString)
        let initialCount = await service.registrationCount
        XCTAssertEqual(initialCount, 0)
        coordinator.updateDeviceToken(Data([1, 2, 255]))
        // Await the work scheduled by the token callback without changing identity.
        await eventually { await service.registrationCount == 1 }
        let identifiers = await service.identifiers
        XCTAssertEqual(identifiers, ["0102ff"])
    }

    func testPushRetriesTransientFailureAndDoesNotDuplicateSuccessfulSync() async {
        let service = PushServiceSpy(failures: 1)
        let coordinator = PushNotificationCoordinator(service: service, providerId: "provider", retryDelay: { _ in })
        coordinator.updateDeviceToken(Data([3]))
        let userId = UUID().uuidString
        await coordinator.sync(currentUserId: userId)
        await coordinator.sync(currentUserId: userId)
        let count = await service.registrationCount
        XCTAssertEqual(count, 2)
    }

    func testDisablingPushAndLogoutRemoveTarget() async {
        let service = PushServiceSpy()
        let coordinator = PushNotificationCoordinator(service: service, providerId: "provider", retryDelay: { _ in })
        let userId = UUID().uuidString
        coordinator.updateDeviceToken(Data([7]))
        await coordinator.sync(currentUserId: userId)
        await coordinator.sync(currentUserId: userId, enabled: false)
        let disabledCount = await service.deletedIds.count
        XCTAssertEqual(disabledCount, 1)
        await coordinator.sync(currentUserId: userId, enabled: true)
        await coordinator.unregister()
        let logoutCount = await service.deletedIds.count
        XCTAssertEqual(logoutCount, 2)
    }

    func testChangingAccountUsesDifferentPushTarget() async {
        let service = PushServiceSpy()
        let coordinator = PushNotificationCoordinator(service: service, providerId: "provider", retryDelay: { _ in })
        coordinator.updateDeviceToken(Data([9]))
        await coordinator.sync(currentUserId: UUID().uuidString)
        await coordinator.unregister()
        await coordinator.sync(currentUserId: UUID().uuidString)
        let ids = await service.targetIds
        XCTAssertEqual(Set(ids).count, 2)
    }

    private func eventually(_ condition: () async -> Bool) async {
        for _ in 0..<100 {
            if await condition() { return }
            await Task.yield()
        }
        XCTFail("Expected asynchronous operation to complete")
    }

}

private actor PushServiceSpy: PushTargetService {
    var registrationCount = 0
    var identifiers: [String] = []
    var targetIds: [String] = []
    var deletedIds: [String] = []
    var failures: Int

    init(failures: Int = 0) { self.failures = failures }

    func upsertPushTarget(targetId: String, identifier: String, providerId: String) async throws {
        registrationCount += 1
        if failures > 0 {
            failures -= 1
            throw URLError(.timedOut)
        }
        identifiers.append(identifier)
        targetIds.append(targetId)
    }

    func deletePushTarget(targetId: String) async throws { deletedIds.append(targetId) }
}
