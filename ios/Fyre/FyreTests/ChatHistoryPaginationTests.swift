import Foundation
import XCTest
@testable import Fyre

@MainActor
final class ChatHistoryPaginationTests: XCTestCase {
    override func tearDown() {
        HistoryURLProtocol.recorder = nil
        super.tearDown()
    }

    func testPagesAreBoundedChronologicalAndDoNotSkipLookaheadRow() async throws {
        let recorder = HistoryRecorder(count: 120)
        let service = try makeService(recorder)
        var page = try await service.fetchMessagePage(threadId: "thread-1", currentAccountId: "user-a")
        XCTAssertEqual(page.messages.count, 50)
        XCTAssertEqual(page.messages.first?.remoteId, "m071")
        XCTAssertEqual(page.messages.last?.remoteId, "m120")
        XCTAssertEqual(page.nextCursor, "m071")
        var ids = page.messages.map(\.remoteId)
        while let cursor = page.nextCursor {
            page = try await service.fetchMessagePage(threadId: "thread-1", before: cursor)
            ids += page.messages.map(\.remoteId)
        }
        XCTAssertEqual(ids.count, 120)
        XCTAssertEqual(Set(ids).count, 120)
        XCTAssertEqual(recorder.historyQueries.count, 3)
        for queries in recorder.historyQueries {
            XCTAssertEqual(values("limit", in: queries) as? [Int], [51])
            XCTAssertEqual(queries.filter { $0["method"] as? String == "orderDesc" }.compactMap { $0["attribute"] as? String }, ["createdAt", "$id"])
            XCTAssertFalse(queries.contains { $0["method"] as? String == "offset" })
        }
    }

    func testExactPageAndEmptyThreadHaveNoExtraPage() async throws {
        for count in [0, 50] {
            let recorder = HistoryRecorder(count: count)
            let service = try makeService(recorder)
            let page = try await service.fetchMessagePage(threadId: "thread-1", currentAccountId: "user-a")
            XCTAssertNil(page.nextCursor)
            XCTAssertEqual(page.messages.count, count)
            XCTAssertEqual(recorder.historyQueries.count, 1)
        }
    }

    func testReplyOutsidePageIsFetchedByIDWithoutLoadingHistory() async throws {
        let recorder = HistoryRecorder(count: 120, reply: true)
        let service = try makeService(recorder)
        let page = try await service.fetchMessagePage(threadId: "thread-1", currentAccountId: "user-a")
        XCTAssertEqual(page.messages.last?.replyPreviewText, "Message 1")
        XCTAssertEqual(recorder.historyQueries.count, 1)
        let queries = try XCTUnwrap(recorder.replyQueries.first)
        XCTAssertEqual(values("equal", attribute: "$id", in: queries) as? [String], ["m001"])
        XCTAssertEqual(values("equal", attribute: "threadId", in: queries) as? [String], ["thread-1"])
    }

    func testUnreadCountUsesServerTotalAndReadBoundaryWithoutDrainingRows() async throws {
        let recorder = HistoryRecorder(count: 120)
        let service = try makeService(recorder)
        let count = try await service.fetchUnreadMessageCount(threadId: "thread-1", senderId: "user-b", readAt: Date(timeIntervalSince1970: 1_700_000_000))
        XCTAssertEqual(count, 120)
        let queries = try XCTUnwrap(recorder.countQueries.first)
        XCTAssertEqual(values("limit", in: queries) as? [Int], [1])
        XCTAssertEqual(values("equal", attribute: "senderUserId", in: queries) as? [String], ["user-b"])
        XCTAssertEqual(values("greaterThan", attribute: "createdAt", in: queries) as? [String], ["2023-11-14T22:13:20.000Z"])
    }

