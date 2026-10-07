import Foundation

enum ThreadParticipantUpdatePayloadError: Error {
    case missingThreadId
    case missingUpdate
}

enum ThreadParticipantUpdatePayload {
    static func make(
        threadId: String,
        markRead: Bool = false,
        notificationsEnabled: Bool? = nil,
        pinned: Bool? = nil
    ) throws -> [String: Any] {
        guard !threadId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ThreadParticipantUpdatePayloadError.missingThreadId
        }
        guard markRead || notificationsEnabled != nil || pinned != nil else {
            throw ThreadParticipantUpdatePayloadError.missingUpdate
        }

        var payload: [String: Any] = [
            "action": "updateParticipant",
            "threadId": threadId
        ]
        if markRead {
            payload["markRead"] = true
        }
        if let notificationsEnabled {
            payload["notificationsEnabled"] = notificationsEnabled
        }
        if let pinned {
            payload["pinned"] = pinned
        }
        return payload
    }
}

struct ChatPeerProjection: Equatable {
    let userId: String
    let displayName: String
    let avatarURL: String?
    let presenceUpdatedAt: String?
    let lastSeenAt: String?

    nonisolated init(
        userId: String,
        displayName: String,
        avatarURL: String?,
        presenceUpdatedAt: String?,
        lastSeenAt: String?
    ) {
        self.userId = userId
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.presenceUpdatedAt = presenceUpdatedAt
        self.lastSeenAt = lastSeenAt
    }
}

enum ChatPeerProjectionContract {
    nonisolated static func parse(
        response: [String: Any],
        expectedThreadId: String,
        expectedUserId: String
    ) -> ChatPeerProjection? {
        guard projectedString(forKey: "threadId", in: response) == expectedThreadId,
              let peer = response["peer"] as? [String: Any],
              projectedString(forKey: "userId", in: peer) == expectedUserId,
              let displayName = projectedString(forKey: "displayName", in: peer) else {
            return nil
        }

        return ChatPeerProjection(
            userId: expectedUserId,
            displayName: displayName,
            avatarURL: projectedString(forKey: "avatarUrl", in: peer)
                .flatMap(TokenizedRemoteURLContract.url(from:))
                .map(\.absoluteString),
            presenceUpdatedAt: projectedString(forKey: "presenceUpdatedAt", in: peer),
            lastSeenAt: projectedString(forKey: "lastSeenAt", in: peer)
        )
    }

    nonisolated private static func projectedString(forKey key: String, in dictionary: [String: Any]) -> String? {
        guard let value = dictionary[key] as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

}

extension AppwriteService {
    func createOrGetThread(otherUserId: String) async throws -> String {
        guard !configuration.createOrGetThreadFunctionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID")
        }
        let response = try await executeUserFunction(
            functionId: configuration.createOrGetThreadFunctionId,
            body: ["otherUserId": otherUserId]
        )

        guard let threadId = stringValue(forKey: "threadId", in: response) else {
            throw AppwriteServiceError.invalidResponse
        }

        return threadId
    }

    func createOrGetThreadDTO(otherUserId: String) async throws -> ThreadDTO {
        let threadId = try await createOrGetThread(otherUserId: otherUserId)
        return try await fetchThreadAfterWrite(threadId: threadId)
    }

    func fetchThreadDTO(threadId: String) async throws -> ThreadDTO? {
        try await fetchThread(threadId: threadId)
    }

    func fetchThreads() async throws -> [ThreadDTO] {
        guard let currentAccountId = try await fetchCurrentAccountId(required: false) else {
            return []
        }

        await reconcileMessageUploads(accountId: currentAccountId)
        let participantRows = try await listRows(
            tableId: configuration.threadParticipantsTableId,
            queries: [
                AppwriteQuery.equal("userId", values: [currentAccountId]),
            ]
        )

        let ownParticipantsByThread = Dictionary(grouping: participantRows) { stringValue(forKey: "threadId", in: $0) ?? "" }
        let threadIds = ownParticipantsByThread.keys.filter { !$0.isEmpty }.sorted()
        var threads: [(thread: ThreadDTO, lastActivity: Date)] = []

        // Fetch both participants in bounded groups instead of rereading each thread separately.
        for start in stride(from: 0, to: threadIds.count, by: 50) {
            let batch = Array(threadIds[start..<min(start + 50, threadIds.count)])
            let rows = try await listRows(tableId: configuration.threadParticipantsTableId, queries: [
                AppwriteQuery.equal("threadId", values: batch)
            ])
            let participantsByThread = Dictionary(grouping: rows) { stringValue(forKey: "threadId", in: $0) ?? "" }
            for threadId in batch {
                try Task.checkCancellation()
                guard let thread = try await fetchThread(
                    threadId: threadId, currentAccountId: currentAccountId,
                    knownParticipantRows: participantsByThread[threadId] ?? [], includeHistory: false
                ) else { continue }
                let participant = ownParticipantsByThread[threadId]?.first ?? [:]
                let lastActivity = thread.messages.last?.sentAt
                    ?? dateValue(forKey: "createdAt", in: participant)
                    ?? dateValue(forKey: "$createdAt", in: participant)
                    ?? .distantPast
                threads.append((thread, lastActivity))
            }
        }

        return threads.sorted {
            $0.lastActivity == $1.lastActivity ? $0.thread.remoteId < $1.thread.remoteId : $0.lastActivity > $1.lastActivity
        }.map(\.thread)
    }

