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
        return try await fetchThreadAfterWrite(
            threadId: threadId,
            otherUserId: otherUserId,
            otherUserName: nil,
            fallbackRelationshipState: .matched
        )
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
        guard isMatch else {
            guard decision == .liked else { return nil }
            let responseRelationshipState = stringValue(forKey: "relationshipState", in: response)
                .flatMap(RelationshipStateDTO.init(rawValue:))
            guard response.isEmpty || responseRelationshipState == .matched else {
                return nil
            }
            return try await fetchMatchedThreadAfterSwipe(
                otherUserId: otherUserId,
                otherUserName: otherUserName
            )
        }

        guard let threadId = stringValue(forKey: "threadId", in: response) else {
            return try await fetchMatchedThreadAfterSwipe(
                otherUserId: otherUserId,
                otherUserName: otherUserName
            )
        }

        return try await fetchThreadAfterWrite(
            threadId: threadId,
            otherUserId: otherUserId,
            otherUserName: otherUserName,
            fallbackRelationshipState: .matched
        )
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

    func markThreadRead(threadId: String) async {
        guard let currentAccountId = try? await fetchCurrentAccountId(required: false) else {
            return
        }

        do {
            let participantRows = try await listRows(
                tableId: configuration.threadParticipantsTableId,
                queries: [
                    AppwriteQuery.equal("threadId", values: [threadId]),
                    AppwriteQuery.equal("userId", values: [currentAccountId])
                ]
            )

            guard let participantRow = participantRows.first,
                  let participantRowId = stringValue(forKey: "$id", in: participantRow) else {
                return
            }

            let now = ISO8601DateFormatter().string(from: Date())
            _ = try await sendRequest(
                method: "PATCH",
                pathComponents: [
                    "tablesdb",
                    configuration.databaseId,
                    "tables",
                    configuration.threadParticipantsTableId,
                    "rows",
                    participantRowId
                ],
                jsonBody: [
                        "data": [
                            "threadId": threadId,
                            "userId": currentAccountId,
                            "role": stringValue(forKey: "role", in: participantRow) ?? "participant",
                            "lastReadAt": now,
                            "muted": boolValue(forKey: "muted", in: participantRow) ?? false,
                            "pinned": boolValue(forKey: "pinned", in: participantRow) ?? false,
                            "notificationsEnabled": boolValue(forKey: "notificationsEnabled", in: participantRow) ?? true
                    ]
                ]
            )
        } catch {
#if DEBUG
            debugPrint("markThreadRead failed for \(threadId): \(error.localizedDescription)")
#endif
        }
    }

    func updateThreadNotifications(threadId: String, enabled: Bool) async throws {
        guard let currentAccountId = try await fetchCurrentAccountId(required: true) else {
            throw AppwriteServiceError.invalidResponse
        }
        let participantRows = try await listRows(
            tableId: configuration.threadParticipantsTableId,
            queries: [
                AppwriteQuery.equal("threadId", values: [threadId]),
                AppwriteQuery.equal("userId", values: [currentAccountId])
            ]
        )

        guard let participantRow = participantRows.first,
              let participantRowId = stringValue(forKey: "$id", in: participantRow) else {
            throw AppwriteServiceError.invalidResponse
        }

        var payload: [String: Any] = [
            "threadId": threadId,
            "userId": currentAccountId,
            "role": stringValue(forKey: "role", in: participantRow) ?? "participant",
            "muted": !enabled,
            "pinned": boolValue(forKey: "pinned", in: participantRow) ?? false,
            "notificationsEnabled": enabled
        ]
        if let lastReadAt = dateValue(forKey: "lastReadAt", in: participantRow) {
            payload["lastReadAt"] = ISO8601DateFormatter().string(from: lastReadAt)
        }

        _ = try await sendRequest(
            method: "PATCH",
            pathComponents: [
                "tablesdb",
                configuration.databaseId,
                "tables",
                configuration.threadParticipantsTableId,
                "rows",
                participantRowId
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

        let threadRow = try await fetchRowIfAccessible(tableId: configuration.threadsTableId, rowId: threadId)

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
        let otherUserId = participantUserIds.first(where: { $0 != resolvedCurrentAccountId })
        let relationshipState = try await fetchRelationshipState(
            currentAccountId: resolvedCurrentAccountId,
            otherUserId: otherUserId
        )

        guard await relationshipState.isVisibleInInbox else {
            return nil
        }
        let currentParticipantRow = participantRows
            .first(where: { stringValue(forKey: "userId", in: $0) == resolvedCurrentAccountId })
        let currentUserReadAt = currentParticipantRow
            .flatMap { dateValue(forKey: "lastReadAt", in: $0) }
        let notificationsEnabled = currentParticipantRow.map(threadNotificationsEnabled(from:)) ?? true
        let otherParticipantReadAt = participantRows
            .first(where: { stringValue(forKey: "userId", in: $0) == otherUserId })
            .flatMap { dateValue(forKey: "lastReadAt", in: $0) }

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
            avatar: threadAvatarURLString(from: profileRow),
            isOnline: isOnline,
            lastSeenAt: lastSeenAt,
            currentUserReadAt: currentUserReadAt,
            otherParticipantReadAt: otherParticipantReadAt,
            participantUserIds: participantUserIds,
            notificationsEnabled: notificationsEnabled,
            relationshipState: relationshipState,
            messages: sortedMessages
        )
    }
}

