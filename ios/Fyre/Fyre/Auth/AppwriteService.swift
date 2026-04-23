//
//  AppwriteService.swift
//  Fyre
//
//  Created by Gabriele Mininni on 04/04/26.
//

import Foundation

struct MainEventRemoteState: Sendable {
    let eventId: String
    let snapshot: MainEventSnapshot
    let currentStatus: EventHistoryStatus?
    let history: [EventHistoryItem]
    let adminState: EventAdminState?
}

struct EventAdminParticipant: Identifiable, Sendable {
    let id: String
    let userId: String
    let displayName: String
    let email: String
    let gender: UserGender?
    let status: EventHistoryStatus
    let createdAt: Date?
}

struct EventAdminState: Sendable {
    let eventId: String
    let title: String
    let startsAt: Date
    let maxParticipants: Int
    let maleLimit: Int
    let femaleLimit: Int
    let registrationClosesAt: Date?
    let cancellationClosesAt: Date?
    let adminUserIds: String
    let adminEmails: String
    let participants: [EventAdminParticipant]
}

struct EventAdminDraft: Sendable {
    var title: String
    var startsAt: Date
    var maxParticipants: Int
    var maleLimit: Int
    var femaleLimit: Int
    var registrationClosesAt: Date?
    var cancellationClosesAt: Date?
    var adminUserIds: String
    var adminEmails: String

    init(
        title: String,
        startsAt: Date,
        maxParticipants: Int,
        maleLimit: Int,
        femaleLimit: Int,
        registrationClosesAt: Date?,
        cancellationClosesAt: Date?,
        adminUserIds: String,
        adminEmails: String
    ) {
        self.title = title
        self.startsAt = startsAt
        self.maxParticipants = maxParticipants
        self.maleLimit = maleLimit
        self.femaleLimit = femaleLimit
        self.registrationClosesAt = registrationClosesAt
        self.cancellationClosesAt = cancellationClosesAt
        self.adminUserIds = adminUserIds
        self.adminEmails = adminEmails
    }

    init(state: EventAdminState) {
        title = state.title
        startsAt = state.startsAt
        maxParticipants = state.maxParticipants
        maleLimit = state.maleLimit
        femaleLimit = state.femaleLimit
        registrationClosesAt = state.registrationClosesAt
        cancellationClosesAt = state.cancellationClosesAt
        adminUserIds = state.adminUserIds
        adminEmails = state.adminEmails
    }
}