    func sendMessage(threadId: String, attempt: OutgoingMessageAttempt) async throws -> MessageDTO {
        guard let accountId = try await fetchCurrentAccountId(required: true) else {
            throw AppwriteServiceError.missingAccountId
        }
        let messageId = OutgoingMessageAttempt.remoteMessageId(
            userId: accountId, threadId: threadId, operationId: attempt.operationId
        )
        if let completed = completedMessageSends[messageId] { return completed }
        if let existing = inFlightMessageSends[messageId] {
            guard existing.draft == attempt.draft else { throw messageOperationConflict() }
            return try await existing.task.value
        }
        let task = Task {
            try await self.performMessageSend(threadId: threadId, accountId: accountId, messageId: messageId, attempt: attempt)
        }
        inFlightMessageSends[messageId] = InFlightMessageSend(draft: attempt.draft, task: task)
        defer { inFlightMessageSends.removeValue(forKey: messageId) }
        let message = try await task.value
        completedMessageSends[messageId] = message
        completedMessageSendOrder.append(messageId)
        if completedMessageSendOrder.count > 100 {
            completedMessageSends.removeValue(forKey: completedMessageSendOrder.removeFirst())
        }
        return message
    }

    private func performMessageSend(threadId: String, accountId: String, messageId: String, attempt: OutgoingMessageAttempt) async throws -> MessageDTO {
        let text = attempt.draft.text
        let replyToMessageId = attempt.draft.replyToMessageId
        let attachment = attempt.draft.attachment
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || attachment != nil else {
            throw AppwriteServiceError.api(statusCode: 400, message: "chat.error.sendFailed", type: "validation")
        }
        guard !configuration.sendMessageFunctionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_SEND_MESSAGE_FUNCTION_ID")
        }