private extension AppwriteService {
    func fetchMatchedThreadAfterSwipe(otherUserId: String, otherUserName: String?) async throws -> ThreadDTO? {
        var lastError: Error?

        for attempt in 0..<5 {
            do {
                if try await hasMatchedRelationshipWithCurrentUser(otherUserId: otherUserId) {
                    let threadId = try await createOrGetThread(otherUserId: otherUserId)
                    return try await fetchThreadAfterWrite(
                        threadId: threadId,
                        otherUserId: otherUserId,
                        otherUserName: otherUserName,
                        fallbackRelationshipState: .matched
                    )
                }
            } catch {
                lastError = error
            }

            if attempt < 4 {
                try await Task.sleep(nanoseconds: 250_000_000)
            }
        }

#if DEBUG
        if let lastError {
            debugPrint("Swipe match fallback failed: \(lastError.localizedDescription)")
        }
#endif
        return nil
    }

    func hasMatchedRelationshipWithCurrentUser(otherUserId: String) async throws -> Bool {
        guard let currentAccountId = try await fetchCurrentAccountId(required: false) else {
            return false
        }

        let relationshipState = try await fetchRelationshipState(
            currentAccountId: currentAccountId,
            otherUserId: otherUserId
        )
        if relationshipState == .matched {
            return true
        }

        return try await hasLegacyMatch(
            currentAccountId: currentAccountId,
            otherUserId: otherUserId
        )
    }

    func fetchThreadAfterWrite(
        threadId: String,
        otherUserId: String,
        otherUserName: String?,
        fallbackRelationshipState: RelationshipStateDTO
    ) async throws -> ThreadDTO {
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

        if let currentAccountId = try await fetchCurrentAccountId(required: false) {
            let profileRow = try? await fetchProfileRow(id: otherUserId)
            let presenceUpdatedAt = dateValue(forKey: "presenceUpdatedAt", in: profileRow)
            let fallbackName = ThreadNaming.displayName(
                firstName: stringValue(forKey: "firstName", in: profileRow),
                lastName: stringValue(forKey: "lastName", in: profileRow),
                email: stringValue(forKey: "email", in: profileRow),
                fallback: otherUserName
            )

            return ThreadDTO(
                id: stableUUID(from: threadId),
                remoteId: threadId,
                name: fallbackName,
                avatar: threadAvatarURLString(from: profileRow),
                isOnline: presenceUpdatedAt.map { Date().timeIntervalSince($0) <= 70 } ?? false,
                lastSeenAt: dateValue(forKey: "lastSeenAt", in: profileRow),
                currentUserReadAt: nil,
                otherParticipantReadAt: nil,
                participantUserIds: [currentAccountId, otherUserId],
                notificationsEnabled: true,
                relationshipState: fallbackRelationshipState,
                messages: []
            )
        }

        if let lastError {
            throw lastError
        }

        throw AppwriteServiceError.invalidResponse
    }

    func fetchRelationshipState(currentAccountId: String, otherUserId: String?) async throws -> RelationshipStateDTO {
        guard let otherUserId, !otherUserId.isEmpty else {
            return .none
        }

        guard let relationshipRow = try await fetchRelationshipRow(
            currentAccountId: currentAccountId,
            otherUserId: otherUserId
        ) else {
            if try await hasLegacyMatch(currentAccountId: currentAccountId, otherUserId: otherUserId) {
                return .matched
            }
            return configuration.relationshipsTableId == nil ? .matched : .none
        }

        let isCurrentUserA = stringValue(forKey: "userAId", in: relationshipRow) == currentAccountId
        let currentState = stringValue(
            forKey: isCurrentUserA ? "userAState" : "userBState",
            in: relationshipRow
        )
        let otherState = stringValue(
            forKey: isCurrentUserA ? "userBState" : "userAState",
            in: relationshipRow
        )

        if currentState == RelationshipStateDTO.blocked.rawValue || otherState == RelationshipStateDTO.blocked.rawValue {
            return .blocked
        }

        if currentState == RelationshipStateDTO.archived.rawValue {
            return .archived
        }

        if dateValue(forKey: "matchedAt", in: relationshipRow) != nil
            || currentState == RelationshipStateDTO.matched.rawValue
            || otherState == RelationshipStateDTO.matched.rawValue {
            return .matched
        }

        if currentState == RelationshipStateDTO.liked.rawValue {
            return .liked
        }

        return .none
    }

