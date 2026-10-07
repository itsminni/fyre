import Foundation
import XCTest
@testable import Fyre

@MainActor
final class ProfileUploadTests: XCTestCase {
    override func tearDown() { PhotoURLProtocol.recorder = nil; super.tearDown() }

    func testUncertainProfileWriteRetainsManagedPhoto() async throws {
        let recorder = PhotoRecorder(failWrite: true)
        let service = try service(recorder)
        do { _ = try await service.updateProfileImage(Data([1, 2]), for: user()); XCTFail("Expected lost response") } catch {}
        XCTAssertEqual(recorder.snapshot.uploaded.count, 1)
        XCTAssertTrue(recorder.snapshot.deleted.isEmpty)
        XCTAssertTrue(ManagedAttachmentContract.isManagedProfile(recorder.snapshot.uploaded[0]))
    }

    func testRejectedManagedWriteStillDefersDeletionToTheServerLedger() async throws {
        let recorder = PhotoRecorder(rejectWrite: true)
        let service = try service(recorder)
        do { _ = try await service.updateProfileImage(Data([1]), for: user()); XCTFail("Expected rejection") } catch {}
        XCTAssertEqual(recorder.snapshot.uploaded.count, 1)
        XCTAssertTrue(recorder.snapshot.deleted.isEmpty)
    }

    func testGalleryUsesReservedIDsAndOneProfileWrite() async throws {
        let recorder = PhotoRecorder()
        let service = try service(recorder)
        let saved = try await service.updateProfileImages([Data([1]), Data([2])], for: user())
        XCTAssertEqual(recorder.snapshot.reservations, 2)
        XCTAssertEqual(recorder.snapshot.writes, 1)
        XCTAssertEqual(saved.photoFileIds, recorder.snapshot.uploaded)
        XCTAssertTrue(recorder.snapshot.deleted.isEmpty)
    }

    func testOldBackendCanContinueUploadingLegacyPhotos() async throws {
        let recorder = PhotoRecorder(managed: false)
        let service = try service(recorder)
        _ = try await service.updateProfileImage(Data([1]), for: user())
        XCTAssertEqual(recorder.snapshot.uploaded.count, 1)
        XCTAssertFalse(ManagedAttachmentContract.isManagedProfile(recorder.snapshot.uploaded[0]))
    }

    func testReservationFailureCannotStartStorageUpload() async throws {
        let recorder = PhotoRecorder(failReservation: true)
        let service = try service(recorder)
        do { _ = try await service.updateProfileImage(Data([1]), for: user()); XCTFail("Expected reservation failure") } catch {}
        XCTAssertTrue(recorder.snapshot.uploaded.isEmpty)
        XCTAssertEqual(recorder.snapshot.writes, 0)
    }

    func testReplacingManagedAvatarCannotDeleteAConcurrentProfileReference() async throws {
        let recorder = PhotoRecorder()
        let service = try service(recorder)
        var old = user()
        old.avatarFileId = "p_" + String(repeating: "a", count: 32)
        _ = try await service.updateProfileImage(Data([1]), for: old)
        XCTAssertTrue(recorder.snapshot.deleted.isEmpty)
    }

    private func user() -> User { var user = User(email: "test@example.test"); user.appwriteUserId = "user-a"; return user }
    private func service(_ recorder: PhotoRecorder) throws -> AppwriteService {
        PhotoURLProtocol.recorder = recorder
        let session = URLSessionConfiguration.ephemeral
        session.protocolClasses = [PhotoURLProtocol.self]
        return AppwriteService(configuration: try AppwriteConfiguration.load(dictionary: CompletionRegressionTests.configurationValues()),
                               session: URLSession(configuration: session))
    }
}

private struct PhotoState: Sendable {
    var reservations = 0
    var writes = 0
    var uploaded: [String] = []
    var deleted: [String] = []
}

private final class PhotoRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private let managed: Bool
    private let failWrite: Bool
    private let rejectWrite: Bool
    private let failReservation: Bool
    nonisolated(unsafe) private var state = PhotoState()
    init(managed: Bool = true, failWrite: Bool = false, rejectWrite: Bool = false, failReservation: Bool = false) {
        self.managed = managed; self.failWrite = failWrite; self.rejectWrite = rejectWrite; self.failReservation = failReservation
    }
    nonisolated var snapshot: PhotoState { lock.lock(); defer { lock.unlock() }; return state }
    nonisolated func respond(_ request: URLRequest) throws -> (Int, [String: Any]) {
        lock.lock(); defer { lock.unlock() }
        let path = request.url!.path
        if path == "/v1/account" { return (200, ["$id": "user-a"]) }
        if path.hasSuffix("/functions/manage-profile-id/executions") {
            let envelope = try JSONSerialization.jsonObject(with: body(request)) as! [String: Any]
            let payload = try JSONSerialization.jsonObject(with: Data((envelope["body"] as! String).utf8)) as! [String: Any]
            if payload["action"] as? String == "reserveUpload" {
                state.reservations += 1
                if failReservation { throw URLError(.notConnectedToInternet) }
                return execution(managed ? ["supported": true, "fileId": "p_" + String(format: "%032d", state.reservations)] : ["supported": false])
            }
            state.writes += 1
            if failWrite { throw URLError(.timedOut) }
            if rejectWrite { return execution(["message": "Rejected"], status: 400) }
            return execution(["profileId": "user-a", "profileReady": true])
        }
        if path.contains("/storage/buckets/avatars-id/files") {
            if request.httpMethod == "POST" {
                let text = String(decoding: body(request), as: UTF8.self)
                let id = text.components(separatedBy: "name=\"fileId\"\r\n\r\n").last!.components(separatedBy: "\r\n").first!
                state.uploaded.append(id)
                return (201, ["$id": id])
            }
            if request.httpMethod == "DELETE" { state.deleted.append(request.url!.lastPathComponent); return (204, [:]) }
            return (200, ["$id": request.url!.lastPathComponent, "name": "photo.jpg"])
        }
        return (500, ["message": "Unexpected request"])
    }
    nonisolated private func execution(_ body: [String: Any], status: Int = 200) -> (Int, [String: Any]) {
        (201, ["$id": "execution", "status": "completed", "responseStatusCode": status, "responseBody": body])
    }
    nonisolated private func body(_ request: URLRequest) -> Data {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var result = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; result.append(contentsOf: buffer.prefix(count)) }
        return result
    }
}

private final class PhotoURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var recorder: PhotoRecorder?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, payload) = try Self.recorder!.respond(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: payload))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
