import Foundation
import XCTest
@testable import Fyre

@MainActor
final class EventDiscoveryIntegrationTests: XCTestCase {
    override func tearDown() {
        CatalogURLProtocol.recorder = nil
        super.tearDown()
    }

    func testCatalogSelectsRequestedEventAndIncludesPastRegistrationHistory() async throws {
        let recorder = CatalogRecorder()
        let service = try makeService(recorder)
        let result = try await service.fetchMainEventState(for: nil, selectedEventId: "event-two")
        let state = try XCTUnwrap(result)
        XCTAssertEqual(state.eventId, "event-two")
        XCTAssertEqual(state.snapshot.title, "Second event")
        XCTAssertEqual(state.availableEvents.map(\.id), ["event-one", "event-two"])
        XCTAssertEqual(state.currentStatus, .waitlisted)
        XCTAssertEqual(Set(state.history.compactMap(\.remoteEventId)), ["event-two", "event-past"])
        let status = try await service.registerForMainEvent(for: testUser(), eventId: "event-two")
        XCTAssertEqual(status, .confirmed)
        XCTAssertEqual(recorder.registrationEventId, "event-two")
    }

    func testMissingSelectedEventNeverFallsBackToDifferentEvent() async throws {
        let service = try makeService(CatalogRecorder())
        do { _ = try await service.fetchMainEventState(for: nil, selectedEventId: "deleted-event"); XCTFail("Expected missing event") }
        catch let error as AppwriteServiceError { XCTAssertEqual(error.statusCode, 404) }
    }

    func testPastHistoryRemainsAvailableWithNoUpcomingEvents() async throws {
        let service = try makeService(CatalogRecorder(noUpcoming: true))
        let state = try await service.fetchMainEventState(for: nil)
        XCTAssertNil(state)
        let history = try await service.fetchUserEventHistory(for: nil)
        XCTAssertEqual(history.map(\.remoteEventId), ["event-past"])
    }

    func testDiscoveryKeepsContinuationEvenWhenPageContainsProfiles() async throws {
        let recorder = CatalogRecorder()
        let service = try makeService(recorder)
        let first = try await service.fetchDiscoverPage(after: nil)
        XCTAssertEqual(first.profiles.map(\.id), ["peer-one"])
        XCTAssertEqual(first.nextCursor, "cursor-two")
        let second = try await service.fetchDiscoverPage(after: first.nextCursor)
        XCTAssertTrue(second.profiles.isEmpty)
        XCTAssertNil(second.nextCursor)
        XCTAssertEqual(recorder.discoveryCursors, [nil, "cursor-two"])
    }

    func testCancelledInitialProfileSaveDoesNotStartUploadsOrProfileWrite() async throws {
        let service = try makeService(CatalogRecorder())
        var user = try testUser()
        user.profileImageData = Data([1, 2, 3])
        let control = UploadControl()
        control.cancel()
        do { _ = try await service.updateProfile(for: user, control: control); XCTFail("Expected cancellation") }
        catch { XCTAssertTrue(error is CancellationError) }
    }

    private func makeService(_ recorder: CatalogRecorder) throws -> AppwriteService {
        CatalogURLProtocol.recorder = recorder
        let session = URLSessionConfiguration.ephemeral
        session.protocolClasses = [CatalogURLProtocol.self]
        return AppwriteService(configuration: try AppwriteConfiguration.load(dictionary: CompletionRegressionTests.configurationValues()),
                               session: URLSession(configuration: session))
    }

    private func testUser() throws -> User {
        // Use the same account shell as the service; no persisted login or live backend is required.
        let data = Data(#"{"email":"test@example.test","firstName":"Test","lastName":"User","gender":"male","orientation":"straight","appwriteUserId":"user-a"}"#.utf8)
        return try JSONDecoder().decode(User.self, from: data)
    }
}

private final class CatalogRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private let noUpcoming: Bool
    nonisolated(unsafe) private var savedEventId: String?
    nonisolated(unsafe) private var cursors: [String?] = []
    init(noUpcoming: Bool = false) { self.noUpcoming = noUpcoming }
    nonisolated var registrationEventId: String? { lock.lock(); defer { lock.unlock() }; return savedEventId }
    nonisolated var discoveryCursors: [String?] { lock.lock(); defer { lock.unlock() }; return cursors }

    nonisolated func response(_ request: URLRequest) throws -> [String: Any] {
        lock.lock(); defer { lock.unlock() }
        let path = request.url!.path
        if path == "/v1/account" { return ["$id": "user-a"] }
        let eventOne: [String: Any] = ["$id": "event-one", "title": "First event", "startsAt": "2050-01-01T19:00:00Z"]
        let eventTwo: [String: Any] = ["$id": "event-two", "title": "Second event", "startsAt": "2050-02-01T19:00:00Z"]
        let past: [String: Any] = ["$id": "event-past", "title": "Past event", "startsAt": "2020-01-01T19:00:00Z"]
        if path.hasSuffix("/events-id/rows") {
            let query = request.url!.query?.removingPercentEncoding ?? ""
            let rows = query.contains("event-past") ? [past] : noUpcoming ? [past] : [eventOne, eventTwo, past]
            return ["rows": rows, "total": rows.count]
        }
        if path.hasSuffix("/registrations-id/rows") {
            let query = request.url!.query?.removingPercentEncoding ?? ""
            let pastRegistration: [String: Any] = ["$id": "registration-past", "userId": "user-a", "eventId": "event-past", "status": "confirmed"]
            let current: [String: Any] = ["$id": "registration-two", "userId": "user-a", "eventId": "event-two", "status": "waitlisted"]
            let rows = noUpcoming ? [pastRegistration] : query.contains("eventId") ? [current] : [current, pastRegistration]
            return ["rows": rows, "total": rows.count]
        }
        if path.contains("/executions") {
            let envelope = try JSONSerialization.jsonObject(with: body(request)) as! [String: Any]
            let input = try JSONSerialization.jsonObject(with: Data((envelope["body"] as! String).utf8)) as! [String: Any]
            let output: [String: Any]
            if path.contains("register-id") {
                savedEventId = input["eventId"] as? String
                output = ["status": "confirmed"]
            } else {
                let cursor = input["profileCursor"] as? String
                cursors.append(cursor)
                output = cursor == nil
                    ? ["profiles": [["id": "peer-one", "name": "Peer", "age": 24]], "nextCursor": "cursor-two"]
                    : ["profiles": [[String: Any]](), "nextCursor": NSNull()]
            }
            return ["$id": "execution", "status": "completed", "responseStatusCode": 200, "responseBody": output]
        }
        throw URLError(.unsupportedURL)
    }

    nonisolated private func body(_ request: URLRequest) -> Data {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(contentsOf: buffer.prefix(count))
        }
        return data
    }
}

private final class CatalogURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var recorder: CatalogRecorder?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let object = try Self.recorder!.response(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: request.url!.path.contains("/executions") ? 201 : 200, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: object))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