    func testInsertionBetweenPageRequestsDoesNotShiftOlderCursor() async throws {
        let recorder = HistoryRecorder(count: 120)
        let service = try makeService(recorder)
        let latest = try await service.fetchMessagePage(threadId: "thread-1", currentAccountId: "user-a")
        recorder.insertNewMessage()
        let older = try await service.fetchMessagePage(threadId: "thread-1", before: XCTUnwrap(latest.nextCursor))
        XCTAssertEqual(older.messages.first?.remoteId, "m021")
        XCTAssertEqual(older.messages.last?.remoteId, "m070")
        XCTAssertTrue(Set(latest.messages.map(\.remoteId)).isDisjoint(with: older.messages.map(\.remoteId)))
    }

    func testRecentRefreshKeepsLoadedIncomingHistoryAndNewRealtimeMessage() {
        let local = [message(1), message(2), message(3), message(4)]
        let merged = ChatHistoryPagination.mergeRecent([message(3)], into: local, hasOlder: true, userId: "user-a", threadId: "thread-1")
        XCTAssertEqual(merged.map(\.remoteId), local.map(\.remoteId))
    }

    func testRefreshRemovesDeletedMessagesOnlyWithinFetchedWindow() {
        let merged = ChatHistoryPagination.mergeRecent([message(3), message(5)], into: (1...5).map { message($0) }, hasOlder: true, userId: nil, threadId: "thread-1")
        XCTAssertEqual(merged.map(\.remoteId), ["m001", "m002", "m003", "m005"])
        let complete = ChatHistoryPagination.mergeRecent([message(3), message(5)], into: (1...5).map { message($0) }, hasOlder: false, userId: nil, threadId: "thread-1")
        XCTAssertEqual(complete.map(\.remoteId), ["m003", "m005"])
    }

    func testPaginationMergeReconcilesOptimisticOperationExactlyOnce() {
        let operation = UUID()
        let local = message(1, id: "local-\(operation.uuidString)", isMe: true)
        let confirmedID = OutgoingMessageAttempt.remoteMessageId(userId: "user-a", threadId: "thread-1", operationId: operation)
        let confirmed = message(1, id: confirmedID, isMe: true)
        let merged = ChatHistoryPagination.mergeRecent([confirmed], into: [local], hasOlder: true, userId: "user-a", threadId: "thread-1")
        XCTAssertEqual(merged, [confirmed])
    }

    func testPrependDeduplicatesAndKeepsNewerRealtimeVersionAtEqualTimestamp() {
        let older = [message(1, id: "a"), message(1, id: "b")]
        let current = [message(1, id: "b", isMe: true), message(1, id: "c")]
        let merged = ChatHistoryPagination.prepend(older, to: current)
        XCTAssertEqual(merged.map(\.remoteId), ["a", "b", "c"])
        XCTAssertTrue(merged[1].isMe)
    }

    func testBridgeContinuesUntilRecentHistoryReachesPreviouslyLoadedRange() {
        XCTAssertTrue(ChatHistoryPagination.needsBridge(recent: [message(101)], previousNewest: message(20), cursor: "m101"))
        XCTAssertFalse(ChatHistoryPagination.needsBridge(recent: [message(1), message(101)], previousNewest: message(20), cursor: "m001"))
        XCTAssertFalse(ChatHistoryPagination.needsBridge(recent: [message(101)], previousNewest: nil, cursor: "m101"))
        XCTAssertFalse(ChatHistoryPagination.needsBridge(recent: [message(101)], previousNewest: message(20), cursor: nil))
    }

    func testUnreadBadgeCanExceedLoadedPageSize() {
        let thread = ChatThread(id: UUID(), remoteId: "thread-1", name: "Peer", avatar: "", isOnline: false,
                                lastSeenAt: nil, currentUserReadAt: nil, otherParticipantReadAt: nil,
                                participantUserIds: ["user-a", "user-b"], notificationsEnabled: true,
                                relationshipState: .matched, messages: [message(1)], remoteUnreadCount: 120)
        XCTAssertEqual(thread.unreadCount, 120)
    }

