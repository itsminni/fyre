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

        let participantRows = try await listRows(
            tableId: configuration.threadParticipantsTableId,
            queries: [
                AppwriteQuery.equal("userId", values: [currentAccountId]),
            ]
        )

        var threads: [(thread: ThreadDTO, lastActivity: Date)] = []

        for participantRow in participantRows {
            guard let threadId = stringValue(forKey: "threadId", in: participantRow),
                  let thread = try await fetchThread(threadId: threadId, currentAccountId: currentAccountId) else {
                continue
            }
            let lastActivity = thread.messages
                .map(\.sentAt)
                .last
                ?? dateValue(forKey: "createdAt", in: participantRow)
                ?? dateValue(forKey: "$createdAt", in: participantRow)
                ?? .distantPast
            threads.append((thread, lastActivity))
        }

        return threads
            .sorted(by: { $0.lastActivity > $1.lastActivity })
            .map(\.thread)
    }

    func sendMessage(threadId: String, text: String, replyToMessageId: String?, attachment: OutgoingAttachmentDTO?) async throws -> MessageDTO {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || attachment != nil else {
            throw AppwriteServiceError.api(statusCode: 400, message: "chat.error.sendFailed", type: "validation")
        }
        guard !configuration.sendMessageFunctionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_SEND_MESSAGE_FUNCTION_ID")
        }

        let attemptedAt = Date()
        let response: [String: Any]
        let uploadedAttachment: UploadedAttachment?
        if let attachment {
            let participantUserIds = try await fetchParticipantUserIds(threadId: threadId)
            uploadedAttachment = try await uploadAttachmentIfNeeded(attachment, participantUserIds: participantUserIds)
        } else {
            uploadedAttachment = nil
        }
        var body: [String: Any] = [
            "threadId": threadId,
            "text": trimmed
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

        do {
            response = try await executeUserFunction(
                functionId: configuration.sendMessageFunctionId,
                body: body
            )
        } catch let error as AppwriteServiceError where error.statusCode == 500 {
            if let recoveredMessage = try await recoverRecentlySentMessage(
                threadId: threadId,
                text: trimmed,
                replyToMessageId: replyToMessageId,
                attachmentFileId: uploadedAttachment?.fileId,
                notBefore: attemptedAt.addingTimeInterval(-12)
            ) {
                return recoveredMessage
            }
            throw error
        }

        guard let remoteMessageId = stringValue(forKey: "messageId", in: response) else {
            if let recoveredMessage = try await recoverRecentlySentMessage(
                threadId: threadId,
                text: trimmed,
                replyToMessageId: replyToMessageId,
                attachmentFileId: uploadedAttachment?.fileId,
                notBefore: attemptedAt.addingTimeInterval(-12)
            ) {
                return recoveredMessage
            }

            throw AppwriteServiceError.invalidResponse
        }
        let createdAt = dateValue(forKey: "createdAt", in: response) ?? Date()
        let responseText = stringValue(forKey: "text", in: response) ?? trimmed
        let responseMessageType = MessageTypeDTO(
            rawValue: stringValue(forKey: "messageType", in: response)
                ?? uploadedAttachment?.type.rawValue
                ?? MessageTypeDTO.text.rawValue
        ) ?? .text

        return MessageDTO(
            id: stableUUID(from: remoteMessageId),
            remoteId: remoteMessageId,
            text: responseText,
            messageType: responseMessageType,
            attachment: uploadedAttachment.map {
                MessageAttachmentDTO(
                    fileId: $0.fileId,
                    name: $0.name,
                    mimeType: $0.mimeType,
                    size: $0.size,
                    width: $0.width,
                    height: $0.height,
                    duration: $0.duration
                )
            },
            isMe: true,
            time: Self.messageTimeFormatter.string(from: createdAt),
            sentAt: createdAt,
            replyToRemoteId: replyToMessageId,
            replyPreviewText: nil
        )
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

    func fetchThread(threadId: String, currentAccountId: String? = nil) async throws -> ThreadDTO? {
        let resolvedCurrentAccountId: String
        if let currentAccountId {
            resolvedCurrentAccountId = currentAccountId
        } else if let fetched = try await fetchCurrentAccountId(required: false) {
            resolvedCurrentAccountId = fetched
        } else {
            return nil
        }

        let participantRows = try await listRows(
            tableId: configuration.threadParticipantsTableId,
            queries: [
                AppwriteQuery.equal("threadId", values: [threadId]),
            ]
        )

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

        let messageRows = try await listRows(
            tableId: configuration.messagesTableId,
            queries: [
                AppwriteQuery.equal("threadId", values: [threadId]),
                AppwriteQuery.orderAsc("createdAt"),
            ]
        )

        let replyLookup: [String: String] = Dictionary(uniqueKeysWithValues: messageRows.compactMap { row -> (String, String)? in
            guard let remoteId = stringValue(forKey: "$id", in: row) else { return nil }
            return (remoteId, stringValue(forKey: "text", in: row) ?? "")
        })

        let messages = messageRows.compactMap { row in
            makeMessageDTO(from: row, currentAccountId: resolvedCurrentAccountId, replyLookup: replyLookup)
        }

        let presenceUpdatedAt = chatPeerDate(peer.presenceUpdatedAt)
        let lastSeenAt = chatPeerDate(peer.lastSeenAt)
        let isOnline = presenceUpdatedAt.map { Date().timeIntervalSince($0) <= 70 } ?? false
        let sortedMessages = messages.sorted { lhs, rhs in
            lhs.sentAt < rhs.sentAt
        }

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
            messages: sortedMessages
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

    func recoverRecentlySentMessage(threadId: String, text: String, replyToMessageId: String?, attachmentFileId: String?, notBefore: Date) async throws -> MessageDTO? {
        guard let currentAccountId = try await fetchCurrentAccountId(required: false) else {
            return nil
        }

        let rows = try await listRows(
            tableId: configuration.messagesTableId,
            queries: [
                AppwriteQuery.equal("threadId", values: [threadId]),
                AppwriteQuery.orderAsc("createdAt"),
            ]
        )

        for row in rows.reversed() {
            guard stringValue(forKey: "senderUserId", in: row) == currentAccountId else {
                continue
            }

            let rowText = stringValue(forKey: "text", in: row) ?? ""
            let rowAttachmentFileId = stringValue(forKey: "attachmentFileId", in: row)
            guard rowText == text, rowAttachmentFileId == attachmentFileId else {
                continue
            }

            let createdAt = dateValue(forKey: "createdAt", in: row)
                ?? dateValue(forKey: "$createdAt", in: row)
                ?? .distantPast
            guard createdAt >= notBefore else {
                continue
            }

            guard let remoteId = stringValue(forKey: "$id", in: row) else {
                continue
            }

            return MessageDTO(
                id: stableUUID(from: remoteId),
                remoteId: remoteId,
                text: rowText,
                messageType: MessageTypeDTO(rawValue: stringValue(forKey: "messageType", in: row) ?? "text") ?? .text,
                attachment: makeMessageAttachment(from: row),
                isMe: true,
                time: Self.messageTimeFormatter.string(from: createdAt),
                sentAt: createdAt,
                replyToRemoteId: replyToMessageId,
                replyPreviewText: nil
            )
        }

        return nil
    }

    func fetchParticipantUserIds(threadId: String) async throws -> [String] {
        let rows = try await listRows(
            tableId: configuration.threadParticipantsTableId,
            queries: [
                AppwriteQuery.equal("threadId", values: [threadId]),
            ]
        )

        return Array(Set(rows.compactMap { stringValue(forKey: "userId", in: $0) })).sorted()
    }

    func uploadAttachmentIfNeeded(_ attachment: OutgoingAttachmentDTO?, participantUserIds: [String]) async throws -> UploadedAttachment? {
        guard let attachment else { return nil }
        guard let bucketId = configuration.chatAttachmentsBucketId, !bucketId.isEmpty else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID")
        }

        guard let currentUserId = try await fetchCurrentAccountId(required: true),
              !currentUserId.isEmpty else {
            throw AppwriteServiceError.missingAccountId
        }
        let fileId = makeRandomIdentifier()
        _ = participantUserIds
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
            permissions: permissions
        )

        return UploadedAttachment(
            fileId: fileId,
            name: attachment.fileName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            width: attachment.width,
            height: attachment.height,
            duration: attachment.duration,
            type: attachment.type
        )
    }

    func uploadChatAttachment(
        data: Data,
        bucketId: String,
        fileId: String,
        fileName: String,
        mimeType: String,
        permissions: [String]
    ) async throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(
            url: url(
                pathComponents: [
                    "storage",
                    "buckets",
                    bucketId,
                    "files"
                ]
            )
        )
        request.httpMethod = "POST"
        request.setValue(configuration.projectId, forHTTPHeaderField: "X-Appwrite-Project")
        request.setValue("1.8.0", forHTTPHeaderField: "X-Appwrite-Response-Format")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = makeMultipartBody(
            boundary: boundary,
            fileId: fileId,
            fileName: fileName,
            mimeType: mimeType,
            fileData: data,
            permissions: permissions
        )

        let (responseData, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppwriteServiceError.invalidResponse
        }

        guard httpResponse.statusCode == 201 else {
            throw makeAPIError(from: responseData, statusCode: httpResponse.statusCode)
        }
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

private struct UploadedAttachment {
    let fileId: String
    let name: String?
    let mimeType: String?
    let size: Int?
    let width: Int?
    let height: Int?
    let duration: Int?
    let type: MessageTypeDTO
}