        let journalScope = uploadJournalScope(accountId: accountId)
        if pendingMessageUploads[messageId] == nil,
           let receipt = try await MessageUploadJournal.load(scope: journalScope)[messageId] {
            guard receipt.threadId == threadId else { throw messageOperationConflict() }
            if receipt.uploadCompleted == false {
                let response = try await executeUserFunction(functionId: configuration.sendMessageFunctionId, body: [
                    "action": "reconcileAttachment", "threadId": threadId, "attachmentFileId": receipt.attachment.fileId
                ])
                guard ManagedAttachmentContract.isReconciled(response, fileId: receipt.attachment.fileId, messageId: messageId) else {
                    throw AppwriteServiceError.invalidResponse
                }
                if response["status"] as? String == "discarded" {
                    try await MessageUploadJournal.remove(messageId: messageId, scope: journalScope)
                } else {
                    pendingMessageUploads[messageId] = PendingMessageUpload(attachment: receipt.attachment, mayBeReferenced: true)
                }
            } else {
                pendingMessageUploads[messageId] = PendingMessageUpload(attachment: receipt.attachment, mayBeReferenced: true)
            }
        }
        let response: [String: Any]
        let uploadedAttachment: UploadedAttachment?
        if let cached = pendingMessageUploads[messageId] {
            uploadedAttachment = cached.attachment
        } else if let attachment {
            uploadedAttachment = try await uploadAttachmentIfNeeded(attachment, currentUserId: accountId, control: attempt.uploadControl, threadId: threadId, operationId: attempt.operationId)
            if let uploadedAttachment {
                pendingMessageUploads[messageId] = PendingMessageUpload(attachment: uploadedAttachment)
            }
        } else {
            uploadedAttachment = nil
        }
        var body: [String: Any] = [
            "threadId": threadId,
            "text": trimmed,
            "operationId": attempt.operationId.uuidString.lowercased(),
            "currentUserId": accountId
        ]
        if let replyToMessageId, !replyToMessageId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            body["replyToMessageId"] = replyToMessageId
        }
        if let uploadedAttachment {
            body["messageType"] = uploadedAttachment.type.rawValue
            body["attachmentFileId"] = uploadedAttachment.fileId
            body["attachmentName"] = uploadedAttachment.name
            body["attachmentMimeType"] = uploadedAttachment.mimeType
            body["attachmentSize"] = uploadedAttachment.size
            if let width = uploadedAttachment.width {
                body["attachmentWidth"] = width
            }
            if let height = uploadedAttachment.height {
                body["attachmentHeight"] = height
            }
            if let duration = uploadedAttachment.duration {
                body["attachmentDuration"] = duration
            }
        }

        do { try await attempt.uploadControl?.beginCommit() }
        catch {
            if let pending = pendingMessageUploads[messageId], !pending.mayBeReferenced,
               let bucketId = configuration.chatAttachmentsBucketId {
                do {
                    try await deleteUploadedFile(bucketId: bucketId, fileId: pending.attachment.fileId)
                    try? await MessageUploadJournal.remove(messageId: messageId, scope: journalScope)
                } catch {}
                pendingMessageUploads.removeValue(forKey: messageId)
            }
            throw error
        }
        // Preserve files after any uncertain attempt: a later rejection can
        // reflect changed permissions rather than prove the earlier send failed.
        let wasAlreadySubmitted = pendingMessageUploads[messageId]?.mayBeReferenced ?? false
        if let uploadedAttachment {
            // Persist before starting the mutation, so a restart cannot turn an uncertain send into an orphan deletion.
            do {
                try await MessageUploadJournal.record(.init(messageId: messageId, threadId: threadId, attachment: uploadedAttachment, recordedAt: Date(), uploadCompleted: true), scope: journalScope)
            } catch {
                if !wasAlreadySubmitted, let bucketId = configuration.chatAttachmentsBucketId {
                    try? await deleteUploadedFile(bucketId: bucketId, fileId: uploadedAttachment.fileId)
                    pendingMessageUploads.removeValue(forKey: messageId)
                }
                throw error
            }
        }
        pendingMessageUploads[messageId]?.mayBeReferenced = true
        do {
            response = try await executeUserFunction(
                functionId: configuration.sendMessageFunctionId,
                body: body
            )
        } catch {
            if !wasAlreadySubmitted, isDefinitiveWriteRejection(error),
               !ManagedAttachmentContract.isManaged(uploadedAttachment?.fileId ?? "") {
                if let fileId = uploadedAttachment?.fileId, let bucketId = configuration.chatAttachmentsBucketId {
                    try? await deleteUploadedFile(bucketId: bucketId, fileId: fileId)
                    pendingMessageUploads.removeValue(forKey: messageId)
                    try? await MessageUploadJournal.remove(messageId: messageId, scope: journalScope)
                }
            } else if let recoveredMessage = try? await recoverSentMessage(
                messageId: messageId, threadId: threadId, accountId: accountId,
                text: trimmed, replyToMessageId: replyToMessageId, attachmentFileId: uploadedAttachment?.fileId
            ) {
                pendingMessageUploads.removeValue(forKey: messageId)
                try? await MessageUploadJournal.remove(messageId: messageId, scope: journalScope)
                return recoveredMessage
            }
            // A scheduled cleanup may have discarded a retained receipt while
            // the app was closed. Release it only after the backend confirms this,
            // so the next retry can reserve a replacement for the same operation.
            if case let AppwriteServiceError.api(status, _, _) = error, status == 409,
               let uploadedAttachment, ManagedAttachmentContract.isManaged(uploadedAttachment.fileId),
               let result = try? await executeUserFunction(functionId: configuration.sendMessageFunctionId, body: [
                "action": "reconcileAttachment", "threadId": threadId, "attachmentFileId": uploadedAttachment.fileId
               ]), result["status"] as? String == "discarded",
               ManagedAttachmentContract.isReconciled(result, fileId: uploadedAttachment.fileId, messageId: messageId) {
                try? await MessageUploadJournal.remove(messageId: messageId, matchingFileId: uploadedAttachment.fileId, scope: journalScope)
                pendingMessageUploads.removeValue(forKey: messageId)
            }
            throw error
        }

        guard let remoteMessageId = stringValue(forKey: "messageId", in: response) else {
            if let recoveredMessage = try await recoverSentMessage(
                messageId: messageId, threadId: threadId, accountId: accountId,
                text: trimmed, replyToMessageId: replyToMessageId, attachmentFileId: uploadedAttachment?.fileId
            ) {
                pendingMessageUploads.removeValue(forKey: messageId)
                try? await MessageUploadJournal.remove(messageId: messageId, scope: journalScope)
                return recoveredMessage
            }
            throw AppwriteServiceError.invalidResponse
        }
        // Decode the canonical server response, including the original timestamp
        // and attachment metadata when this was a replay.
        var row = response
        row["$id"] = remoteMessageId
        row["senderUserId"] = accountId
        guard let message = makeMessageDTO(from: row, currentAccountId: accountId) else {
            throw AppwriteServiceError.invalidResponse
        }
        pendingMessageUploads.removeValue(forKey: messageId)
        try? await MessageUploadJournal.remove(messageId: messageId, scope: journalScope)
        return message
    }

    private func uploadJournalScope(accountId: String) -> String {
        "\(configuration.endpointURL)|\(configuration.projectId)|\(configuration.databaseId)|\(configuration.messagesTableId)|\(accountId)"
    }

    func reconcileMessageUploads(accountId: String, now: Date = Date()) async {
        let scope = uploadJournalScope(accountId: accountId)
        guard let receipts = try? await MessageUploadJournal.load(scope: scope) else { return }
        let orderedIds = receipts.keys.sorted()
        let previousId = lastReconciledUpload[scope] ?? ""
        let nextIds = Array(orderedIds.filter { $0 > previousId }.prefix(20))
        let batch = nextIds.isEmpty ? Array(orderedIds.prefix(20)) : nextIds
        if let last = batch.last { lastReconciledUpload[scope] = last }
        for id in batch {
            guard let receipt = receipts[id] else { continue }
            guard !Task.isCancelled else { return }
            guard inFlightMessageSends[receipt.messageId] == nil else { continue }
            let row = try? await fetchRowIfAccessible(tableId: configuration.messagesTableId, rowId: receipt.messageId)
            let referenceConfirmed = row.map {
                stringValue(forKey: "senderUserId", in: $0) == accountId
                    && stringValue(forKey: "threadId", in: $0) == receipt.threadId
                    && stringValue(forKey: "attachmentFileId", in: $0) == receipt.attachment.fileId
            } ?? false
            if referenceConfirmed {
                // Keep the original attachment available for a retry of this operation,
                // including after a restart. Only a successful send consumes its receipt.
                continue
            } else {
                // Allow time for ordinary retries. Safety comes from the server decision,
                // not from this delay or from an absent/inaccessible message row.
                guard ManagedAttachmentContract.isManaged(receipt.attachment.fileId),
                      let recordedAt = receipt.recordedAt, now.timeIntervalSince(recordedAt) >= 300,
                      let response = try? await executeUserFunction(functionId: configuration.sendMessageFunctionId, body: [
                        "action": "reconcileAttachment", "threadId": receipt.threadId, "attachmentFileId": receipt.attachment.fileId
                      ]),
                      ManagedAttachmentContract.isReconciled(response, fileId: receipt.attachment.fileId, messageId: receipt.messageId) else { continue }
                if response["status"] as? String == "referenced" { continue }
            }
            // A retry may have uploaded a replacement while reconciliation awaited HTTP.
            try? await MessageUploadJournal.remove(messageId: receipt.messageId, matchingFileId: receipt.attachment.fileId, scope: scope)
            if pendingMessageUploads[receipt.messageId]?.attachment.fileId == receipt.attachment.fileId {
                pendingMessageUploads.removeValue(forKey: receipt.messageId)
            }
        }
    }

    private func messageOperationConflict() -> AppwriteServiceError {
        .api(statusCode: 409, message: "chat.error.sendFailed", type: "validation")
    }

    func submitSwipe(otherUserId: String, otherUserName _: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO? {
        guard let functionId = configuration.recordSwipeFunctionId else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_RECORD_SWIPE_FUNCTION_ID")
        }

        let payload: [String: Any] = [
            "otherUserId": otherUserId,
            "decision": decision.rawValue
        ]

        let response = try await executeUserFunction(
            functionId: functionId,
            body: payload
        )

        guard boolValue(forKey: "matched", in: response) == true else { return nil }

        guard let threadId = stringValue(forKey: "threadId", in: response) else {
            throw AppwriteServiceError.invalidResponse
        }

        return try await fetchThreadAfterWrite(threadId: threadId)
    }

    func updateRelationship(threadId: String, action: RelationshipActionDTO) async throws {
        guard let functionId = configuration.manageRelationshipFunctionId else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID")
        }

        _ = try await executeUserFunction(
            functionId: functionId,
            body: [
                "threadId": threadId,
                "action": action.rawValue
            ]
        )
    }

    func markCurrentUserPresence(isOnline: Bool) async {
        guard (try? await fetchCurrentAccountId(required: false)) != nil else {
            return
        }

        _ = try? await executeUserFunction(
            functionId: configuration.manageProfileFunctionId,
            body: ManageProfilePayload.presence(isOnline: isOnline),
            includeCurrentUserId: false
        )
    }

    func markThreadRead(threadId: String) async {
        guard (try? await fetchCurrentAccountId(required: false)) != nil else {
            return
        }

        do {
            let response = try await executeUserFunction(
                functionId: configuration.sendMessageFunctionId,
                body: ThreadParticipantUpdatePayload.make(
                    threadId: threadId,
                    markRead: true
                ),
                includeCurrentUserId: false
            )
            try validateParticipantUpdateResponse(response, expectedThreadId: threadId)
        } catch {
#if DEBUG
            debugPrint("markThreadRead failed")
#endif
        }
    }

    func updateThreadNotifications(threadId: String, enabled: Bool) async throws {
        guard try await fetchCurrentAccountId(required: true) != nil else {
            throw AppwriteServiceError.invalidResponse
        }
        let response = try await executeUserFunction(
            functionId: configuration.sendMessageFunctionId,
            body: ThreadParticipantUpdatePayload.make(
                threadId: threadId,
                notificationsEnabled: enabled
            ),
            includeCurrentUserId: false
        )
        try validateParticipantUpdateResponse(response, expectedThreadId: threadId)
    }

    private func validateParticipantUpdateResponse(
        _ response: [String: Any],
        expectedThreadId: String
    ) throws {
        guard boolValue(forKey: "ok", in: response) == true,
              stringValue(forKey: "threadId", in: response) == expectedThreadId else {
            throw AppwriteServiceError.invalidResponse
        }
    }

    func fetchAttachmentData(fileId: String) async throws -> Data? {
        guard let bucketId = configuration.chatAttachmentsBucketId, !bucketId.isEmpty else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID")
        }

        do {
            return try await sendRequest(
                method: "GET",
                pathComponents: [
                    "storage",
                    "buckets",
                    bucketId,
                    "files",
                    fileId,
                    "view"
                ]
            )
        } catch let error as AppwriteServiceError
            where error.statusCode == 401 || error.statusCode == 403 || error.statusCode == 404 {
            return nil
        }
    }

    func fetchMessagePage(threadId: String, before cursor: String) async throws -> MessagePageDTO {
        guard let accountId = try await fetchCurrentAccountId(required: true) else {
            throw AppwriteServiceError.missingAccountId
        }
        return try await fetchMessagePage(threadId: threadId, cursor: cursor, currentAccountId: accountId)
    }

    func fetchMessagePage(threadId: String, cursor: String? = nil, currentAccountId: String) async throws -> MessagePageDTO {
        let pageSize = 50
        var queries = [
            AppwriteQuery.equal("threadId", values: [threadId]),
            AppwriteQuery.orderDesc("createdAt"),
            AppwriteQuery.orderDesc("$id"),
            AppwriteQuery.limit(pageSize + 1)
        ]
        if let cursor { queries.append(AppwriteQuery.cursorAfter(cursor)) }
        let payload = try await listRowsPage(tableId: configuration.messagesTableId, queries: queries)
        guard let rows = payload["rows"] as? [[String: Any]] else { throw AppwriteServiceError.invalidResponse }
        let pageRows = Array(rows.prefix(pageSize))
        let pageIds = Set(pageRows.compactMap { stringValue(forKey: "$id", in: $0) })
        let replyIds = Set(pageRows.compactMap { stringValue(forKey: "replyToMessageId", in: $0) }).subtracting(pageIds)
        var replyRows = pageRows
        if !replyIds.isEmpty {
            // Resolve only referenced rows, including replies outside this history page.
            let replies = try await listRowsPage(tableId: configuration.messagesTableId, queries: [
                AppwriteQuery.equal("threadId", values: [threadId]),
                AppwriteQuery.equal("$id", values: replyIds.sorted()),
                AppwriteQuery.limit(pageSize)
            ])
            replyRows += replies["rows"] as? [[String: Any]] ?? []
        }
        var lookup: [String: String] = [:]
        for row in replyRows {
            if let id = stringValue(forKey: "$id", in: row) { lookup[id] = stringValue(forKey: "text", in: row) ?? "" }
        }
        let messages = pageRows.reversed().compactMap {
            makeMessageDTO(from: $0, currentAccountId: currentAccountId, replyLookup: lookup)
        }
        return MessagePageDTO(messages: messages, nextCursor: rows.count > pageSize ? pageRows.last?["$id"] as? String : nil)
    }

    // Inbox rows need a real latest message for attachment labels, sorting and empty-match detection.
    // Reply previews and the rest of the history are resolved only when opening the conversation.
    func fetchMessagePreview(threadId: String, currentAccountId: String) async throws -> MessagePageDTO {
        let payload = try await listRowsPage(tableId: configuration.messagesTableId, queries: [
            AppwriteQuery.equal("threadId", values: [threadId]),
            AppwriteQuery.orderDesc("createdAt"),
            AppwriteQuery.orderDesc("$id"),
            AppwriteQuery.limit(1)
        ])
        guard let rows = payload["rows"] as? [[String: Any]],
              let total = intValue(forKey: "total", in: payload) else { throw AppwriteServiceError.invalidResponse }
        let messages = rows.prefix(1).compactMap { makeMessageDTO(from: $0, currentAccountId: currentAccountId) }
        return MessagePageDTO(messages: messages, nextCursor: total > 1 ? messages.first?.remoteId : nil)
    }

    func fetchUnreadMessageCount(threadId: String, senderId: String, readAt: Date?) async throws -> Int {
        var queries = [
            AppwriteQuery.equal("threadId", values: [threadId]),
            AppwriteQuery.equal("senderUserId", values: [senderId]),
            AppwriteQuery.limit(1)
        ]
        if let readAt {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            queries.append(AppwriteQuery.greaterThan("createdAt", value: formatter.string(from: readAt)))
        }
        let payload = try await listRowsPage(tableId: configuration.messagesTableId, queries: queries)
        guard let total = intValue(forKey: "total", in: payload) else { throw AppwriteServiceError.invalidResponse }
        return total
    }

    func fetchThread(
        threadId: String, currentAccountId: String? = nil,
        knownParticipantRows: [[String: Any]]? = nil, includeHistory: Bool = true
    ) async throws -> ThreadDTO? {
        let resolvedCurrentAccountId: String
        if let currentAccountId {
            resolvedCurrentAccountId = currentAccountId
        } else if let fetched = try await fetchCurrentAccountId(required: false) {
            resolvedCurrentAccountId = fetched
        } else {
            return nil
        }

        let participantRows: [[String: Any]]
        if let knownParticipantRows {
            participantRows = knownParticipantRows
        } else {
            participantRows = try await listRows(
                tableId: configuration.threadParticipantsTableId,
                queries: [AppwriteQuery.equal("threadId", values: [threadId])]
            )
        }

        let participantUserIds = Array(Set(participantRows.compactMap { stringValue(forKey: "userId", in: $0) })).sorted()
        guard participantUserIds.contains(resolvedCurrentAccountId) else {
            return nil
        }
        guard let otherUserId = participantUserIds.first(where: { $0 != resolvedCurrentAccountId }) else {
            return nil
        }
        let peer = try await fetchPeerProjection(threadId: threadId, otherUserId: otherUserId)
        let currentParticipantRow = participantRows
            .first(where: { stringValue(forKey: "userId", in: $0) == resolvedCurrentAccountId })
        let currentUserReadAt = currentParticipantRow
            .flatMap { dateValue(forKey: "lastReadAt", in: $0) }
        let notificationsEnabled = currentParticipantRow.map(threadNotificationsEnabled(from:)) ?? true
        let otherParticipantReadAt = participantRows
            .first(where: { stringValue(forKey: "userId", in: $0) == otherUserId })
            .flatMap { dateValue(forKey: "lastReadAt", in: $0) }

        let page: MessagePageDTO
        if includeHistory {
            page = try await fetchMessagePage(threadId: threadId, currentAccountId: resolvedCurrentAccountId)
        } else {
            page = try await fetchMessagePreview(threadId: threadId, currentAccountId: resolvedCurrentAccountId)
        }
        let unreadCount = try await fetchUnreadMessageCount(
            threadId: threadId, senderId: otherUserId, readAt: currentUserReadAt
        )

        let presenceUpdatedAt = chatPeerDate(peer.presenceUpdatedAt)
        let lastSeenAt = chatPeerDate(peer.lastSeenAt)
        let isOnline = presenceUpdatedAt.map { Date().timeIntervalSince($0) <= 70 } ?? false

        return ThreadDTO(
            id: stableUUID(from: threadId),
            remoteId: threadId,
            name: peer.displayName,
            avatar: peer.avatarURL ?? "",
            isOnline: isOnline,
            lastSeenAt: lastSeenAt,
            currentUserReadAt: currentUserReadAt,
            otherParticipantReadAt: otherParticipantReadAt,
            participantUserIds: participantUserIds,
            notificationsEnabled: notificationsEnabled,
            relationshipState: .matched,
            messages: page.messages,
            olderMessagesCursor: page.nextCursor,
            remoteUnreadCount: unreadCount
        )
    }
}