    private func values(_ method: String, attribute: String? = nil, in queries: [[String: Any]]) -> Any? {
        queries.first { $0["method"] as? String == method && (attribute == nil || $0["attribute"] as? String == attribute) }?["values"]
    }

    private func message(_ number: Int, id: String? = nil, isMe: Bool = false) -> ChatMessage {
        ChatMessage(id: UUID(), remoteId: id ?? String(format: "m%03d", number), text: "Message", messageType: .text,
                    attachment: nil, isMe: isMe, time: "12:00", sentAt: Date(timeIntervalSince1970: Double(number)))
    }

    private func makeService(_ recorder: HistoryRecorder) throws -> AppwriteService {
        HistoryURLProtocol.recorder = recorder
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [HistoryURLProtocol.self]
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

private final class HistoryRecorder: @unchecked Sendable {
    private let lock = NSLock()
    nonisolated(unsafe) private var count: Int
    private let reply: Bool
    nonisolated(unsafe) private var recordedHistory: [[[String: Any]]] = []
    nonisolated(unsafe) private var recordedReplies: [[[String: Any]]] = []
    nonisolated(unsafe) private var recordedCounts: [[[String: Any]]] = []

    init(count: Int, reply: Bool = false) { self.count = count; self.reply = reply }

    nonisolated var historyQueries: [[[String: Any]]] { lock.withLock { recordedHistory } }
    nonisolated var replyQueries: [[[String: Any]]] { lock.withLock { recordedReplies } }
    nonisolated var countQueries: [[[String: Any]]] { lock.withLock { recordedCounts } }
    nonisolated func insertNewMessage() { lock.withLock { count += 1 } }

    nonisolated func response(to request: URLRequest) throws -> (Int, Data) {
        try lock.withLock {
            if request.url!.path == "/v1/account" { return try json(["$id": "user-a"]) }
            guard request.url!.path.hasSuffix("/tables/messages/rows") else { throw URLError(.badURL) }
            let queries = try URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
                .filter { $0.name == "queries[]" }.map { try JSONSerialization.jsonObject(with: Data($0.value!.utf8)) as! [String: Any] }
            func values(_ method: String, _ attribute: String? = nil) -> [Any]? {
                queries.first { $0["method"] as? String == method && (attribute == nil || $0["attribute"] as? String == attribute) }?["values"] as? [Any]
            }
            let limit = values("limit")!.first as! Int
            if values("equal", "senderUserId") != nil {
                recordedCounts.append(queries)
                return try json(["rows": count > 0 ? [row(1)] : [], "total": count])
            }
            if let ids = values("equal", "$id") as? [String] {
                recordedReplies.append(queries)
                return try json(["rows": ids.map { row(Int($0.dropFirst())!) }, "total": ids.count])
            }
            recordedHistory.append(queries)
            let cursor = (values("cursorAfter")?.first as? String).flatMap { Int($0.dropFirst()) }
            let upper = min(count, cursor.map { $0 - 1 } ?? count)
            let numbers = upper > 0 ? Array(stride(from: upper, through: max(1, upper - limit + 1), by: -1)) : []
            return try json(["rows": numbers.map(row), "total": count])
        }
    }

    nonisolated private func row(_ number: Int) -> [String: Any] {
        var result: [String: Any] = ["$id": String(format: "m%03d", number), "threadId": "thread-1",
                                   "senderUserId": "user-b", "text": "Message \(number)", "messageType": "text",
                                   "createdAt": "2026-09-27T12:00:00.000Z"]
        if reply && number == 120 { result["replyToMessageId"] = "m001" }
        return result
    }

    nonisolated private func json(_ payload: [String: Any]) throws -> (Int, Data) {
        (200, try JSONSerialization.data(withJSONObject: payload))
    }
}

private final class HistoryURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var recorder: HistoryRecorder?
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
