import Foundation
import XCTest
@testable import Fyre

@MainActor
final class ChatInboxTests: XCTestCase {
    override func tearDown() {
        InboxURLProtocol.recorder = nil
        super.tearDown()
    }

    func testInboxLoadsOnlyLatestMessagesAndBatchesParticipants() async throws {
        let recorder = InboxRecorder(threadCount: 3)
        let service = try makeService(recorder)
        let threads = try await service.fetchThreads()
        XCTAssertEqual(threads.map(\.remoteId), ["thread-2", "thread-1", "thread-3"])
        XCTAssertEqual(threads.map { $0.messages.count }, [1, 1, 0])
        XCTAssertEqual(recorder.participantBatches, [["thread-1", "thread-2", "thread-3"]])
        XCTAssertEqual(recorder.messageLimits, [1, 1, 1])
        XCTAssertEqual(recorder.replyLookups, 0)
        let attachmentThread = try XCTUnwrap(threads.first { $0.remoteId == "thread-1" })
        XCTAssertEqual(attachmentThread.messages.first?.attachment?.name, "notes.pdf")
        XCTAssertEqual(attachmentThread.messages.first?.messageType, .file)
        XCTAssertEqual(attachmentThread.olderMessagesCursor, "last-thread-1")
        XCTAssertEqual(attachmentThread.remoteUnreadCount, 120)
        XCTAssertFalse(attachmentThread.notificationsEnabled)
        XCTAssertEqual(attachmentThread.name, "Peer 1")
        XCTAssertNotNil(attachmentThread.otherParticipantReadAt)
        XCTAssertTrue(threads.last!.messages.isEmpty, "New matches must remain distinguishable from chats with messages")
        XCTAssertNil(threads.last!.olderMessagesCursor)
    }

    func testParticipantBatchesRemainBoundedForLargeInbox() async throws {
        let recorder = InboxRecorder(threadCount: 51)
        let threads = try await makeService(recorder).fetchThreads()
        XCTAssertEqual(threads.count, 51)
        XCTAssertEqual(recorder.participantBatches.map(\.count), [50, 1])
        XCTAssertEqual(Set(recorder.participantBatches.flatMap { $0 }).count, 51)
        XCTAssertTrue(recorder.messageLimits.allSatisfy { $0 == 1 })
    }

    func testMembershipRemovedBetweenReadsDoesNotProduceInboxRow() async throws {
        let recorder = InboxRecorder(threadCount: 3, removedThread: "thread-2")
        let threads = try await makeService(recorder).fetchThreads()
        XCTAssertEqual(Set(threads.map(\.remoteId)), ["thread-1", "thread-3"])
        XCTAssertEqual(recorder.messageLimits.count, 2)
    }

    func testOpeningThreadStillFetchesFullFirstHistoryPage() async throws {
        let recorder = InboxRecorder(threadCount: 1)
        let service = try makeService(recorder)
        let thread = try await service.fetchThreadDTO(threadId: "thread-1")
        XCTAssertEqual(thread?.messages.count, 50)
        XCTAssertEqual(recorder.messageLimits, [51])
        XCTAssertEqual(thread?.olderMessagesCursor, "older-49")
    }

    func testEmptyInboxDoesNotMakePerThreadRequests() async throws {
        let recorder = InboxRecorder(threadCount: 0)
        let threads = try await makeService(recorder).fetchThreads()
        XCTAssertTrue(threads.isEmpty)
        XCTAssertTrue(recorder.participantBatches.isEmpty)
        XCTAssertTrue(recorder.messageLimits.isEmpty)
    }

    func testOpeningPreviewAdvancesCursorToFullPageBoundary() {
        let preview = [message(100)]
        let page = (51...100).map { message($0) }
        XCTAssertEqual(ChatHistoryPagination.cursorAfterRefresh(current: preview, currentCursor: "100", refreshed: page, refreshedCursor: "51"), "51")
    }

    func testRefreshKeepsCursorOfOlderPagesLoadedDuringRequest() {
        let current = (1...100).map { message($0) }
        let page = (51...100).map { message($0) }
        XCTAssertEqual(ChatHistoryPagination.cursorAfterRefresh(current: current, currentCursor: "1", refreshed: page, refreshedCursor: "51"), "1")
        XCTAssertNil(ChatHistoryPagination.cursorAfterRefresh(current: current, currentCursor: nil, refreshed: page, refreshedCursor: "51"))
        XCTAssertNil(ChatHistoryPagination.cursorAfterRefresh(current: [message(100)], currentCursor: "100", refreshed: page, refreshedCursor: nil))
    }

    private func message(_ number: Int) -> ChatMessage {
        ChatMessage(id: UUID(), remoteId: "\(number)", text: "Message", messageType: .text,
                    attachment: nil, isMe: false, time: "12:00", sentAt: Date(timeIntervalSince1970: Double(number)))
    }
    private func makeService(_ recorder: InboxRecorder) throws -> AppwriteService {
        InboxURLProtocol.recorder = recorder
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [InboxURLProtocol.self]
        var values: [String: Any] = [:]
        for key in ["PROJECT_ID", "PROFILES_TABLE_ID", "AVATARS_BUCKET_ID", "EVENTS_TABLE_ID", "EVENT_REGISTRATIONS_TABLE_ID",
                    "THREADS_TABLE_ID", "THREAD_PARTICIPANTS_TABLE_ID", "SWIPES_TABLE_ID", "MATCHES_TABLE_ID", "RELATIONSHIPS_TABLE_ID",
                    "REGISTER_FOR_EVENT_FUNCTION_ID", "CANCEL_EVENT_REGISTRATION_FUNCTION_ID", "MANAGE_PROFILE_FUNCTION_ID",
                    "CREATE_OR_GET_THREAD_FUNCTION_ID", "RECORD_SWIPE_FUNCTION_ID", "DISCOVER_PROFILES_FUNCTION_ID", "MANAGE_RELATIONSHIP_FUNCTION_ID"] {
            values["APPWRITE_" + key] = key.lowercased()
        }
        values["APPWRITE_PUBLIC_ENDPOINT"] = "https://example.test/v1"
        values["APPWRITE_DATABASE_ID"] = "db"
        values["APPWRITE_MESSAGES_TABLE_ID"] = "messages"
        values["APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID"] = "attachments"
        values["APPWRITE_SEND_MESSAGE_FUNCTION_ID"] = "sendmessage"
        return AppwriteService(configuration: try AppwriteConfiguration.load(dictionary: values), session: URLSession(configuration: sessionConfiguration))
    }
}

