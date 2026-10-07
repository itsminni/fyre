import Foundation
import XCTest
@testable import Fyre

@MainActor
final class MessageSendRetryTests: XCTestCase {
    private let journalScope = "https://example.test/v1|project_id|db|messages|user-a"

    override func setUp() async throws {
        for id in try MessageUploadJournal.load(scope: journalScope).keys {
            try MessageUploadJournal.remove(messageId: id, scope: journalScope)
        }
    }

    override func tearDown() async throws {
        MessageSendURLProtocol.recorder = nil
        for id in try MessageUploadJournal.load(scope: journalScope).keys {
            try MessageUploadJournal.remove(messageId: id, scope: journalScope)
        }
    }

    func testManagedCommittedUploadSurvivesReconciliationAndRestartedRetry() async throws {
        let recorder = MessageSendRecorder(failExecutions: [1], failRecovery: true, managed: true)
        let service = try makeService(recorder)
        let attempt = OutgoingMessageAttempt(draft: .init(text: "", replyToMessageId: nil, attachment: attachment()))
        do { _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt); XCTFail("Expected lost response") } catch {}
        await service.reconcileMessageUploads(accountId: "user-a", now: Date().addingTimeInterval(600))
        XCTAssertEqual(recorder.snapshot.reconciliationCount, 1)
        XCTAssertEqual(recorder.snapshot.deleteCount, 0)
        XCTAssertEqual(try MessageUploadJournal.load(scope: journalScope).count, 1)
        let restarted = try makeService(recorder)
        _ = try await restarted.sendMessage(threadId: "thread-1", attempt: attempt)
        XCTAssertEqual(recorder.snapshot.uploadCount, 1)
        XCTAssertEqual(recorder.snapshot.messageCount, 1)
        XCTAssertTrue(try MessageUploadJournal.load(scope: journalScope).isEmpty)
    }

    func testManagedUncommittedUploadIsDiscardedAfterGraceAndRetryUsesNewFile() async throws {
        let recorder = MessageSendRecorder(failRecovery: true, managed: true, failBeforeWrite: [1])
        let service = try makeService(recorder)
        let attempt = OutgoingMessageAttempt(draft: .init(text: "", replyToMessageId: nil, attachment: attachment()))
        do { _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt); XCTFail("Expected timeout") } catch {}
        await service.reconcileMessageUploads(accountId: "user-a")
        XCTAssertEqual(recorder.snapshot.reconciliationCount, 0)
        await service.reconcileMessageUploads(accountId: "user-a", now: Date().addingTimeInterval(600))
        XCTAssertEqual(recorder.snapshot.deleteCount, 1)
        XCTAssertTrue(try MessageUploadJournal.load(scope: journalScope).isEmpty)
        _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt)
        XCTAssertEqual(Set(recorder.snapshot.uploadedFileIds).count, 2)
        XCTAssertEqual(recorder.snapshot.messageCount, 1)
    }

    func testFailedManagedReconciliationRetainsReceiptAndFile() async throws {
        let recorder = MessageSendRecorder(failRecovery: true, managed: true, failBeforeWrite: [1], failReconciliation: true)
        let service = try makeService(recorder)
        let attempt = OutgoingMessageAttempt(draft: .init(text: "", replyToMessageId: nil, attachment: attachment()))
        do { _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt); XCTFail("Expected timeout") } catch {}
        await service.reconcileMessageUploads(accountId: "user-a", now: Date().addingTimeInterval(600))
        XCTAssertEqual(recorder.snapshot.reconciliationCount, 1)
        XCTAssertEqual(recorder.snapshot.deleteCount, 0)
        XCTAssertEqual(try MessageUploadJournal.load(scope: journalScope).count, 1)
    }

    func testInterruptedManagedUploadIsReconciledBeforeRetryAfterRestart() async throws {
        let recorder = MessageSendRecorder(managed: true, failFirstUpload: true)
        let first = try makeService(recorder)
        let attempt = OutgoingMessageAttempt(draft: .init(text: "", replyToMessageId: nil, attachment: attachment()))
        do { _ = try await first.sendMessage(threadId: "thread-1", attempt: attempt); XCTFail("Expected upload failure") } catch {}
        XCTAssertEqual(try MessageUploadJournal.load(scope: journalScope).values.first?.uploadCompleted, false)
        let restarted = try makeService(recorder)
        _ = try await restarted.sendMessage(threadId: "thread-1", attempt: attempt)
        XCTAssertEqual(recorder.snapshot.reconciliationCount, 1)
        XCTAssertEqual(Set(recorder.snapshot.uploadedFileIds).count, 2)
        XCTAssertEqual(recorder.snapshot.messageCount, 1)
    }

    func testLegacyUncertainUploadIsNeverAutomaticallyDiscarded() async throws {
        let recorder = MessageSendRecorder(failExecutions: [1], failRecovery: true)
        let service = try makeService(recorder)
        let attempt = OutgoingMessageAttempt(draft: .init(text: "", replyToMessageId: nil, attachment: attachment()))
        do { _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt); XCTFail("Expected timeout") } catch {}
        await service.reconcileMessageUploads(accountId: "user-a", now: Date().addingTimeInterval(600))
        XCTAssertEqual(recorder.snapshot.reconciliationCount, 0)
        XCTAssertEqual(recorder.snapshot.deleteCount, 0)
        XCTAssertEqual(try MessageUploadJournal.load(scope: journalScope).count, 1)
    }

    func testRetryAfterScheduledDiscardCanReserveAReplacement() async throws {
        let recorder = MessageSendRecorder(rejectExecution: 1, managed: true, rejectStatus: 409)
        let service = try makeService(recorder)
        let attempt = OutgoingMessageAttempt(draft: .init(text: "", replyToMessageId: nil, attachment: attachment()))
        do { _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt); XCTFail("Expected discarded file conflict") } catch {}
        XCTAssertEqual(recorder.snapshot.reconciliationCount, 1)
        XCTAssertTrue(try MessageUploadJournal.load(scope: journalScope).isEmpty)
        _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt)
        XCTAssertEqual(Set(recorder.snapshot.uploadedFileIds).count, 2)
        XCTAssertEqual(recorder.snapshot.messageCount, 1)
        XCTAssertEqual(Set(recorder.snapshot.operationIds).count, 1)
    }

    func testLateCleanupCannotRemoveAReplacementReceipt() throws {
        let replacement = UploadedAttachment(fileId: "replacement", name: "document.pdf", mimeType: "application/pdf",
                                             size: 3, width: nil, height: nil, duration: nil, type: .file)
        try MessageUploadJournal.record(.init(messageId: "message", threadId: "thread-1", attachment: replacement), scope: journalScope)
        try MessageUploadJournal.remove(messageId: "message", matchingFileId: "original", scope: journalScope)
        XCTAssertEqual(try MessageUploadJournal.load(scope: journalScope)["message"]?.attachment.fileId, "replacement")
        try MessageUploadJournal.remove(messageId: "message", matchingFileId: "replacement", scope: journalScope)
        XCTAssertTrue(try MessageUploadJournal.load(scope: journalScope).isEmpty)
    }

    func testReconciliationRequiresExactFileAndMessageIdentity() {
        XCTAssertFalse(ManagedAttachmentContract.isReconciled(["status": "referenced", "fileId": "file", "messageId": "other"], fileId: "file", messageId: "message"))
        XCTAssertFalse(ManagedAttachmentContract.isReconciled(["status": "discarded", "fileId": "other"], fileId: "file", messageId: "message"))
        XCTAssertFalse(ManagedAttachmentContract.isReconciled(["status": "pending", "fileId": "file"], fileId: "file", messageId: "message"))
        XCTAssertTrue(ManagedAttachmentContract.isReconciled(["status": "referenced", "fileId": "file", "messageId": "message"], fileId: "file", messageId: "message"))
    }

    func testUnchangedFailedDraftReusesOperationButNewIntentionalSendDoesNot() {
        let draft = OutgoingMessageDraft(text: "hello", replyToMessageId: nil, attachment: nil)
        let first = OutgoingMessageAttempt(draft: draft)
        XCTAssertEqual(OutgoingMessageAttempt(draft: draft, retrying: first).operationId, first.operationId)
        XCTAssertNotEqual(OutgoingMessageAttempt(draft: draft).operationId, first.operationId)
        let edited = OutgoingMessageDraft(text: "edited", replyToMessageId: nil, attachment: nil)
        XCTAssertNotEqual(OutgoingMessageAttempt(draft: edited, retrying: first).operationId, first.operationId)
        let reply = OutgoingMessageDraft(text: "hello", replyToMessageId: "reply-id", attachment: nil)
        XCTAssertNotEqual(OutgoingMessageAttempt(draft: reply, retrying: first).operationId, first.operationId)
    }

    func testChangingAttachmentStartsANewOperation() {
        let first = OutgoingMessageAttempt(draft: OutgoingMessageDraft(text: "", replyToMessageId: nil, attachment: attachment(bytes: [1])))
        let changed = OutgoingMessageDraft(text: "", replyToMessageId: nil, attachment: attachment(bytes: [2]))
        XCTAssertNotEqual(OutgoingMessageAttempt(draft: changed, retrying: first).operationId, first.operationId)
    }

    func testMessageIdentityMatchesBackendFixtureAndIsScoped() throws {
        let operationId = try XCTUnwrap(UUID(uuidString: "550e8400-e29b-41d4-a716-446655440000"))
        let id = OutgoingMessageAttempt.remoteMessageId(userId: "user-a", threadId: "thread-1", operationId: operationId)
        XCTAssertEqual(id, "m_dc1cadf0e3305e63598ad72921a25860")
        XCTAssertNotEqual(id, OutgoingMessageAttempt.remoteMessageId(userId: "user-b", threadId: "thread-1", operationId: operationId))
        XCTAssertNotEqual(id, OutgoingMessageAttempt.remoteMessageId(userId: "user-a", threadId: "thread-2", operationId: operationId))
    }

    func testLostResponseRecoversOnlyTheExactOperation() async throws {
        let recorder = MessageSendRecorder(failExecutions: [2])
        let service = try makeService(recorder)
        defer { MessageSendURLProtocol.recorder = nil }
        let draft = OutgoingMessageDraft(text: "same text", replyToMessageId: nil, attachment: nil)
        let first = try await service.sendMessage(threadId: "thread-1", attempt: OutgoingMessageAttempt(draft: draft))
        let secondAttempt = OutgoingMessageAttempt(draft: draft)
        let second = try await service.sendMessage(threadId: "thread-1", attempt: secondAttempt)
        XCTAssertNotEqual(first.remoteId, second.remoteId)
        XCTAssertEqual(second.remoteId, OutgoingMessageAttempt.remoteMessageId(userId: "user-a", threadId: "thread-1", operationId: secondAttempt.operationId))
        XCTAssertEqual(recorder.snapshot.messageCount, 2)
        XCTAssertEqual(recorder.snapshot.recoveryPaths, ["/v1/tablesdb/db/tables/messages/rows/\(second.remoteId)"])
    }

    func testRetryAfterLostResponseAndFailedLookupReusesUploadedFile() async throws {
        let recorder = MessageSendRecorder(failExecutions: [1], failRecovery: true)
        let service = try makeService(recorder)
        defer { MessageSendURLProtocol.recorder = nil }
        let attempt = OutgoingMessageAttempt(draft: OutgoingMessageDraft(text: "document", replyToMessageId: "reply-1", attachment: attachment()))
        do {
            _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt)
            XCTFail("The first response and recovery should fail")
        } catch {}
        let retried = try await service.sendMessage(threadId: "thread-1", attempt: attempt)
        XCTAssertEqual(recorder.snapshot.uploadCount, 1)
        XCTAssertEqual(recorder.snapshot.messageCount, 1)
        XCTAssertEqual(recorder.snapshot.executionCount, 2)
        XCTAssertEqual(Set(recorder.snapshot.operationIds), [attempt.operationId.uuidString.lowercased()])
        XCTAssertEqual(retried.replyToRemoteId, "reply-1")
        XCTAssertEqual(retried.attachment?.name, "document.pdf")
        XCTAssertEqual(retried.sentAt, Date(timeIntervalSince1970: 1_700_000_000))
    }

    func testConcurrentCallsShareUploadAndExecution() async throws {
        let recorder = MessageSendRecorder()
        let service = try makeService(recorder)
        defer { MessageSendURLProtocol.recorder = nil }
        let attempt = OutgoingMessageAttempt(draft: OutgoingMessageDraft(text: "", replyToMessageId: nil, attachment: attachment()))
        async let first = service.sendMessage(threadId: "thread-1", attempt: attempt)
        async let second = service.sendMessage(threadId: "thread-1", attempt: attempt)
        let results = try await [first, second]
        XCTAssertEqual(results[0].remoteId, results[1].remoteId)
        XCTAssertEqual(recorder.snapshot.uploadCount, 1)
        XCTAssertEqual(recorder.snapshot.executionCount, 1)
    }

    func testLateRejectionCannotDeleteAttachmentFromUncertainEarlierSend() async throws {
        let recorder = MessageSendRecorder(failExecutions: [1], failRecovery: true, rejectExecution: 2)
        let service = try makeService(recorder)
        defer { MessageSendURLProtocol.recorder = nil }
        let attempt = OutgoingMessageAttempt(draft: OutgoingMessageDraft(text: "", replyToMessageId: nil, attachment: attachment()))
        for _ in 0..<2 {
            do {
                _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt)
                XCTFail("Expected uncertain send followed by rejection")
            } catch {}
        }
        XCTAssertEqual(recorder.snapshot.messageCount, 1)
        XCTAssertEqual(recorder.snapshot.uploadCount, 1)
        XCTAssertEqual(recorder.snapshot.deleteCount, 0)
    }

    func testFirstDefinitiveRejectionCleansUpUnreferencedUpload() async throws {
        let recorder = MessageSendRecorder(rejectExecution: 1)
        let service = try makeService(recorder)
        defer { MessageSendURLProtocol.recorder = nil }
        let attempt = OutgoingMessageAttempt(draft: OutgoingMessageDraft(text: "", replyToMessageId: nil, attachment: attachment()))
        do {
            _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt)
            XCTFail("Expected rejected send")
        } catch {}
        XCTAssertEqual(recorder.snapshot.messageCount, 0)
        XCTAssertEqual(recorder.snapshot.deleteCount, 1)
    }

    func testRealtimeMergeKeepsTwoIntentionalIdenticalMessagesSeparate() {
        let firstId = UUID()
        let secondId = UUID()
        let first = chatMessage(id: firstId, remoteId: "local-\(firstId.uuidString)")
        let second = chatMessage(id: secondId, remoteId: "local-\(secondId.uuidString)")
        let confirmedId = OutgoingMessageAttempt.remoteMessageId(userId: "user-a", threadId: "thread-1", operationId: firstId)
        let confirmed = chatMessage(id: UUID(), remoteId: confirmedId)
        let merged = ChatMessageReconciliation.merge(remote: [confirmed], local: [first, second], userId: "user-a", threadId: "thread-1")
        XCTAssertEqual(Set(merged.map(\.remoteId)), [confirmedId, second.remoteId])
        XCTAssertEqual(merged.count, 2)
    }

    func testConfirmationAfterRealtimeDoesNotDuplicateTheMessage() {
        let operationId = UUID()
        let optimistic = chatMessage(id: operationId, remoteId: "local-\(operationId.uuidString)")
        let confirmed = chatMessage(id: UUID(), remoteId: "server-message")
        let merged = ChatMessageReconciliation.confirm(confirmed, optimisticId: operationId, in: [optimistic, confirmed])
        XCTAssertEqual(merged, [confirmed])
    }

    func testRealtimeMergeDoesNotMatchAnOperationFromAnotherAccount() {
        let operationId = UUID()
        let local = chatMessage(id: operationId, remoteId: "local-\(operationId.uuidString)")
        let otherId = OutgoingMessageAttempt.remoteMessageId(userId: "user-b", threadId: "thread-1", operationId: operationId)
        let remote = chatMessage(id: UUID(), remoteId: otherId)
        let merged = ChatMessageReconciliation.merge(remote: [remote], local: [local], userId: "user-a", threadId: "thread-1")
        XCTAssertEqual(merged.count, 2)
    }

    private func chatMessage(id: UUID, remoteId: String) -> ChatMessage {
        ChatMessage(id: id, remoteId: remoteId, text: "identical", messageType: .text, attachment: nil,
                    isMe: true, time: "12:00", sentAt: Date(timeIntervalSince1970: 1_700_000_000))
    }

    func testRetryAfterServiceRestartReusesJournaledAttachment() async throws {
        let recorder = MessageSendRecorder(failExecutions: [1], failRecovery: true)
        let attempt = OutgoingMessageAttempt(draft: OutgoingMessageDraft(text: "persisted receipt", replyToMessageId: nil, attachment: attachment()))
        let firstService = try makeService(recorder)
        do { _ = try await firstService.sendMessage(threadId: "thread-1", attempt: attempt); XCTFail("Expected lost response") } catch {}
        let restartedService = try makeService(recorder)
        let recovered = try await restartedService.sendMessage(threadId: "thread-1", attempt: attempt)
        XCTAssertEqual(recorder.snapshot.uploadCount, 1)
        XCTAssertEqual(recorder.snapshot.messageCount, 1)
        XCTAssertEqual(recovered.remoteId, OutgoingMessageAttempt.remoteMessageId(userId: "user-a", threadId: "thread-1", operationId: attempt.operationId))
        MessageSendURLProtocol.recorder = nil
    }

    func testCancelledUploadDoesNotStartAFileOrServerMutation() async throws {
        let recorder = MessageSendRecorder()
        let service = try makeService(recorder)
        defer { MessageSendURLProtocol.recorder = nil }
        let control = UploadControl()
        control.cancel()
        let attempt = OutgoingMessageAttempt(draft: OutgoingMessageDraft(text: "", replyToMessageId: nil, attachment: attachment()), uploadControl: control)
        do { _ = try await service.sendMessage(threadId: "thread-1", attempt: attempt); XCTFail("Expected cancellation") }
        catch { XCTAssertTrue(error is CancellationError) }
        XCTAssertEqual(recorder.snapshot.uploadCount, 0)
        XCTAssertEqual(recorder.snapshot.executionCount, 0)
    }

    private func attachment(bytes: [UInt8] = [1, 2, 3]) -> OutgoingAttachmentDTO {
        OutgoingAttachmentDTO(data: Data(bytes), fileName: "document.pdf", mimeType: "application/pdf", type: .file,
                              size: bytes.count, width: nil, height: nil, duration: nil)
    }

    private func makeService(_ recorder: MessageSendRecorder) throws -> AppwriteService {
        MessageSendURLProtocol.recorder = recorder
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [MessageSendURLProtocol.self]
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

private struct MessageSendSnapshot: Sendable {
    var reconciliationCount = 0
    var reservationCount = 0
    var uploadedFileIds: [String] = []
    var uploadCount = 0
    var executionCount = 0
    var deleteCount = 0
    var messageCount = 0
    var recoveryPaths: [String] = []
    var operationIds: [String] = []
}

private final class MessageSendRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private let failExecutions: Set<Int>
    private let failRecovery: Bool
    private let rejectExecution: Int?
    private let rejectStatus: Int
    private let managed: Bool
    private let failBeforeWrite: Set<Int>
    private let failFirstUpload: Bool
    private let failReconciliation: Bool
    nonisolated(unsafe) private var state = MessageSendSnapshot()
    nonisolated(unsafe) private var rows: [String: [String: Any]] = [:]

    init(failExecutions: Set<Int> = [], failRecovery: Bool = false, rejectExecution: Int? = nil, managed: Bool = false, failBeforeWrite: Set<Int> = [], failFirstUpload: Bool = false, failReconciliation: Bool = false, rejectStatus: Int = 403) {
        self.failExecutions = failExecutions
        self.failRecovery = failRecovery
        self.rejectExecution = rejectExecution
        self.rejectStatus = rejectStatus
        self.managed = managed
        self.failBeforeWrite = failBeforeWrite
        self.failFirstUpload = failFirstUpload
        self.failReconciliation = failReconciliation
    }

    nonisolated var snapshot: MessageSendSnapshot {
        lock.lock()
        defer { lock.unlock() }
        return state
    }

    nonisolated func response(to request: URLRequest) throws -> (Int, Data) {
        lock.lock()
        defer { lock.unlock() }
        let path = request.url!.path
        if path == "/v1/account" { return try json(200, ["$id": "user-a"]) }
        if path.hasSuffix("/storage/buckets/attachments/files"), request.httpMethod == "POST" {
            state.uploadCount += 1
            let body = String(decoding: requestBody(request), as: UTF8.self)
            let id = body.components(separatedBy: "name=\"fileId\"\r\n\r\n").last!.components(separatedBy: "\r\n").first!
            state.uploadedFileIds.append(id)
            if failFirstUpload && state.uploadCount == 1 { throw URLError(.timedOut) }
            return try json(201, ["$id": id])
        }
        if path.contains("/storage/buckets/attachments/files/"), request.httpMethod == "DELETE" {
            state.deleteCount += 1
            return (204, Data())
        }
        if path == "/v1/functions/sendmessage/executions" {
            let envelope = try JSONSerialization.jsonObject(with: requestBody(request)) as! [String: Any]
            let body = try JSONSerialization.jsonObject(with: Data((envelope["body"] as! String).utf8)) as! [String: Any]
            if body["action"] as? String == "reserveAttachment" {
                state.reservationCount += 1
                let response: [String: Any] = managed ? ["supported": true, "fileId": "u_" + String(format: "%032d", state.reservationCount)] : ["supported": false]
                return try json(201, ["$id": "reservation", "status": "completed", "responseStatusCode": 200, "responseBody": response])
            }
            if body["action"] as? String == "reconcileAttachment" {
                state.reconciliationCount += 1
                if failReconciliation { throw URLError(.timedOut) }
                let fileId = body["attachmentFileId"] as! String
                let row = rows.values.first { $0["attachmentFileId"] as? String == fileId }
                var response: [String: Any] = ["fileId": fileId, "status": row == nil ? "discarded" : "referenced"]
                if let row { response["messageId"] = row["$id"] }
                else { state.deleteCount += 1 }
                return try json(201, ["$id": "reconciliation", "status": "completed", "responseStatusCode": 200, "responseBody": response])
            }
            state.executionCount += 1
            let operation = body["operationId"] as! String
            state.operationIds.append(operation)
            if state.executionCount == rejectExecution {
                return try json(201, ["$id": "execution", "status": "completed", "responseStatusCode": rejectStatus, "responseBody": ["message": "Rejected"]])
            }
            let id = OutgoingMessageAttempt.remoteMessageId(userId: "user-a", threadId: body["threadId"] as! String, operationId: UUID(uuidString: operation)!)
            if failBeforeWrite.contains(state.executionCount) { throw URLError(.timedOut) }
            if rows[id] == nil {
                var row = body
                row["$id"] = id
                row["messageId"] = id
                row["senderUserId"] = "user-a"
                row["createdAt"] = "2023-11-14T22:13:20.000Z"
                rows[id] = row
                state.messageCount += 1
            }
            if failExecutions.contains(state.executionCount) { throw URLError(.timedOut) }
            return try json(201, ["$id": "execution", "status": "completed", "responseStatusCode": 200, "responseBody": rows[id]!])
        }
        if path.contains("/tables/messages/rows/") {
            state.recoveryPaths.append(path)
            if failRecovery { throw URLError(.notConnectedToInternet) }
            if let row = rows[request.url!.lastPathComponent] { return try json(200, row) }
            return try json(404, [:])
        }
        return try json(500, ["message": "Unexpected test request: \(path)"])
    }

    nonisolated private func json(_ status: Int, _ payload: [String: Any]) throws -> (Int, Data) {
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

private final class MessageSendURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var recorder: MessageSendRecorder?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, data) = try Self.recorder!.response(to: request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
    override func stopLoading() {}
}