private extension AppwriteService {
    func fetchThreadAfterWrite(threadId: String) async throws -> ThreadDTO {
        var lastError: Error?

        for attempt in 0..<6 {
            do {
                if let thread = try await fetchThread(threadId: threadId) {
                    return thread
                }
            } catch {
                lastError = error
            }

            if attempt < 5 {
                let delayNanoseconds: UInt64 = attempt < 2 ? 250_000_000 : 500_000_000
                try await Task.sleep(nanoseconds: delayNanoseconds)
            }
        }

        if let lastError {
            throw lastError
        }

        throw AppwriteServiceError.invalidResponse
    }

    func fetchPeerProjection(threadId: String, otherUserId: String) async throws -> ChatPeerProjection {
        let response = try await executeUserFunction(
            functionId: configuration.createOrGetThreadFunctionId,
            body: [
                "action": "peerProjection",
                "otherUserId": otherUserId
            ],
            includeCurrentUserId: false
        )
        guard let projection = ChatPeerProjectionContract.parse(
            response: response,
            expectedThreadId: threadId,
            expectedUserId: otherUserId
        ) else {
            throw AppwriteServiceError.invalidResponse
        }
        return projection
    }

    func chatPeerDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        return Self.dateFormatter.date(from: value)
            ?? Self.fallbackDateFormatter.date(from: value)
    }

    func threadNotificationsEnabled(from participantRow: [String: Any]) -> Bool {
        if let enabled = boolValue(forKey: "notificationsEnabled", in: participantRow) {
            return enabled
        }

        if let muted = boolValue(forKey: "muted", in: participantRow) {
            return !muted
        }

        return true
    }

    func recoverSentMessage(messageId: String, threadId: String, accountId: String, text: String, replyToMessageId: String?, attachmentFileId: String?) async throws -> MessageDTO? {
        guard let row = try await fetchRowIfAccessible(tableId: configuration.messagesTableId, rowId: messageId),
              stringValue(forKey: "$id", in: row) == messageId,
              stringValue(forKey: "threadId", in: row) == threadId,
              stringValue(forKey: "senderUserId", in: row) == accountId,
              (stringValue(forKey: "text", in: row) ?? "") == text,
              stringValue(forKey: "replyToMessageId", in: row) == replyToMessageId,
              stringValue(forKey: "attachmentFileId", in: row) == attachmentFileId else { return nil }
        return makeMessageDTO(from: row, currentAccountId: accountId)
    }

    func uploadAttachmentIfNeeded(_ attachment: OutgoingAttachmentDTO?, currentUserId: String, control: UploadControl? = nil, threadId: String? = nil, operationId: UUID? = nil) async throws -> UploadedAttachment? {
        guard let attachment else { return nil }
        guard let bucketId = configuration.chatAttachmentsBucketId, !bucketId.isEmpty else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID")
        }

        try BoundedAttachment.validate(attachment.data, limit: BoundedAttachment.chatLimit)
        try await control?.checkCancellation()
        let fileId: String
        if let threadId, let operationId,
           let reserved = try await reserveAttachment(threadId: threadId, operationId: operationId) { fileId = reserved }
        else { fileId = makeRandomIdentifier() }
        let uploaded = UploadedAttachment(fileId: fileId, name: attachment.fileName, mimeType: attachment.mimeType,
                                          size: attachment.size, width: attachment.width, height: attachment.height,
                                          duration: attachment.duration, type: attachment.type)
        if ManagedAttachmentContract.isManaged(fileId), let threadId, let operationId {
            let messageId = OutgoingMessageAttempt.remoteMessageId(userId: currentUserId, threadId: threadId, operationId: operationId)
            // Persist before sending bytes, including partially uploaded files after a process exit.
            try await MessageUploadJournal.record(.init(messageId: messageId, threadId: threadId, attachment: uploaded, recordedAt: Date(), uploadCompleted: false),
                                                  scope: uploadJournalScope(accountId: currentUserId))
        }
        // Client-side uploads can only grant permissions the current user is allowed to assign.
        // The send message Function widens read access to the other participants after it validates the thread.
        let permissions = [
            "read(\"user:\(currentUserId)\")",
            "update(\"user:\(currentUserId)\")",
            "delete(\"user:\(currentUserId)\")"
        ]

        try await uploadChatAttachment(
            data: attachment.data,
            bucketId: bucketId,
            fileId: fileId,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            permissions: permissions,
            control: control
        )

        return uploaded
    }

    private func reserveAttachment(threadId: String, operationId: UUID) async throws -> String? {
        let response: [String: Any]
        do {
            response = try await executeUserFunction(functionId: configuration.sendMessageFunctionId, body: [
                "action": "reserveAttachment", "threadId": threadId, "operationId": operationId.uuidString.lowercased()
            ])
        } catch let error as AppwriteServiceError {
            // Older deployments reject the unknown action. Their uploads remain unmanaged.
            if case let .api(status, _, type) = error, status == 400, type == "function" { return nil }
            throw error
        }
        if response["supported"] as? Bool == false { return nil }
        guard response["supported"] as? Bool == true,
              let fileId = response["fileId"] as? String, ManagedAttachmentContract.isManaged(fileId) else {
            throw AppwriteServiceError.invalidResponse
        }
        return fileId
    }

    func uploadChatAttachment(
        data: Data,
        bucketId: String,
        fileId: String,
        fileName: String,
        mimeType: String,
        permissions: [String],
        control: UploadControl? = nil
    ) async throws {
        try await uploadFile(
            data: data, bucketId: bucketId, fileId: fileId, fileName: fileName,
            mimeType: mimeType, permissions: permissions, limit: BoundedAttachment.chatLimit, control: control
        )
    }

    func makeMessageDTO(from row: [String: Any], currentAccountId: String, replyLookup: [String: String] = [:]) -> MessageDTO? {
        guard let remoteId = stringValue(forKey: "$id", in: row) else {
            return nil
        }

        let text = stringValue(forKey: "text", in: row) ?? ""
        let messageType = MessageTypeDTO(rawValue: stringValue(forKey: "messageType", in: row) ?? "text") ?? .text
        let replyToRemoteId = stringValue(forKey: "replyToMessageId", in: row)
        let createdAt = dateValue(forKey: "createdAt", in: row)
            ?? dateValue(forKey: "$createdAt", in: row)
            ?? Date()

        return MessageDTO(
            id: stableUUID(from: remoteId),
            remoteId: remoteId,
            text: text,
            messageType: messageType,
            attachment: makeMessageAttachment(from: row),
            isMe: stringValue(forKey: "senderUserId", in: row) == currentAccountId,
            time: Self.messageTimeFormatter.string(from: createdAt),
            sentAt: createdAt,
            replyToRemoteId: replyToRemoteId,
            replyPreviewText: replyToRemoteId.flatMap { replyLookup[$0] }
        )
    }

    func makeMessageAttachment(from row: [String: Any]) -> MessageAttachmentDTO? {
        guard let fileId = stringValue(forKey: "attachmentFileId", in: row) else {
            return nil
        }

        return MessageAttachmentDTO(
            fileId: fileId,
            name: stringValue(forKey: "attachmentName", in: row),
            mimeType: stringValue(forKey: "attachmentMimeType", in: row),
            size: intValue(forKey: "attachmentSize", in: row),
            width: intValue(forKey: "attachmentWidth", in: row),
            height: intValue(forKey: "attachmentHeight", in: row),
            duration: intValue(forKey: "attachmentDuration", in: row)
        )
    }
}

private extension RelationshipStateDTO {
    var isVisibleInInbox: Bool {
        switch self {
        case .liked, .matched:
            return true
        case .none, .archived, .blocked:
            return false
        }
    }
}

struct UploadedAttachment: Sendable, Codable {
    let fileId: String
    let name: String?
    let mimeType: String?
    let size: Int?
    let width: Int?
    let height: Int?
    let duration: Int?
    let type: MessageTypeDTO
}
