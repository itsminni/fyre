import Foundation

struct MainEventRemoteState: Sendable {
    let eventId: String
    let snapshot: MainEventSnapshot
    let currentStatus: EventHistoryStatus?
    let history: [EventHistoryItem]
}

actor AppwriteService {
    private let configuration: AppwriteConfiguration
    private let session: URLSession
    private var cachedFunctionJWT: (value: String, expiresAt: Date)?

    init(configuration: AppwriteConfiguration) {
        self.configuration = configuration

        let sessionConfiguration = URLSessionConfiguration.default
        sessionConfiguration.httpCookieStorage = HTTPCookieStorage.shared
        sessionConfiguration.httpCookieAcceptPolicy = .always
        sessionConfiguration.httpShouldSetCookies = true
        session = URLSession(configuration: sessionConfiguration)
    }

    func signUp(email: String, password: String) async throws -> User {
        do {
            try await createAccount(email: email, password: password)
        } catch let error as AppwriteServiceError where error.statusCode == 409 {
            do {
                return try await logIn(email: email, password: password)
            } catch {
                throw error
            }
        }

        return try await logIn(email: email, password: password)
    }

    func logIn(email: String, password: String) async throws -> User {
        try await createEmailSession(email: email, password: password)

        guard let user = try await fetchCurrentUser(required: true) else {
            throw AppwriteServiceError.invalidResponse
        }

        return user
    }

    func restoreCurrentUser() async throws -> User? {
        try await fetchCurrentUser(required: false)
    }

    func logOut() async throws {
        _ = try await sendRequest(
            method: "DELETE",
            pathComponents: ["account", "sessions", "current"],
            expectedStatusCodes: [204]
        )
        clearCookies()
        cachedFunctionJWT = nil
    }

    func updateProfile(for user: User) async throws -> User {
        let accountId = try await resolvedRequiredAccountId(from: user)
        var updatedUser = user
        updatedUser.appwriteUserId = accountId

        var uploadedFileId: String?
        if let imageData = updatedUser.profileImageData,
           !imageData.isEmpty,
           updatedUser.avatarFileId?.isEmpty != false {
            let fileId = makeRandomIdentifier()
            try await uploadAvatar(data: imageData, fileId: fileId)
            updatedUser.avatarFileId = fileId
            uploadedFileId = fileId
        }

        do {
            return try await ensureProfileRow(for: updatedUser)
        } catch {
            if let uploadedFileId {
                try? await deleteAvatar(fileId: uploadedFileId)
            }
            throw error
        }
    }

    func updateProfileImage(_ imageData: Data?, for user: User) async throws -> User {
        let accountId = try await resolvedRequiredAccountId(from: user)
        let previousFileId = user.avatarFileId

        var nextFileId: String?
        if let imageData, !imageData.isEmpty {
            nextFileId = makeRandomIdentifier()
            try await uploadAvatar(data: imageData, fileId: nextFileId!)
        }

        var updatedUser = user
        updatedUser.appwriteUserId = accountId
        updatedUser.avatarFileId = nextFileId
        updatedUser.profileImageData = imageData

        do {
            updatedUser = try await updateProfile(for: updatedUser)
        } catch {
            if let nextFileId {
                try? await deleteAvatar(fileId: nextFileId)
            }
            throw error
        }

        if let previousFileId, previousFileId != nextFileId {
            try? await deleteAvatar(fileId: previousFileId)
        }

        return updatedUser
    }

    func fetchMainEventState(for user: User?) async throws -> MainEventRemoteState? {
        let upcomingEvents = try await fetchUpcomingEventRows()
        guard let mainEvent = upcomingEvents.first else { return nil }

        let eventId = stringValue(forKey: "$id", in: mainEvent) ?? ""
        let eventRegistrations = try await listRows(
            tableId: configuration.eventRegistrationsTableId,
            queries: [
                AppwriteQuery.equal("eventId", values: [eventId])
            ]
        )

        let snapshot = makeMainEventSnapshot(eventRow: mainEvent, registrations: eventRegistrations)
        let accountId = try await resolvedAccountId(from: user)
        let currentStatus = eventRegistrations
            .first(where: { stringValue(forKey: "userId", in: $0) == accountId })
            .flatMap { eventHistoryStatus(for: stringValue(forKey: "status", in: $0)) }

        let history = try await makeEventHistory(for: accountId, events: upcomingEvents)

        return MainEventRemoteState(
            eventId: eventId,
            snapshot: snapshot,
            currentStatus: currentStatus,
            history: history
        )
    }

    func registerForMainEvent(for user: User, eventId: String? = nil) async throws -> EventHistoryStatus {
        _ = try await resolvedRequiredAccountId(from: user)
        var body: [String: Any] = [:]
        if let eventId, !eventId.isEmpty {
            body["eventId"] = eventId
        }

        // Let the function resolve the current event when the client cannot read the events table directly.
        let response = try await executeFunction(
            functionId: configuration.registerForEventFunctionId,
            body: body
        )

        guard let status = eventHistoryStatus(for: stringValue(forKey: "status", in: response)) else {
            throw AppwriteServiceError.invalidResponse
        }

        return status
    }

    func cancelMainEventRegistration(for user: User, eventId: String? = nil, force: Bool = false) async throws {
        _ = try await resolvedRequiredAccountId(from: user)
        var body: [String: Any] = [
            "force": force
        ]
        if let eventId, !eventId.isEmpty {
            body["eventId"] = eventId
        }

        // Mirror the register flow so cancellation can still run even if event reads are private to Functions.
        _ = try await executeFunction(
            functionId: configuration.cancelEventRegistrationFunctionId,
            body: body
        )
    }

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

    func fetchDiscoverProfiles() async throws -> [ProfileDTO] {
        // Prefer the server-side projection when available so discover can stay privacy-safe.
        if let functionId = configuration.discoverProfilesFunctionId {
            let response = try await executeUserFunction(functionId: functionId, body: [:])
            if let profiles = response["profiles"] as? [[String: Any]] {
                let mappedProfiles = profiles.compactMap(makeDiscoverProfileDTO(from:))
                return mappedProfiles
            }
        }

        let currentAccountId = try await fetchCurrentAccountId(required: false)
        let excludedUserIds = try await excludedDiscoverUserIds(currentAccountId: currentAccountId)
        let rows = try await listRows(
            tableId: configuration.profilesTableId,
            queries: []
        )

        let mappedProfiles: [ProfileDTO] = rows.compactMap { (row: [String: Any]) -> ProfileDTO? in
            guard let userId = stringValue(forKey: "userId", in: row),
                  userId != currentAccountId,
                  !excludedUserIds.contains(userId),
                  let _ = genderValue(for: stringValue(forKey: "gender", in: row)) else {
                return nil
            }
            return makeDiscoverProfileDTO(from: row)
        }
        return mappedProfiles
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
                .compactMap { Self.messageTimeFormatter.date(from: $0.time) }
                .last ?? .distantPast
            threads.append((thread, lastActivity))
        }

        return threads
            .sorted(by: { $0.lastActivity > $1.lastActivity })
            .map(\.thread)
    }

    func sendMessage(threadId: String, text: String) async throws -> MessageDTO {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw AppwriteServiceError.api(statusCode: 400, message: "chat.error.sendFailed", type: "validation")
        }

        let attemptedAt = Date()
        let response: [String: Any]

        do {
            response = try await executeUserFunction(
                functionId: configuration.sendMessageFunctionId,
                body: [
                    "threadId": threadId,
                    "text": trimmed
                ]
            )
        } catch let error as AppwriteServiceError where error.statusCode == 500 {
            if let recoveredMessage = try await recoverRecentlySentMessage(
                threadId: threadId,
                text: trimmed,
                notBefore: attemptedAt.addingTimeInterval(-12)
            ) {
                return recoveredMessage
            }
            throw error
        }

        let remoteMessageId = stringValue(forKey: "messageId", in: response) ?? UUID().uuidString
        let createdAt = dateValue(forKey: "createdAt", in: response) ?? Date()
        let responseText = stringValue(forKey: "text", in: response) ?? trimmed

        return MessageDTO(
            id: stableUUID(from: remoteMessageId),
            text: responseText,
            isMe: true,
            time: Self.messageTimeFormatter.string(from: createdAt)
        )
    }

    func submitSwipe(otherUserId: String, otherUserName: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO? {
        guard let functionId = configuration.recordSwipeFunctionId else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_RECORD_SWIPE_FUNCTION_ID")
        }

        // The backend owns match detection so two clients can't create duplicate chats on race conditions.
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

    private func fetchThread(threadId: String, currentAccountId: String? = nil) async throws -> ThreadDTO? {
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

        let otherUserId = participantRows
            .compactMap { stringValue(forKey: "userId", in: $0) }
            .first(where: { $0 != resolvedCurrentAccountId })

        let profileRow = try await fetchProfileRow(id: otherUserId ?? "")
        let messageRows = try await listRows(
            tableId: configuration.messagesTableId,
            queries: [
                AppwriteQuery.equal("threadId", values: [threadId]),
                AppwriteQuery.orderAsc("createdAt"),
            ]
        )

        let messages = messageRows.compactMap { row in
            makeMessageDTO(from: row, currentAccountId: resolvedCurrentAccountId)
        }

        let threadName = displayName(
            from: profileRow,
            fallback: stringValue(forKey: "subject", in: threadRow)
        )
        let lastMessageAt = dateValue(forKey: "lastMessageAt", in: threadRow)
            ?? messageRows.compactMap { dateValue(forKey: "createdAt", in: $0) }.last
            ?? .distantPast

        let sortedMessages = messages.sorted { lhs, rhs in
            (Self.messageTimeFormatter.date(from: lhs.time) ?? .distantPast) <
            (Self.messageTimeFormatter.date(from: rhs.time) ?? .distantPast)
        }

        _ = lastMessageAt

        return ThreadDTO(
            id: stableUUID(from: threadId),
            remoteId: threadId,
            name: threadName,
            avatar: "",
            isOnline: false,
            messages: sortedMessages
        )
    }

    private func recoverRecentlySentMessage(threadId: String, text: String, notBefore: Date) async throws -> MessageDTO? {
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
            guard rowText == text else {
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
                text: rowText,
                isMe: true,
                time: Self.messageTimeFormatter.string(from: createdAt)
            )
        }

        return nil
    }

    private func ensureProfileRow(for user: User) async throws -> User {
        let accountId = try await resolvedRequiredAccountId(from: user)
        let payload = makeProfilePayload(for: user)

        // Use the Auth account id as the profile row id so auth and profile stay trivially linked.
        if try await fetchProfileRow(id: accountId) == nil {
            _ = try await sendRequest(
                method: "POST",
                pathComponents: [
                    "tablesdb",
                    configuration.databaseId,
                    "tables",
                    configuration.profilesTableId,
                    "rows"
                ],
                jsonBody: [
                    "rowId": accountId,
                    "data": payload
                ],
                expectedStatusCodes: [201]
            )
        } else {
            _ = try await sendRequest(
                method: "PATCH",
                pathComponents: [
                    "tablesdb",
                    configuration.databaseId,
                    "tables",
                    configuration.profilesTableId,
                    "rows",
                    accountId
                ],
                jsonBody: [
                    "data": payload
                ],
                expectedStatusCodes: [200]
            )
        }

        var updatedUser = user
        updatedUser.appwriteUserId = accountId
        return updatedUser
    }

    private func fetchCurrentUser(required: Bool) async throws -> User? {
        guard let account = try await fetchCurrentAccount(required: required) else {
            return nil
        }

        // Auth stores the account shell; hydrateUser merges in the app-specific profile row and avatar file.
        return try await hydrateUser(account: account)
    }

    private func fetchCurrentAccount(required: Bool) async throws -> [String: Any]? {
        do {
            return try await sendJSONObjectRequest(
                method: "GET",
                pathComponents: ["account"]
            )
        } catch let error as AppwriteServiceError where error.isUnauthorized {
            clearCookies()
            if required {
                throw error
            }
            return nil
        }
    }

    private func hydrateUser(account: [String: Any]) async throws -> User {
        let accountId = stringValue(forKey: "$id", in: account) ?? ""
        let email = stringValue(forKey: "email", in: account) ?? ""
        let profileRow = try await fetchProfileRow(id: accountId)
        let avatarData = try await fetchAvatarData(fileId: stringValue(forKey: "avatarFileId", in: profileRow))

        var user = User(email: email, password: "")
        user.appwriteUserId = accountId
        user.firstName = stringValue(forKey: "firstName", in: profileRow)
        user.lastName = stringValue(forKey: "lastName", in: profileRow)
        user.city = stringValue(forKey: "city", in: profileRow)
        user.birthDate = dateValue(forKey: "birthDate", in: profileRow)
        user.gender = genderValue(for: stringValue(forKey: "gender", in: profileRow))
        user.orientation = orientationValue(for: stringValue(forKey: "orientation", in: profileRow))
        user.showMe = showMeValue(for: stringValue(forKey: "showMe", in: profileRow)) ?? .everyone
        user.smokes = boolValue(forKey: "smokes", in: profileRow)
        user.drinks = boolValue(forKey: "drinks", in: profileRow)
        user.hobbies = stringValue(forKey: "hobbies", in: profileRow)
        user.passions = stringValue(forKey: "passions", in: profileRow)
        user.lookingFor = stringValue(forKey: "lookingFor", in: profileRow)
        user.favoriteSong = stringValue(forKey: "favoriteSong", in: profileRow)
        user.favoriteMovie = stringValue(forKey: "favoriteMovie", in: profileRow)
        user.avatarFileId = stringValue(forKey: "avatarFileId", in: profileRow)
        user.profileImageData = avatarData
        return user
    }

    private func fetchCurrentAccountId(required: Bool) async throws -> String? {
        guard let account = try await fetchCurrentAccount(required: required) else {
            return nil
        }

        return stringValue(forKey: "$id", in: account)
    }

    private func fetchProfileRow(id rowId: String) async throws -> [String: Any]? {
        guard !rowId.isEmpty else { return nil }

        if let row = try await fetchRowIfAccessible(tableId: configuration.profilesTableId, rowId: rowId) {
            return row
        }

        do {
            let rows = try await listRows(
                tableId: configuration.profilesTableId,
                queries: [
                    AppwriteQuery.equal("userId", values: [rowId])
                ]
            )

            return rows.first
        } catch let error as AppwriteServiceError
            where error.statusCode == 401 || error.statusCode == 403 || error.statusCode == 404 {
            return nil
        }
    }

    private func fetchRowIfAccessible(tableId: String, rowId: String) async throws -> [String: Any]? {
        do {
            return try await sendJSONObjectRequest(
                method: "GET",
                pathComponents: [
                    "tablesdb",
                    configuration.databaseId,
                    "tables",
                    tableId,
                    "rows",
                    rowId
                ]
            )
        } catch let error as AppwriteServiceError
            where error.statusCode == 401 || error.statusCode == 403 || error.statusCode == 404 {
            return nil
        }
    }

    private func fetchAvatarData(fileId: String?) async throws -> Data? {
        guard let fileId, !fileId.isEmpty else { return nil }

        do {
            return try await sendRequest(
                method: "GET",
                pathComponents: [
                    "storage",
                    "buckets",
                    configuration.avatarsBucketId,
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

    private func fetchUpcomingEventRows() async throws -> [[String: Any]] {
        let rows = try await listRows(
            tableId: configuration.eventsTableId,
            queries: [
                AppwriteQuery.orderAsc("startsAt"),
            ]
        )

        let now = Date()
        return rows.filter { row in
            let status = stringValue(forKey: "status", in: row)?.lowercased()
            guard status != "cancelled" else { return false }
            guard let startsAt = dateValue(forKey: "startsAt", in: row) else { return true }
            return startsAt >= now
        }
    }

    private func makeEventHistory(for accountId: String?, events: [[String: Any]]) async throws -> [EventHistoryItem] {
        guard let accountId, !accountId.isEmpty else { return [] }

        let registrations = try await listRows(
            tableId: configuration.eventRegistrationsTableId,
            queries: [
                AppwriteQuery.equal("userId", values: [accountId]),
            ]
        )

        var eventsById: [String: [String: Any]] = [:]
        for event in events {
            if let eventId = stringValue(forKey: "$id", in: event) {
                eventsById[eventId] = event
            }
        }

        return registrations.compactMap { registration in
            guard let eventId = stringValue(forKey: "eventId", in: registration),
                  let event = eventsById[eventId],
                  let status = eventHistoryStatus(for: stringValue(forKey: "status", in: registration)),
                  let eventDate = dateValue(forKey: "startsAt", in: event) else {
                return nil
            }

            return EventHistoryItem(
                id: stableUUID(from: stringValue(forKey: "$id", in: registration) ?? UUID().uuidString),
                eventTitle: stringValue(forKey: "title", in: event) ?? "Event",
                eventDate: eventDate,
                status: status,
                timestamp: dateValue(forKey: "$updatedAt", in: registration)
                    ?? dateValue(forKey: "createdAt", in: registration)
                    ?? dateValue(forKey: "$createdAt", in: registration)
                    ?? eventDate
            )
        }
        .sorted(by: { $0.timestamp > $1.timestamp })
    }

    private func excludedDiscoverUserIds(currentAccountId: String?) async throws -> Set<String> {
        guard let currentAccountId, !currentAccountId.isEmpty else { return [] }

        var excluded = Set<String>()

        // Hide profiles already handled locally when discover falls back to direct table reads.
        if let swipesTableId = configuration.swipesTableId {
            let swipeRows = try await listRows(
                tableId: swipesTableId,
                queries: [
                    AppwriteQuery.equal("fromUserId", values: [currentAccountId]),
                ]
            )

            for row in swipeRows {
                if let userId = stringValue(forKey: "toUserId", in: row) {
                    excluded.insert(userId)
                }
            }
        }

        if let matchesTableId = configuration.matchesTableId {
            let matchRows = try await listRows(
                tableId: matchesTableId,
                queries: [
                ]
            )

            for row in matchRows {
                let userAId = stringValue(forKey: "userAId", in: row)
                let userBId = stringValue(forKey: "userBId", in: row)

                if userAId == currentAccountId, let userBId {
                    excluded.insert(userBId)
                } else if userBId == currentAccountId, let userAId {
                    excluded.insert(userAId)
                }
            }
        }

        return excluded
    }

    private func makeMainEventSnapshot(eventRow: [String: Any], registrations: [[String: Any]]) -> MainEventSnapshot {
        let confirmedStatuses: Set<String> = ["confirmed", "promoted"]
        let confirmedRows = registrations.filter {
            guard let status = stringValue(forKey: "status", in: $0)?.lowercased() else { return false }
            return confirmedStatuses.contains(status)
        }

        let maleCount = confirmedRows.filter { stringValue(forKey: "gender", in: $0) == "male" }.count
        let femaleCount = confirmedRows.filter { stringValue(forKey: "gender", in: $0) == "female" }.count
        let waitingListCount = registrations.filter { stringValue(forKey: "status", in: $0) == "waitlisted" }.count

        return MainEventSnapshot(
            date: dateValue(forKey: "startsAt", in: eventRow) ?? Date(),
            title: stringValue(forKey: "title", in: eventRow) ?? "Event",
            maxParticipants: intValue(forKey: "maxParticipants", in: eventRow) ?? 48,
            maleCount: maleCount,
            femaleCount: femaleCount,
            waitingListCount: waitingListCount
        )
    }

    private func resolvedAccountId(from user: User?) async throws -> String? {
        if let accountId = user?.appwriteUserId?.trimmingCharacters(in: .whitespacesAndNewlines),
           !accountId.isEmpty {
            return accountId
        }

        return try await fetchCurrentAccountId(required: false)
    }

    private func resolvedRequiredAccountId(from user: User?) async throws -> String {
        // Old persisted sessions may miss appwriteUserId; recover from /account before failing the request.
        guard let accountId = try await resolvedAccountId(from: user) else {
            throw AppwriteServiceError.missingAccountId
        }

        return accountId
    }

    private func executeUserFunction(functionId: String, body: [String: Any]) async throws -> [String: Any] {
        var payload = body
        if payload["currentUserId"] == nil,
           let currentUserId = try await fetchCurrentAccountId(required: true) {
            payload["currentUserId"] = currentUserId
        }

        if let response = try await executeFunctionDirectly(functionId: functionId, body: payload),
           !response.isEmpty {
            return response
        }
#if DEBUG
        debugPrint("Direct function invoke returned no JSON payload for \(functionId). Falling back to execution polling.")
#endif
        return try await executeFunction(functionId: functionId, body: payload)
    }

    private func executeFunction(functionId: String, body: [String: Any]) async throws -> [String: Any] {
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let bodyString = String(decoding: bodyData, as: UTF8.self)

        // Run Functions synchronously from the client so the UI can refresh derived state right away.
        let execution = try await sendJSONObjectRequest(
            method: "POST",
            pathComponents: ["functions", functionId, "executions"],
            jsonBody: [
                "body": bodyString,
                "async": false
            ],
            expectedStatusCodes: [201]
        )

        guard let executionId = stringValue(forKey: "$id", in: execution) else {
            throw AppwriteServiceError.invalidResponse
        }

        let initialStatus = stringValue(forKey: "status", in: execution)?.lowercased() ?? ""
        if initialStatus == "completed" || initialStatus == "failed" || initialStatus == "crashed" {
            return try decodeExecutionResponse(from: execution)
        }

        return try await waitForExecution(functionId: functionId, executionId: executionId)
    }

    private func executeFunctionDirectly(functionId: String, body: [String: Any]) async throws -> [String: Any]? {
        guard let directURL = generatedFunctionURL(functionId: functionId) else {
#if DEBUG
            debugPrint("Unable to derive generated Appwrite function URL for \(functionId) from endpoint \(configuration.endpointURL.absoluteString)")
#endif
            return nil
        }

        let jwt = try await fetchFunctionJWT()
        var request = URLRequest(url: directURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(jwt, forHTTPHeaderField: "x-appwrite-user-jwt")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw AppwriteServiceError.invalidResponse
            }

            guard (200..<300).contains(httpResponse.statusCode) else {
#if DEBUG
                let rawBody = String(data: data, encoding: .utf8) ?? "<non-utf8>"
                debugPrint("Direct function invoke failed for \(functionId) @ \(directURL.absoluteString) status=\(httpResponse.statusCode) body=\(rawBody)")
#endif
                throw makeAPIError(from: data, statusCode: httpResponse.statusCode)
            }

            if data.isEmpty {
#if DEBUG
                debugPrint("Direct function invoke returned empty body for \(functionId) @ \(directURL.absoluteString)")
#endif
                return [:]
            }

#if DEBUG
            let rawBody = String(data: data, encoding: .utf8) ?? "<non-utf8>"
            debugPrint("Direct function invoke succeeded for \(functionId) @ \(directURL.absoluteString) body=\(rawBody)")
#endif
            return try decodeJSONObject(from: data)
        } catch let error as AppwriteServiceError {
            throw error
        } catch {
#if DEBUG
            debugPrint("Direct function invoke network error for \(functionId) @ \(directURL.absoluteString): \(error.localizedDescription)")
#endif
            throw AppwriteServiceError.network(error)
        }
    }

    private func fetchFunctionJWT() async throws -> String {
        if let cachedFunctionJWT, cachedFunctionJWT.expiresAt > Date() {
            return cachedFunctionJWT.value
        }

        let response = try await sendJSONObjectRequest(
            method: "POST",
            pathComponents: ["account", "jwts"],
            jsonBody: [
                "duration": 900
            ],
            expectedStatusCodes: [201]
        )

        guard let jwt = stringValue(forKey: "jwt", in: response) else {
            throw AppwriteServiceError.invalidResponse
        }

        let expiresAt = Date().addingTimeInterval(14 * 60)
        cachedFunctionJWT = (value: jwt, expiresAt: expiresAt)
        return jwt
    }

    private func generatedFunctionURL(functionId: String) -> URL? {
        if let configuredURL = configuredFunctionURL(functionId: functionId) {
            return configuredURL
        }

        guard let host = configuration.endpointURL.host else { return nil }
        let segments = host.split(separator: ".")
        guard segments.count >= 4, segments[1] == "cloud", segments[2] == "appwrite", segments[3] == "io" else {
            return nil
        }

        let region = String(segments[0])
        var components = URLComponents()
        components.scheme = "https"
        components.host = "\(functionId).\(region).appwrite.run"
        // Appwrite Functions domains default to the "empty" response type unless type=json is requested.
        components.queryItems = [
            URLQueryItem(name: "type", value: "json")
        ]
        return components.url
    }

    private func configuredFunctionURL(functionId: String) -> URL? {
        let configuredURL: URL?

        if configuration.discoverProfilesFunctionId == functionId {
            configuredURL = configuration.discoverProfilesFunctionDomain
        } else if configuration.recordSwipeFunctionId == functionId {
            configuredURL = configuration.recordSwipeFunctionDomain
        } else if configuration.createOrGetThreadFunctionId == functionId {
            configuredURL = configuration.createOrGetThreadFunctionDomain
        } else if configuration.sendMessageFunctionId == functionId {
            configuredURL = configuration.sendMessageFunctionDomain
        } else {
            configuredURL = nil
        }

        guard var components = configuredURL.flatMap({ URLComponents(url: $0, resolvingAgainstBaseURL: false) }) else {
            return nil
        }

        var queryItems = components.queryItems ?? []
        if !queryItems.contains(where: { $0.name == "type" }) {
            queryItems.append(URLQueryItem(name: "type", value: "json"))
        }
        components.queryItems = queryItems
        return components.url
    }

    private func waitForExecution(functionId: String, executionId: String) async throws -> [String: Any] {
        for attempt in 0..<60 {
            let execution = try await sendJSONObjectRequest(
                method: "GET",
                pathComponents: ["functions", functionId, "executions", executionId]
            )

            let status = stringValue(forKey: "status", in: execution)?.lowercased() ?? ""
            if status == "completed" || status == "failed" || status == "crashed" {
                return try decodeExecutionResponse(from: execution)
            }

            // Functions can sit in queue during cold starts; back off slightly after early polls.
            let wait = attempt < 10 ? 300_000_000 : 500_000_000
            try await Task.sleep(nanoseconds: UInt64(wait))
        }

        throw AppwriteServiceError.invalidResponse
    }

    private func decodeExecutionResponse(from execution: [String: Any]) throws -> [String: Any] {
        let statusCode = intValue(forKey: "responseStatusCode", in: execution)
            ?? intValue(forKey: "statusCode", in: execution)
            ?? 500

        var body: [String: Any]
        if let dictionary = execution["responseBody"] as? [String: Any] {
            body = dictionary
        } else if let dictionary = execution["response"] as? [String: Any] {
            body = dictionary
        } else {
            let responseBody = stringValue(forKey: "responseBody", in: execution)
                ?? stringValue(forKey: "response", in: execution)
                ?? ""
            body = try decodeJSONObjectStringIfPresent(responseBody)
        }

        // In some environments Appwrite returns an empty responseBody even for successful executions.
        if body.isEmpty,
           let loggedBody = decodeLoggedJSONPayload(from: execution) {
            body = loggedBody
        }

        guard (200..<300).contains(statusCode) else {
            // Prefer the raw backend message for 5xx so debug builds show the actual server failure.
            let message: String?
            if statusCode >= 500 {
                message = stringValue(forKey: "message", in: body) ?? stringValue(forKey: "messageKey", in: body)
            } else {
                message = stringValue(forKey: "messageKey", in: body) ?? stringValue(forKey: "message", in: body)
            }
            throw AppwriteServiceError.api(statusCode: statusCode, message: message, type: "function")
        }

        return body
    }

    private func decodeLoggedJSONPayload(from execution: [String: Any]) -> [String: Any]? {
        let rawLogs: [String]

        if let logs = execution["logs"] as? [String] {
            rawLogs = logs
        } else if let logs = execution["logs"] as? String {
            rawLogs = logs
                .components(separatedBy: .newlines)
                .filter { !$0.isEmpty }
        } else if let logs = execution["logs"] as? [Any] {
            rawLogs = logs.compactMap { $0 as? String }
        } else {
            rawLogs = []
        }

        for line in rawLogs.reversed() {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmed.hasPrefix("RESULT_JSON:") else {
                continue
            }

            let jsonText = String(trimmed.dropFirst("RESULT_JSON:".count))
            guard let data = jsonText.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data),
                  let payload = object as? [String: Any] else {
                continue
            }

            return payload
        }

        return nil
    }

    private func listRows(tableId: String, queries: [String]) async throws -> [[String: Any]] {
        let payload = try await sendJSONObjectRequest(
            method: "GET",
            pathComponents: [
                "tablesdb",
                configuration.databaseId,
                "tables",
                tableId,
                "rows"
            ],
            queryItems: queries.map { URLQueryItem(name: "queries[]", value: $0) }
        )

        if let rows = payload["rows"] as? [[String: Any]] {
            return rows
        }

        return []
    }

    private func uploadAvatar(data: Data, fileId: String) async throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(
            url: url(
                pathComponents: [
                    "storage",
                    "buckets",
                    configuration.avatarsBucketId,
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
            fileData: data
        )

        let (responseData, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppwriteServiceError.invalidResponse
        }

        guard httpResponse.statusCode == 201 else {
            throw makeAPIError(from: responseData, statusCode: httpResponse.statusCode)
        }
    }

    private func deleteAvatar(fileId: String) async throws {
        _ = try await sendRequest(
            method: "DELETE",
            pathComponents: [
                "storage",
                "buckets",
                configuration.avatarsBucketId,
                "files",
                fileId
            ],
            expectedStatusCodes: [204]
        )
    }

    private func sendJSONObjectRequest(
        method: String,
        pathComponents: [String],
        queryItems: [URLQueryItem] = [],
        jsonBody: [String: Any]? = nil,
        expectedStatusCodes: Set<Int> = [200]
    ) async throws -> [String: Any] {
        let data = try await sendRequest(
            method: method,
            pathComponents: pathComponents,
            queryItems: queryItems,
            jsonBody: jsonBody,
            expectedStatusCodes: expectedStatusCodes
        )
        return try decodeJSONObject(from: data)
    }

    private func sendRequest(
        method: String,
        pathComponents: [String],
        queryItems: [URLQueryItem] = [],
        jsonBody: [String: Any]? = nil,
        expectedStatusCodes: Set<Int> = [200]
    ) async throws -> Data {
        var request = URLRequest(url: url(pathComponents: pathComponents, queryItems: queryItems))
        request.httpMethod = method
        request.setValue(configuration.projectId, forHTTPHeaderField: "X-Appwrite-Project")
        request.setValue("1.8.0", forHTTPHeaderField: "X-Appwrite-Response-Format")

        if let jsonBody {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
        }

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw AppwriteServiceError.invalidResponse
            }

            guard expectedStatusCodes.contains(httpResponse.statusCode) else {
                throw makeAPIError(from: data, statusCode: httpResponse.statusCode)
            }

            return data
        } catch let error as AppwriteServiceError {
            throw error
        } catch {
            throw AppwriteServiceError.network(error)
        }
    }

    private func createAccount(email: String, password: String) async throws {
        _ = try await sendRequest(
            method: "POST",
            pathComponents: ["account"],
            jsonBody: [
                "userId": "unique()",
                "email": email,
                "password": password
            ],
            expectedStatusCodes: [201]
        )
    }

    private func createEmailSession(email: String, password: String) async throws {
        _ = try await sendRequest(
            method: "POST",
            pathComponents: ["account", "sessions", "email"],
            jsonBody: [
                "email": email,
                "password": password
            ],
            expectedStatusCodes: [201]
        )
    }

    private func url(pathComponents: [String], queryItems: [URLQueryItem] = []) -> URL {
        var components = URLComponents(url: configuration.endpointURL, resolvingAgainstBaseURL: false)
        let path = "/" + pathComponents.map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? $0 }.joined(separator: "/")
        components?.path = configuration.endpointURL.path + path
        if !queryItems.isEmpty {
            components?.queryItems = queryItems
        }
        return components?.url ?? pathComponents.reduce(configuration.endpointURL) { partialURL, component in
            partialURL.appendingPathComponent(component)
        }
    }

    private func makeAPIError(from data: Data, statusCode: Int) -> AppwriteServiceError {
        if let payload = try? decodeJSONObject(from: data) {
            return .api(
                statusCode: statusCode,
                message: stringValue(forKey: "message", in: payload) ?? stringValue(forKey: "messageKey", in: payload),
                type: stringValue(forKey: "type", in: payload)
            )
        }
        return .api(statusCode: statusCode, message: nil, type: nil)
    }

    private func makeProfilePayload(for user: User) -> [String: Any] {
        [
            "userId": user.appwriteUserId ?? "",
            "email": user.email,
            "firstName": nullOrString(user.firstName),
            "lastName": nullOrString(user.lastName),
            "city": nullOrString(user.city),
            "birthDate": nullOrDateString(user.birthDate),
            "gender": nullOrString(stringValue(for: user.gender)),
            "orientation": nullOrString(stringValue(for: user.orientation)),
            "showMe": stringValue(for: user.showMe),
            "smokes": user.smokes as Any? ?? NSNull(),
            "drinks": user.drinks as Any? ?? NSNull(),
            "hobbies": nullOrString(user.hobbies),
            "passions": nullOrString(user.passions),
            "lookingFor": nullOrString(user.lookingFor),
            "favoriteSong": nullOrString(user.favoriteSong),
            "favoriteMovie": nullOrString(user.favoriteMovie),
            "avatarFileId": nullOrString(user.avatarFileId)
        ]
    }

    private func makeMessageDTO(from row: [String: Any], currentAccountId: String) -> MessageDTO? {
        guard let remoteId = stringValue(forKey: "$id", in: row) else {
            return nil
        }

        let text = stringValue(forKey: "text", in: row) ?? ""
        let createdAt = dateValue(forKey: "createdAt", in: row)
            ?? dateValue(forKey: "$createdAt", in: row)
            ?? Date()

        return MessageDTO(
            id: stableUUID(from: remoteId),
            text: text,
            isMe: stringValue(forKey: "senderUserId", in: row) == currentAccountId,
            time: Self.messageTimeFormatter.string(from: createdAt)
        )
    }

    private func makeDiscoverProfileDTO(from row: [String: Any]) -> ProfileDTO? {
        guard let userId = stringValue(forKey: "userId", in: row),
              let gender = genderValue(for: stringValue(forKey: "gender", in: row)) else {
            return nil
        }

        let firstName = stringValue(forKey: "firstName", in: row) ?? ""
        let lastName = stringValue(forKey: "lastName", in: row) ?? ""
        let fullName = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespacesAndNewlines)
        let email = stringValue(forKey: "email", in: row) ?? ""
        let name = fullName.isEmpty ? discoverNameFallback(from: email) : fullName
        let age = ageValue(from: dateValue(forKey: "birthDate", in: row))

        return ProfileDTO(
            id: stableUUID(from: userId),
            remoteUserId: userId,
            name: name,
            age: age,
            gender: gender,
            bio: discoverBio(from: row)
        )
    }

    private func displayName(from profileRow: [String: Any]?, fallback: String? = nil) -> String {
        let firstName = stringValue(forKey: "firstName", in: profileRow) ?? ""
        let lastName = stringValue(forKey: "lastName", in: profileRow) ?? ""
        let fullName = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespacesAndNewlines)

        if !fullName.isEmpty {
            return fullName
        }

        if let email = stringValue(forKey: "email", in: profileRow),
           let localPart = email.split(separator: "@").first,
           !localPart.isEmpty {
            return String(localPart)
        }

        if let fallback {
            let trimmedFallback = fallback.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedFallback.isEmpty, trimmedFallback != "Fyre match" {
                return trimmedFallback
            }
        }

        return "Match"
    }

    private func discoverNameFallback(from email: String) -> String {
        guard let localPart = email.split(separator: "@").first, !localPart.isEmpty else {
            return "Match"
        }
        return String(localPart)
    }

    private func discoverBio(from row: [String: Any]) -> String {
        let candidates = [
            stringValue(forKey: "lookingFor", in: row),
            stringValue(forKey: "passions", in: row),
            stringValue(forKey: "hobbies", in: row)
        ]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

        if let first = candidates.first {
            return first
        }

        return "Say hi and start the conversation."
    }

    private func ageValue(from date: Date?) -> Int {
        guard let date else { return 18 }
        return max(18, Calendar.current.dateComponents([.year], from: date, to: Date()).year ?? 18)
    }

    private func nullOrString(_ value: String?) -> Any {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return NSNull()
        }

        return trimmed
    }

    private func nullOrDateString(_ value: Date?) -> Any {
        guard let value else {
            return NSNull()
        }

        return Self.dateFormatter.string(from: value)
    }

    private func eventHistoryStatus(for rawValue: String?) -> EventHistoryStatus? {
        switch rawValue?.lowercased() {
        case "confirmed":
            return .confirmed
        case "waitlisted":
            return .waitlisted
        case "cancelled":
            return .cancelled
        case "promoted":
            return .promoted
        default:
            return nil
        }
    }

    private func genderValue(for rawValue: String?) -> UserGender? {
        switch rawValue {
        case "male":
            return .male
        case "female":
            return .female
        case "nonBinary":
            return .nonBinary
        case "other":
            return .other
        default:
            return nil
        }
    }

    private func orientationValue(for rawValue: String?) -> UserOrientation? {
        switch rawValue {
        case "straight":
            return .straight
        case "gay":
            return .gay
        case "lesbian":
            return .lesbian
        case "bisexual":
            return .bisexual
        case "pansexual":
            return .pansexual
        case "other":
            return .other
        default:
            return nil
        }
    }

    private func showMeValue(for rawValue: String?) -> UserShowMe? {
        switch rawValue {
        case "men":
            return .men
        case "women":
            return .women
        case "everyone":
            return .everyone
        default:
            return nil
        }
    }

    private func stringValue(for value: UserGender?) -> String? {
        switch value {
        case .male:
            return "male"
        case .female:
            return "female"
        case .nonBinary:
            return "nonBinary"
        case .other:
            return "other"
        case nil:
            return nil
        }
    }

    private func stringValue(for value: UserOrientation?) -> String? {
        switch value {
        case .straight:
            return "straight"
        case .gay:
            return "gay"
        case .lesbian:
            return "lesbian"
        case .bisexual:
            return "bisexual"
        case .pansexual:
            return "pansexual"
        case .other:
            return "other"
        case nil:
            return nil
        }
    }

    private func stringValue(for value: UserShowMe) -> String {
        switch value {
        case .men:
            return "men"
        case .women:
            return "women"
        case .everyone:
            return "everyone"
        }
    }

    private func makeMultipartBody(boundary: String, fileId: String, fileData: Data) -> Data {
        let filename = "avatar-\(fileId).jpg"
        let parts = [
            Data("--\(boundary)\r\n".utf8),
            Data("Content-Disposition: form-data; name=\"fileId\"\r\n\r\n".utf8),
            Data("\(fileId)\r\n".utf8),
            Data("--\(boundary)\r\n".utf8),
            Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".utf8),
            Data("Content-Type: image/jpeg\r\n\r\n".utf8),
            fileData,
            Data("\r\n".utf8),
            Data("--\(boundary)--\r\n".utf8)
        ]

        return Data(parts.joined())
    }

    private func clearCookies() {
        cachedFunctionJWT = nil
        guard let host = configuration.endpointURL.host,
              let cookies = HTTPCookieStorage.shared.cookies else { return }

        for cookie in cookies where cookie.domain.contains(host) {
            HTTPCookieStorage.shared.deleteCookie(cookie)
        }
    }

    private func makeRandomIdentifier() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "")
    }

    private func stableUUID(from text: String) -> UUID {
        if let uuid = UUID(uuidString: text) {
            return uuid
        }

        var bytes = [UInt8](repeating: 0, count: 16)
        for (index, byte) in text.utf8.enumerated() {
            bytes[index % bytes.count] ^= byte
        }
        bytes[6] = (bytes[6] & 0x0F) | 0x40
        bytes[8] = (bytes[8] & 0x3F) | 0x80

        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }

    private func decodeJSONObject(from data: Data) throws -> [String: Any] {
        do {
            let object = try JSONSerialization.jsonObject(with: data)
            guard let dictionary = object as? [String: Any] else {
                throw AppwriteServiceError.invalidResponse
            }
            return dictionary
        } catch let error as AppwriteServiceError {
            throw error
        } catch {
            throw AppwriteServiceError.decoding(error)
        }
    }

    private func decodeJSONObjectStringIfPresent(_ string: String) throws -> [String: Any] {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [:] }
        guard let data = trimmed.data(using: .utf8) else {
            throw AppwriteServiceError.invalidResponse
        }
        return try decodeJSONObject(from: data)
    }

    private func stringValue(forKey key: String, in dictionary: [String: Any]?) -> String? {
        guard let rawValue = dictionary?[key] as? String else { return nil }
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    private func boolValue(forKey key: String, in dictionary: [String: Any]?) -> Bool? {
        dictionary?[key] as? Bool
    }

    private func intValue(forKey key: String, in dictionary: [String: Any]?) -> Int? {
        if let value = dictionary?[key] as? Int {
            return value
        }
        if let value = dictionary?[key] as? Double {
            return Int(value)
        }
        if let value = dictionary?[key] as? String {
            return Int(value)
        }
        return nil
    }

    private func dateValue(forKey key: String, in dictionary: [String: Any]?) -> Date? {
        guard let rawValue = stringValue(forKey: key, in: dictionary) else {
            return nil
        }

        return Self.dateFormatter.date(from: rawValue)
            ?? Self.fallbackDateFormatter.date(from: rawValue)
    }

    fileprivate static let dateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    fileprivate static let fallbackDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    fileprivate static let messageTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}