actor AppwriteService {
    let configuration: AppwriteConfiguration
    let session: URLSession
    var cachedFunctionJWT: (value: String, expiresAt: Date)?

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

        var uploadedFileIds: [String] = []
        if let avatarData = updatedUser.primaryProfileImageData,
           updatedUser.avatarFileId?.isEmpty ?? true {
            let avatarFileIds = try await uploadProfilePhotos([avatarData])
            uploadedFileIds.append(contentsOf: avatarFileIds)
            updatedUser.avatarFileId = avatarFileIds.first
            updatedUser.profileImageData = avatarData
        }

        if !updatedUser.resolvedProfilePhotoDataItems.isEmpty,
           updatedUser.resolvedPhotoFileIds.isEmpty {
            let galleryFileIds = try await uploadProfilePhotos(updatedUser.resolvedProfilePhotoDataItems)
            uploadedFileIds.append(contentsOf: galleryFileIds)
            updatedUser.photoFileIds = galleryFileIds
        }

        do {
            return try await ensureProfileRow(for: updatedUser)
        } catch {
            for fileId in uploadedFileIds {
                try? await deleteAvatar(fileId: fileId)
            }
            throw error
        }
    }

    func updateProfileImage(_ imageData: Data?, for user: User) async throws -> User {
        let accountId = try await resolvedRequiredAccountId(from: user)
        let previousAvatarFileId = user.avatarFileId
        let sanitizedImage = imageData.flatMap { $0.isEmpty ? nil : $0 }
        let nextAvatarFileId: String?

        if let sanitizedImage {
            nextAvatarFileId = (try await uploadProfilePhotos([sanitizedImage])).first
        } else {
            nextAvatarFileId = nil
        }

        var updatedUser = user
        updatedUser.appwriteUserId = accountId
        updatedUser.avatarFileId = nextAvatarFileId
        updatedUser.profileImageData = sanitizedImage

        do {
            updatedUser = try await ensureProfileRow(for: updatedUser)
        } catch {
            if let nextAvatarFileId {
                try? await deleteAvatar(fileId: nextAvatarFileId)
            }
            throw error
        }

        if let previousAvatarFileId,
           previousAvatarFileId != nextAvatarFileId,
           !updatedUser.resolvedPhotoFileIds.contains(previousAvatarFileId) {
            try? await deleteAvatar(fileId: previousAvatarFileId)
        }

        return updatedUser
    }

    func updateProfileImages(_ imageDataItems: [Data], for user: User) async throws -> User {
        let accountId = try await resolvedRequiredAccountId(from: user)
        let previousFileIds = user.resolvedPhotoFileIds
        let sanitizedImages = imageDataItems.filter { !$0.isEmpty }
        let nextFileIds = try await uploadProfilePhotos(sanitizedImages)

        var updatedUser = user
        updatedUser.appwriteUserId = accountId
        updatedUser.photoFileIds = nextFileIds
        updatedUser.profilePhotoDataItems = sanitizedImages

        do {
            updatedUser = try await ensureProfileRow(for: updatedUser)
        } catch {
            for fileId in nextFileIds {
                try? await deleteAvatar(fileId: fileId)
            }
            throw error
        }

        let obsoleteFileIds = Set(previousFileIds).subtracting(Set(nextFileIds))
        for fileId in obsoleteFileIds {
            if fileId != updatedUser.avatarFileId {
                try? await deleteAvatar(fileId: fileId)
            }
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
        let currentStatus: EventHistoryStatus?
        if let accountId {
            let sortedUserRegistrations = eventRegistrations
                .filter { stringValue(forKey: "userId", in: $0) == accountId }
                .sorted { lhs, rhs in
                    let lhsUpdatedAt = dateValue(forKey: "$updatedAt", in: lhs)
                        ?? dateValue(forKey: "updatedAt", in: lhs)
                        ?? dateValue(forKey: "createdAt", in: lhs)
                        ?? dateValue(forKey: "$createdAt", in: lhs)
                        ?? .distantPast
                    let rhsUpdatedAt = dateValue(forKey: "$updatedAt", in: rhs)
                        ?? dateValue(forKey: "updatedAt", in: rhs)
                        ?? dateValue(forKey: "createdAt", in: rhs)
                        ?? dateValue(forKey: "$createdAt", in: rhs)
                        ?? .distantPast
                    return lhsUpdatedAt > rhsUpdatedAt
                }

            let activeStatuses: Set<String> = ["confirmed", "promoted", "waitlisted"]
            let preferredRegistration = sortedUserRegistrations.first { row in
                guard let rawStatus = stringValue(forKey: "status", in: row)?.lowercased() else {
                    return false
                }
                return activeStatuses.contains(rawStatus)
            } ?? sortedUserRegistrations.first

            currentStatus = preferredRegistration
                .flatMap { eventHistoryStatus(for: stringValue(forKey: "status", in: $0)) }
        } else {
            currentStatus = nil
        }

        let history = try await makeEventHistory(for: accountId, events: upcomingEvents)
        let adminState = try await fetchEventAdminStateIfAuthorized(eventId: eventId)

        return MainEventRemoteState(
            eventId: eventId,
            snapshot: snapshot,
            currentStatus: currentStatus,
            history: history,
            adminState: adminState
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

    func updateMainEventAsAdmin(eventId: String, draft: EventAdminDraft) async throws -> EventAdminState {
        guard let functionId = configuration.eventAdminFunctionId else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_EVENT_ADMIN_FUNCTION_ID")
        }

        var body: [String: Any] = [
            "action": "updateEvent",
            "eventId": eventId,
            "title": draft.title,
            "startsAt": Self.dateFormatter.string(from: draft.startsAt),
            "maxParticipants": draft.maxParticipants,
            "maleLimit": draft.maleLimit,
            "femaleLimit": draft.femaleLimit,
            "adminUserIds": draft.adminUserIds,
            "adminEmails": draft.adminEmails
        ]
        if let registrationClosesAt = draft.registrationClosesAt {
            body["registrationClosesAt"] = Self.dateFormatter.string(from: registrationClosesAt)
        }
        if let cancellationClosesAt = draft.cancellationClosesAt {
            body["cancellationClosesAt"] = Self.dateFormatter.string(from: cancellationClosesAt)
        }

        let response = try await executeUserFunction(
            functionId: functionId,
            body: body
        )

        guard let state = makeEventAdminState(from: response) else {
            throw AppwriteServiceError.invalidResponse
        }

        return state
    }

    func addEventParticipantAsAdmin(eventId: String, lookup: String, status: EventHistoryStatus) async throws -> EventAdminState {
        guard let functionId = configuration.eventAdminFunctionId else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_EVENT_ADMIN_FUNCTION_ID")
        }

        let response = try await executeUserFunction(
            functionId: functionId,
            body: [
                "action": "addParticipant",
                "eventId": eventId,
                "userLookup": lookup,
                "status": status.rawValue
            ]
        )

        guard let state = makeEventAdminState(from: response) else {
            throw AppwriteServiceError.invalidResponse
        }

        return state
    }

    func removeEventParticipantAsAdmin(eventId: String, registrationId: String) async throws -> EventAdminState {
        guard let functionId = configuration.eventAdminFunctionId else {
            throw AppwriteServiceError.missingConfiguration("APPWRITE_EVENT_ADMIN_FUNCTION_ID")
        }

        let response = try await executeUserFunction(
            functionId: functionId,
            body: [
                "action": "removeParticipant",
                "eventId": eventId,
                "registrationId": registrationId
            ]
        )

        guard let state = makeEventAdminState(from: response) else {
            throw AppwriteServiceError.invalidResponse
        }

        return state
    }

    func fetchDiscoverProfiles() async throws -> [DiscoverProfileDTO] {
        // Prefer the server-side projection when available so discover can stay privacy-safe.
        if let functionId = configuration.discoverProfilesFunctionId {
            let response = try await executeUserFunction(functionId: functionId, body: [:])
            guard let profiles = response["profiles"] as? [[String: Any]] else {
                throw AppwriteServiceError.invalidResponse
            }

            return profiles.compactMap(makeDiscoverProfileDTO(from:))
        }

        let currentAccountId = try await fetchCurrentAccountId(required: false)
        let excludedUserIds = try await excludedDiscoverUserIds(currentAccountId: currentAccountId)
        let currentInterests = try await fetchProfileRow(id: currentAccountId ?? "")
            .map(interestListValue(for:))
            ?? []
        let rows = try await listRows(
            tableId: configuration.profilesTableId,
            queries: []
        )

        let mappedProfiles: [DiscoverProfileDTO] = rows.compactMap { (row: [String: Any]) -> DiscoverProfileDTO? in
            guard let userId = stringValue(forKey: "userId", in: row),
                  userId != currentAccountId,
                  !excludedUserIds.contains(userId),
                  let _ = genderValue(for: stringValue(forKey: "gender", in: row)) else {
                return nil
            }
            return makeFallbackDiscoverProfileDTO(from: row, currentUserInterests: currentInterests)
        }
        return mappedProfiles
    }

    private func ensureProfileRow(for user: User) async throws -> User {
        let accountId = try await resolvedRequiredAccountId(from: user)
        let payload = makeProfilePayload(for: user)
        let existingProfileRow = try await fetchProfileRow(id: accountId)

        // Use the Auth account id as the profile row id so auth and profile stay trivially linked.
        if existingProfileRow == nil {
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
            let existingRowId = stringValue(forKey: "$id", in: existingProfileRow) ?? accountId
            _ = try await sendRequest(
                method: "PATCH",
                pathComponents: [
                    "tablesdb",
                    configuration.databaseId,
                    "tables",
                    configuration.profilesTableId,
                    "rows",
                    existingRowId
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
        let photoFileIds = discoverPhotoFileIds(from: profileRow ?? [:])
        let photoDataItems = try await fetchProfilePhotoDataItems(fileIds: photoFileIds)
        let avatarData = try await fetchAvatarData(
            fileId: stringValue(forKey: "avatarFileId", in: profileRow)
        )

        var user = User(email: email, password: "")
        user.appwriteUserId = accountId
        user.firstName = stringValue(forKey: "firstName", in: profileRow)
        user.lastName = stringValue(forKey: "lastName", in: profileRow)
        user.city = stringValue(forKey: "city", in: profileRow)
        user.birthDate = dateValue(forKey: "birthDate", in: profileRow)
        user.gender = genderValue(for: stringValue(forKey: "gender", in: profileRow))
        user.orientation = orientationValue(for: stringValue(forKey: "orientation", in: profileRow))
        user.preferredGenders = genderListValue(for: profileRow?["preferredGenders"])
        user.minPreferredAge = intValue(forKey: "minPreferredAge", in: profileRow)
        user.maxPreferredAge = intValue(forKey: "maxPreferredAge", in: profileRow)
        user.maxDistanceKm = intValue(forKey: "maxDistanceKm", in: profileRow)
        user.latitude = doubleValue(forKey: "latitude", in: profileRow)
        user.longitude = doubleValue(forKey: "longitude", in: profileRow)
        user.smokes = boolValue(forKey: "smokes", in: profileRow)
        user.drinks = boolValue(forKey: "drinks", in: profileRow)
        user.bio = stringValue(forKey: "bio", in: profileRow)
        user.intent = intentValue(for: stringValue(forKey: "intent", in: profileRow))
        user.interests = stringValue(forKey: "interests", in: profileRow)
        user.instagramTag = socialTagValue(forKey: "instagramTag", in: profileRow)
        user.spotifyTag = socialTagValue(forKey: "spotifyTag", in: profileRow)
        user.avatarFileId = stringValue(forKey: "avatarFileId", in: profileRow)
        user.photoFileIds = photoFileIds
        user.profileImageData = avatarData
        user.profilePhotoDataItems = photoDataItems.isEmpty ? nil : photoDataItems
        return user
    }

    func fetchCurrentAccountId(required: Bool) async throws -> String? {
        guard let account = try await fetchCurrentAccount(required: required) else {
            return nil
        }

        return stringValue(forKey: "$id", in: account)
    }

    func fetchProfileRow(id rowId: String) async throws -> [String: Any]? {
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

    func fetchRowIfAccessible(tableId: String, rowId: String) async throws -> [String: Any]? {
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

    private func fetchProfilePhotoDataItems(fileIds: [String]) async throws -> [Data] {
        var dataItems: [Data] = []

        for fileId in fileIds {
            if let data = try await fetchAvatarData(fileId: fileId) {
                dataItems.append(data)
            }
        }

        return dataItems
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
            maleLimit: intValue(forKey: "maleLimit", in: eventRow) ?? 24,
            femaleLimit: intValue(forKey: "femaleLimit", in: eventRow) ?? 24,
            maleCount: maleCount,
            femaleCount: femaleCount,
            waitingListCount: waitingListCount,
            registrationClosesAt: dateValue(forKey: "registrationClosesAt", in: eventRow),
            cancellationClosesAt: dateValue(forKey: "cancellationClosesAt", in: eventRow)
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

    func executeUserFunction(functionId: String, body: [String: Any]) async throws -> [String: Any] {
        var payload = body
        if payload["currentUserId"] == nil,
           let currentUserId = try await fetchCurrentAccountId(required: true) {
            payload["currentUserId"] = currentUserId
        }

        if shouldBypassDirectFunctionInvoke(functionId: functionId) {
            return try await executeFunction(functionId: functionId, body: payload)
        }

        // Prefer the direct `.appwrite.run` path because execution polling can drop successful response bodies.
        do {
            if let response = try await executeFunctionDirectly(functionId: functionId, body: payload),
               !response.isEmpty {
                return response
            }
        } catch let error as AppwriteServiceError {
            let shouldFallbackToExecutionAPI: Bool
            switch error {
            case let .api(statusCode, _, type):
                shouldFallbackToExecutionAPI = statusCode == 401 || statusCode == 403 || type == "router_unauthorized_execution"
            default:
                shouldFallbackToExecutionAPI = false
            }

            if !shouldFallbackToExecutionAPI {
                throw error
            }

#if DEBUG
            debugPrint("Direct function invoke denied for \(functionId). Falling back to execution API: \(error.localizedDescription)")
#endif
        }
#if DEBUG
        debugPrint("Direct function invoke returned no JSON payload for \(functionId). Falling back to execution polling.")
#endif
        return try await executeFunction(functionId: functionId, body: payload)
    }

    private func shouldBypassDirectFunctionInvoke(functionId: String) -> Bool {
        // Relationship mutations are easier to trace in Appwrite when they always create executions,
        // and they do not rely on the direct invoke response body.
        configuration.eventAdminFunctionId == functionId
            || configuration.manageRelationshipFunctionId == functionId
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
        } else if configuration.eventAdminFunctionId == functionId {
            configuredURL = configuration.eventAdminFunctionDomain
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

    func listRows(tableId: String, queries: [String]) async throws -> [[String: Any]] {
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
            fileName: "avatar-\(fileId).jpg",
            mimeType: "image/jpeg",
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

    private func uploadProfilePhotos(_ photoDataItems: [Data]) async throws -> [String] {
        guard !photoDataItems.isEmpty else {
            return []
        }

        var uploadedFileIds: [String] = []

        do {
            for data in photoDataItems {
                let fileId = makeRandomIdentifier()
                try await uploadAvatar(data: data, fileId: fileId)
                uploadedFileIds.append(fileId)
            }

            return uploadedFileIds
        } catch {
            for fileId in uploadedFileIds {
                try? await deleteAvatar(fileId: fileId)
            }
            throw error
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

    func sendRequest(
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

    func url(pathComponents: [String], queryItems: [URLQueryItem] = []) -> URL {
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

    func makeAPIError(from data: Data, statusCode: Int) -> AppwriteServiceError {
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
            "preferredGenders": genderArrayValue(for: user.resolvedPreferredGenders),
            "minPreferredAge": user.resolvedMinPreferredAge,
            "maxPreferredAge": user.resolvedMaxPreferredAge,
            "maxDistanceKm": user.normalizedMaxDistanceKm as Any? ?? NSNull(),
            "latitude": user.latitude as Any? ?? NSNull(),
            "longitude": user.longitude as Any? ?? NSNull(),
            "smokes": user.smokes as Any? ?? NSNull(),
            "drinks": user.drinks as Any? ?? NSNull(),
            "bio": nullOrString(user.normalizedBio),
            "intent": nullOrString(stringValue(for: user.intent)),
            "interests": nullOrString(user.normalizedInterests),
            "instagramTag": nullOrString(user.normalizedInstagramTag),
            "spotifyTag": nullOrString(user.normalizedSpotifyTag),
            "profileReady": user.isProfileComplete,
            "avatarFileId": nullOrString(user.avatarFileId),
            "photoFileIds": user.resolvedPhotoFileIds
        ]
    }

    private func makeDiscoverProfileDTO(from row: [String: Any]) -> DiscoverProfileDTO? {
        guard let userId = stringValue(forKey: "id", in: row)
            ?? stringValue(forKey: "userId", in: row)
        else {
            return nil
        }

        return DiscoverProfileDTO(
            id: userId,
            name: stringValue(forKey: "name", in: row) ?? ThreadNaming.placeholderTitle,
            age: intValue(forKey: "age", in: row) ?? 18,
            photos: discoverPhotoURLs(from: row),
            compatibilityScore: min(max(intValue(forKey: "compatibilityScore", in: row) ?? 0, 0), 100),
            distance: intValue(forKey: "distance", in: row) ?? intValue(forKey: "distanceKm", in: row),
            commonInterests: discoverCommonInterests(from: row),
            bio: discoverBio(from: row),
            city: stringValue(forKey: "city", in: row),
            intent: stringValue(forKey: "intent", in: row),
            smokes: boolValue(forKey: "smokes", in: row),
            drinks: boolValue(forKey: "drinks", in: row),
            relationshipState: relationshipStateValue(for: stringValue(forKey: "relationshipState", in: row))
        )
    }

    private func makeFallbackDiscoverProfileDTO(from row: [String: Any], currentUserInterests: [String]) -> DiscoverProfileDTO? {
        guard let userId = stringValue(forKey: "userId", in: row) else {
            return nil
        }

        let firstName = stringValue(forKey: "firstName", in: row) ?? ""
        let lastName = stringValue(forKey: "lastName", in: row) ?? ""
        let fullName = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespacesAndNewlines)
        let email = stringValue(forKey: "email", in: row) ?? ""
        let name = fullName.isEmpty ? (ThreadNaming.discoverFallbackName(email: email) ?? ThreadNaming.placeholderTitle) : fullName
        let interests = interestListValue(for: row)
        let commonInterests = interests.filter { currentUserInterests.contains($0) }
        let fallbackScore = min(100, max(48 + (commonInterests.count * 8), 48))

        return DiscoverProfileDTO(
            id: userId,
            name: name,
            age: ageValue(from: dateValue(forKey: "birthDate", in: row)),
            photos: discoverPhotoURLs(from: row),
            compatibilityScore: fallbackScore,
            distance: intValue(forKey: "distanceKm", in: row),
            commonInterests: Array(commonInterests.prefix(4)),
            bio: discoverBio(from: row),
            city: stringValue(forKey: "city", in: row),
            intent: stringValue(forKey: "intent", in: row),
            smokes: boolValue(forKey: "smokes", in: row),
            drinks: boolValue(forKey: "drinks", in: row),
            relationshipState: .none
        )
    }

    private func fetchEventAdminStateIfAuthorized(eventId: String) async throws -> EventAdminState? {
        guard let functionId = configuration.eventAdminFunctionId else {
            return nil
        }

        do {
            let response = try await executeUserFunction(
                functionId: functionId,
                body: [
                    "action": "fetch",
                    "eventId": eventId
                ]
            )
            return makeEventAdminState(from: response)
        } catch let error as AppwriteServiceError where error.statusCode == 401 || error.statusCode == 403 || error.statusCode == 404 {
            return nil
        }
    }

    private func makeEventAdminState(from payload: [String: Any]) -> EventAdminState? {
        guard (boolValue(forKey: "isAdmin", in: payload) ?? true),
              let event = payload["event"] as? [String: Any],
              let eventId = stringValue(forKey: "$id", in: event) ?? stringValue(forKey: "eventId", in: event),
              let startsAt = dateValue(forKey: "startsAt", in: event) else {
            return nil
        }

        let participants = (payload["participants"] as? [[String: Any]] ?? []).compactMap { row -> EventAdminParticipant? in
            guard let id = stringValue(forKey: "registrationId", in: row) ?? stringValue(forKey: "$id", in: row),
                  let userId = stringValue(forKey: "userId", in: row),
                  let status = eventHistoryStatus(for: stringValue(forKey: "status", in: row)) else {
                return nil
            }

            return EventAdminParticipant(
                id: id,
                userId: userId,
                displayName: ThreadNaming.displayName(
                    firstName: stringValue(forKey: "firstName", in: row),
                    lastName: stringValue(forKey: "lastName", in: row),
                    email: stringValue(forKey: "email", in: row),
                    fallback: stringValue(forKey: "displayName", in: row)
                ),
                email: stringValue(forKey: "email", in: row) ?? userId,
                gender: genderValue(for: stringValue(forKey: "gender", in: row)),
                status: status,
                createdAt: dateValue(forKey: "createdAt", in: row) ?? dateValue(forKey: "$createdAt", in: row)
            )
        }
        .sorted { lhs, rhs in
            if lhs.status == rhs.status {
                return (lhs.createdAt ?? .distantPast) < (rhs.createdAt ?? .distantPast)
            }
            return lhs.status.sortOrder < rhs.status.sortOrder
        }

        return EventAdminState(
            eventId: eventId,
            title: stringValue(forKey: "title", in: event) ?? L10n.tr("events.title"),
            startsAt: startsAt,
            maxParticipants: intValue(forKey: "maxParticipants", in: event) ?? 48,
            maleLimit: intValue(forKey: "maleLimit", in: event) ?? 24,
            femaleLimit: intValue(forKey: "femaleLimit", in: event) ?? 24,
            registrationClosesAt: dateValue(forKey: "registrationClosesAt", in: event),
            cancellationClosesAt: dateValue(forKey: "cancellationClosesAt", in: event),
            adminUserIds: stringValue(forKey: "adminUserIds", in: event) ?? "",
            adminEmails: stringValue(forKey: "adminEmails", in: event) ?? "",
            participants: participants
        )
    }

    private func discoverBio(from row: [String: Any]) -> String {
        let candidates = [
            stringValue(forKey: "bio", in: row)
        ]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

        if let first = candidates.first {
            return first
        }

        return "Say hi and start the conversation."
    }

    private func discoverPhotoURLs(from row: [String: Any]) -> [URL] {
        let directURLs = stringArrayValue(forKey: "photos", in: row).compactMap(URL.init(string:))
        if !directURLs.isEmpty {
            return directURLs
        }

        if let directURL = stringValue(forKey: "imageUrl", in: row).flatMap(URL.init(string:)) {
            return [directURL]
        }

        let fileIds = discoverPhotoFileIds(from: row)
        let urls = fileIds.compactMap(avatarURL(fileId:))
        if !urls.isEmpty {
            return urls
        }

        return []
    }

    private func discoverPhotoFileIds(from row: [String: Any]) -> [String] {
        let directArray = stringArrayValue(forKey: "photoFileIds", in: row)
        if !directArray.isEmpty {
            return directArray.filter { !$0.isEmpty }
        }

        if let rawValue = stringValue(forKey: "photoFileIds", in: row) {
            return rawValue
                .split(whereSeparator: { $0 == "," || $0 == "\n" || $0 == "|" })
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }

        return []
    }

    private func discoverCommonInterests(from row: [String: Any]) -> [String] {
        let directArray = stringArrayValue(forKey: "commonInterests", in: row)
        if !directArray.isEmpty {
            return directArray
        }
        return interestListValue(for: stringValue(forKey: "commonInterests", in: row))
    }

    private func interestListValue(for row: [String: Any]) -> [String] {
        interestListValue(for: stringValue(forKey: "interests", in: row))
    }

    private func socialTagValue(forKey key: String, in row: [String: Any]?) -> String? {
        normalizedSocialTag(stringValue(forKey: key, in: row))
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
        switch rawValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "male":
            return .male
        case "female":
            return .female
        case "nonbinary":
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

    private func intentValue(for rawValue: String?) -> UserIntent? {
        switch rawValue {
        case "relationship":
            return .relationship
        case "casual":
            return .casual
        case "friendship":
            return .friendship
        case "notSure":
            return .notSure
        default:
            return nil
        }
    }

    private func relationshipStateValue(for rawValue: String?) -> RelationshipStateDTO {
        switch rawValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "liked":
            return .liked
        case "matched":
            return .matched
        case "archived":
            return .archived
        case "blocked":
            return .blocked
        default:
            return .none
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

    private func stringValue(for value: UserIntent?) -> String? {
        switch value {
        case .relationship:
            return "relationship"
        case .casual:
            return "casual"
        case .friendship:
            return "friendship"
        case .notSure:
            return "notSure"
        case nil:
            return nil
        }
    }

    private func genderListValue(for rawValue: Any?) -> [UserGender] {
        if let values = rawValue as? [String] {
            return values.compactMap(genderValue(for:))
        }

        if let values = rawValue as? [Any] {
            return values
                .compactMap { $0 as? String }
                .compactMap(genderValue(for:))
        }

        if let rawValue = rawValue as? String {
            return rawValue
                .split(separator: ",")
                .compactMap { genderValue(for: String($0).trimmingCharacters(in: .whitespacesAndNewlines)) }
        }

        return []
    }

    private func genderArrayValue(for genders: [UserGender]) -> Any {
        let values = UserGender.allCases
            .filter { genders.contains($0) }
            .compactMap { stringValue(for: $0) }

        if values.isEmpty {
            return NSNull()
        }

        return values
    }

    private func interestListValue(for rawValue: String?) -> [String] {
        guard let rawValue else { return [] }

        return rawValue
            .split(whereSeparator: { $0 == "," || $0 == "\n" || $0 == "|" })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private func stringArrayValue(forKey key: String, in dictionary: [String: Any]?) -> [String] {
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

        return []
    }

    private func normalizedSocialTag(_ rawValue: String?) -> String? {
        guard let rawValue else { return nil }

        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let withoutAtPrefix = String(trimmed.drop(while: { $0 == "@" }))
        let withoutWhitespace = withoutAtPrefix.replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
        let withoutAt = withoutWhitespace.replacingOccurrences(of: "@", with: "")
        guard !withoutAt.isEmpty else { return nil }

        return String(withoutAt.prefix(64))
    }

    private func avatarURL(fileId: String?) -> URL? {
        guard let fileId, !fileId.isEmpty else { return nil }

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

    func makeMultipartBody(
        boundary: String,
        fileId: String,
        fileName: String,
        mimeType: String,
        fileData: Data,
        permissions: [String] = []
    ) -> Data {
        var parts = [
            Data("--\(boundary)\r\n".utf8),
            Data("Content-Disposition: form-data; name=\"fileId\"\r\n\r\n".utf8),
            Data("\(fileId)\r\n".utf8),
            Data("--\(boundary)\r\n".utf8),
            Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".utf8),
            Data("Content-Type: \(mimeType)\r\n\r\n".utf8),
            fileData,
            Data("\r\n".utf8)
        ]

        for permission in permissions {
            parts.append(Data("--\(boundary)\r\n".utf8))
            parts.append(Data("Content-Disposition: form-data; name=\"permissions[]\"\r\n\r\n".utf8))
            parts.append(Data("\(permission)\r\n".utf8))
        }

        parts.append(Data("--\(boundary)--\r\n".utf8))

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

    func makeRandomIdentifier() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "")
    }

    func stableUUID(from text: String) -> UUID {
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

    func stringValue(forKey key: String, in dictionary: [String: Any]?) -> String? {
        guard let rawValue = dictionary?[key] as? String else { return nil }
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    func boolValue(forKey key: String, in dictionary: [String: Any]?) -> Bool? {
        dictionary?[key] as? Bool
    }

    func intValue(forKey key: String, in dictionary: [String: Any]?) -> Int? {
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

    func doubleValue(forKey key: String, in dictionary: [String: Any]?) -> Double? {
        if let value = dictionary?[key] as? Double {
            return value
        }
        if let value = dictionary?[key] as? Int {
            return Double(value)
        }
        if let value = dictionary?[key] as? String {
            return Double(value)
        }
        return nil
    }

    func dateValue(forKey key: String, in dictionary: [String: Any]?) -> Date? {
        guard let rawValue = stringValue(forKey: key, in: dictionary) else {
            return nil
        }

        return Self.dateFormatter.date(from: rawValue)
            ?? Self.fallbackDateFormatter.date(from: rawValue)
    }

    static let dateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let fallbackDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let messageTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}

enum AppwriteQuery {
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