private final class InboxRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private let threadCount: Int
    private let removedThread: String?
    nonisolated(unsafe) private var batches: [[String]] = []
    nonisolated(unsafe) private var limits: [Int] = []
    nonisolated(unsafe) private var replies = 0
    init(threadCount: Int, removedThread: String? = nil) { self.threadCount = threadCount; self.removedThread = removedThread }
    nonisolated var participantBatches: [[String]] { lock.withLock { batches } }
    nonisolated var messageLimits: [Int] { lock.withLock { limits } }
    nonisolated var replyLookups: Int { lock.withLock { replies } }

    nonisolated func response(to request: URLRequest) throws -> (Int, Data) {
        try lock.withLock {
            let path = request.url!.path
            if path == "/v1/account" { return try json(["$id": "user-a"]) }
            if path.contains("/functions/") {
                let envelope = try JSONSerialization.jsonObject(with: requestBody(request)) as! [String: Any]
                let body = try JSONSerialization.jsonObject(with: Data((envelope["body"] as! String).utf8)) as! [String: Any]
                let number = String((body["otherUserId"] as! String).dropFirst(5))
                return try json(["$id": "execution", "status": "completed", "responseStatusCode": 200,
                                 "responseBody": ["threadId": "thread-\(number)", "peer": ["userId": "peer-\(number)", "displayName": "Peer \(number)"]]], status: 201)
            }
            let queries = try (URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems ?? [])
                .filter { $0.name == "queries[]" }.map { try JSONSerialization.jsonObject(with: Data($0.value!.utf8)) as! [String: Any] }
            func values(_ method: String, _ attribute: String? = nil) -> [Any]? {
                queries.first { $0["method"] as? String == method && (attribute == nil || $0["attribute"] as? String == attribute) }?["values"] as? [Any]
            }
            let limit = values("limit")!.first as! Int
            if path.contains("/thread_participants_table_id/") {
                let threadIds = (values("equal", "threadId") as? [String])
                if let threadIds { batches.append(threadIds) }
                let ids = threadIds ?? (0..<threadCount).map { "thread-\($0 + 1)" }
                var rows: [[String: Any]] = []
                for id in ids {
                    let number = String(id.dropFirst(7))
                    if threadIds == nil || id != removedThread {
                        rows.append(["$id": "self-\(id)", "threadId": id, "userId": "user-a", "createdAt": "2026-01-01T00:00:00.000Z",
                                     "lastReadAt": "2026-01-02T00:00:00.000Z", "notificationsEnabled": id != "thread-1"])
                    }
                    if threadIds != nil {
                        rows.append(["$id": "other-\(id)", "threadId": id, "userId": "peer-\(number)", "lastReadAt": "2026-01-03T00:00:00.000Z"])
                    }
                }
                let cursor = values("cursorAfter")?.first as? String
                let start = cursor.flatMap { id in rows.firstIndex { $0["$id"] as? String == id }.map { $0 + 1 } } ?? 0
                return try json(["rows": Array(rows.dropFirst(start).prefix(limit)), "total": rows.count])
            }
            if path.contains("/messages/") {
                let id = (values("equal", "threadId")!.first as! String)
                if values("equal", "senderUserId") != nil {
                    return try json(["rows": [], "total": id == "thread-3" ? 0 : 120])
                }
                if values("equal", "$id") != nil {
                    replies += 1
                    return try json(["rows": [], "total": 0])
                }
                limits.append(limit)
                if id == "thread-3" { return try json(["rows": [], "total": 0]) }
                var row: [String: Any] = ["$id": "last-\(id)", "threadId": id, "senderUserId": "peer-\(id.dropFirst(7))", "text": "Latest",
                                         "messageType": "text", "createdAt": id == "thread-2" ? "2026-02-02T12:00:00.000Z" : "2026-02-01T12:00:00.000Z"]
                if id == "thread-1" {
                    row["text"] = ""
                    row["messageType"] = "file"
                    row["attachmentFileId"] = "file-1"
                    row["attachmentName"] = "notes.pdf"
                    row["replyToMessageId"] = "outside-page"
                }
                let rows = (0..<limit).map { index in
                    var message = row
                    if index > 0 { message["$id"] = "older-\(index)" }
                    return message
                }
                return try json(["rows": rows, "total": 120])
            }
            throw URLError(.badURL)
        }
    }

    nonisolated private func json(_ payload: [String: Any], status: Int = 200) throws -> (Int, Data) {
        (status, try JSONSerialization.data(withJSONObject: payload))
    }

    nonisolated private func requestBody(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var body = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            body.append(contentsOf: buffer.prefix(count))
        }
        return body
    }
}

private final class InboxURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var recorder: InboxRecorder?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, data) = try Self.recorder!.response(to: request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