private enum AppwriteQuery {
    static func equal(_ field: String, values: [String]) -> String {
        query(method: "equal", column: field, values: values)
    }

    static func orderAsc(_ field: String) -> String {
        query(method: "orderAsc", column: field)
    }

    static func limit(_ value: Int) -> String {
        query(method: "limit", values: [value])
    }

    private static func query(method: String, column: String? = nil, values: [Any] = []) -> String {
        var payload: [String: Any] = ["method": method]
        if let column {
            // Appwrite's REST parser currently expects "attribute" for filtered/sorted row queries.
            payload["attribute"] = column
        }
        if !values.isEmpty {
            payload["values"] = values
        }

        let data = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self)
    }
}

enum AppwriteServiceError: Error, @unchecked Sendable {
    case api(statusCode: Int, message: String?, type: String?)
    case invalidResponse
    case decoding(Error)
    case network(Error)
    case missingAccountId
    case missingConfiguration(String)

    var statusCode: Int? {
        switch self {
        case let .api(statusCode, _, _):
            return statusCode
        default:
            return nil
        }
    }

    var isUnauthorized: Bool {
        statusCode == 401
    }
}

extension AppwriteServiceError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case let .api(statusCode, message, type):
            return "Appwrite API error \(statusCode) (\(type ?? "unknown")): \(message ?? "No message")"
        case .invalidResponse:
            return "Invalid response from Appwrite."
        case let .decoding(error):
            return "Failed to decode Appwrite response: \(error.localizedDescription)"
        case let .network(error):
            return "Network error while talking to Appwrite: \(error.localizedDescription)"
        case .missingAccountId:
            return "Missing current Appwrite account id."
        case let .missingConfiguration(key):
            return "Missing Appwrite configuration: \(key)"
        }
    }
}