    func fetchRelationshipRow(currentAccountId: String, otherUserId: String) async throws -> [String: Any]? {
        guard let relationshipsTableId = configuration.relationshipsTableId else {
            return nil
        }

        let pairKey = [currentAccountId, otherUserId]
            .sorted()
            .joined(separator: ":")

        let rows = try await listRows(
            tableId: relationshipsTableId,
            queries: [
                AppwriteQuery.equal("pairKey", values: [pairKey]),
                AppwriteQuery.limit(1)
            ]
        )

        return rows.first
    }

    func hasLegacyMatch(currentAccountId: String, otherUserId: String) async throws -> Bool {
        guard let matchesTableId = configuration.matchesTableId else {
            return false
        }

        let pairKey = [currentAccountId, otherUserId]
            .sorted()
            .joined(separator: ":")

        let rows = try await listRows(
            tableId: matchesTableId,
            queries: [
                AppwriteQuery.equal("matchKey", values: [pairKey]),
                AppwriteQuery.limit(1)
            ]
        )

        return !rows.isEmpty
    }

    func threadAvatarURLString(from profileRow: [String: Any]?) -> String {
        if let fileId = threadAvatarFileId(from: profileRow),
           let storageURL = threadAvatarStorageURL(fileId: fileId) {
            return storageURL.absoluteString
        }

        if let directURL = threadDirectAvatarURL(from: profileRow) {
            return directURL.absoluteString
        }

        return ""
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

    private func threadAvatarFileId(from profileRow: [String: Any]?) -> String? {
        let fileIdKeys = [
            "avatarFileId",
            "profileImageFileId",
            "profilePhotoFileId",
            "imageFileId"
        ]

        for key in fileIdKeys {
            if let fileId = stringValue(forKey: key, in: profileRow) {
                return fileId
            }
        }

        return chatStringArrayValue(forKey: "photoFileIds", in: profileRow).first
    }

    private func threadAvatarStorageURL(fileId: String) -> URL? {
        guard !fileId.isEmpty else { return nil }

        var url = configuration.endpointURL
        url.appendPathComponent("storage")
        url.appendPathComponent("buckets")
        url.appendPathComponent(configuration.avatarsBucketId)
        url.appendPathComponent("files")
        url.appendPathComponent(fileId)
        url.appendPathComponent("view")

        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "project", value: configuration.projectId)
        ]
        return components?.url
    }

    private func threadDirectAvatarURL(from profileRow: [String: Any]?) -> URL? {
        let urlKeys = [
            "avatar",
            "avatarUrl",
            "profileImageUrl",
            "profilePhotoUrl",
            "imageUrl"
        ]

        for key in urlKeys {
            if let value = stringValue(forKey: key, in: profileRow),
               let parsed = URL(string: value),
               let scheme = parsed.scheme?.lowercased(),
               scheme == "http" || scheme == "https" {
                return parsed
            }
        }

        let photoURLKeys = ["photos", "profilePhotos"]
        return photoURLKeys
            .lazy
            .flatMap { self.chatStringArrayValue(forKey: $0, in: profileRow) }
            .lazy
            .compactMap { URL(string: $0) }
            .first
    }

    private func chatStringArrayValue(forKey key: String, in dictionary: [String: Any]?) -> [String] {
        if let values = dictionary?[key] as? [String] {
            return values
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }

        if let values = dictionary?[key] as? [Any] {
            return values
                .compactMap { $0 as? String }
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }

        if let rawValue = dictionary?[key] as? String {
            let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return [] }

            if trimmed.hasPrefix("["),
               let data = trimmed.data(using: .utf8),
               let decodedArray = try? JSONDecoder().decode([String].self, from: data) {
                return decodedArray
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            }

            return trimmed
                .split(whereSeparator: { $0 == "," || $0 == "\n" || $0 == "|" })
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }

        return []
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
