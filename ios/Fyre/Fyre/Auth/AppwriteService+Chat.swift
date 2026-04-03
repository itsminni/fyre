import Foundation

extension AppwriteService {
    func createOrGetThread(otherUserId: String) async throws -> String {
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
        guard let thread = try await fetchThread(threadId: threadId) else {
            throw AppwriteServiceError.invalidResponse
        }
        return thread
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
                .last ?? .distantPast
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
            body["attachmentWidth"] = uploadedAttachment.width as Any
            body["attachmentHeight"] = uploadedAttachment.height as Any
            body["attachmentDuration"] = uploadedAttachment.duration as Any
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

        let remoteMessageId = stringValue(forKey: "messageId", in: response) ?? UUID().uuidString
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

    func submitSwipe(otherUserId: String, otherUserName: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO? {
        guard let functionId = configuration.recordSwipeFunctionId else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_RECORD_SWIPE_FUNCTION_ID")
        }

        var payload: [String: Any] = [
            "otherUserId": otherUserId,
            "decision": decision.rawValue
        ]
        if let otherUserName, !otherUserName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["otherUserName"] = otherUserName
        }

        let response = try await executeUserFunction(
            functionId: functionId,
            body: payload
        )

        let isMatch = boolValue(forKey: "matched", in: response) ?? false
        guard isMatch else { return nil }

        guard let threadId = stringValue(forKey: "threadId", in: response),
              let thread = try await fetchThread(threadId: threadId) else {
            throw AppwriteServiceError.invalidResponse
        }

        return thread
    }

    func markCurrentUserPresence(isOnline: Bool) async {
        guard let accountId = try? await fetchCurrentAccountId(required: false),
              let profileRow = try? await fetchProfileRow(id: accountId),
              let profileRowId = stringValue(forKey: "$id", in: profileRow) ?? stringValue(forKey: "userId", in: profileRow)
        else {
            return
        }

        let now = ISO8601DateFormatter().string(from: Date())
        var payload: [String: Any] = [
            "presenceUpdatedAt": now
        ]
        if !isOnline {
            payload["lastSeenAt"] = now
        }

        _ = try? await sendRequest(
            method: "PATCH",
            pathComponents: [
                "tablesdb",
                configuration.databaseId,
                "tables",
                configuration.profilesTableId,
                "rows",
                profileRowId
            ],
            jsonBody: ["data": payload]
        )
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

        guard let threadRow = try await fetchRowIfAccessible(tableId: configuration.threadsTableId, rowId: threadId) else {
            return nil
        }

        let participantRows = try await listRows(
            tableId: configuration.threadParticipantsTableId,
            queries: [
                AppwriteQuery.equal("threadId", values: [threadId]),
            ]
        )

        let participantUserIds = participantRows.compactMap { stringValue(forKey: "userId", in: $0) }
        let otherUserId = participantUserIds.first(where: { $0 != resolvedCurrentAccountId })

        let profileRow = try await fetchProfileRow(id: otherUserId ?? "")
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

        let threadName = ThreadNaming.displayName(
            firstName: stringValue(forKey: "firstName", in: profileRow),
            lastName: stringValue(forKey: "lastName", in: profileRow),
            email: stringValue(forKey: "email", in: profileRow),
            fallback: stringValue(forKey: "subject", in: threadRow)
        )
        let presenceUpdatedAt = dateValue(forKey: "presenceUpdatedAt", in: profileRow)
        let lastSeenAt = dateValue(forKey: "lastSeenAt", in: profileRow)
        let isOnline = presenceUpdatedAt.map { Date().timeIntervalSince($0) <= 70 } ?? false
        let sortedMessages = messages.sorted { lhs, rhs in
            lhs.sentAt < rhs.sentAt
        }

        return ThreadDTO(
            id: stableUUID(from: threadId),
            remoteId: threadId,
            name: threadName,
            avatar: "",
            isOnline: isOnline,
            lastSeenAt: lastSeenAt,
            participantUserIds: participantUserIds,
            messages: sortedMessages
        )
    }
}

private extension AppwriteService {
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

        let currentUserId = try await fetchCurrentAccountId(required: true) ?? ""
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
