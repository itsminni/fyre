//
//  UserStore.swift
//  Fyre
//
//  Created by Gabriele Mininni on 03/03/26.
//  Local user store backed by UserDefaults.
//

import Foundation
import Observation

enum UserGender: String, Codable, CaseIterable, Sendable, Identifiable {
    case male
    case female
    case nonBinary
    case other

    var id: String { rawValue }

    var localizationKey: String {
        switch self {
        case .male:
            return "profile.gender.male"
        case .female:
            return "profile.gender.female"
        case .nonBinary:
            return "profile.gender.nonBinary"
        case .other:
            return "profile.gender.other"
        }
    }
}

enum UserOrientation: String, Codable, CaseIterable, Sendable, Identifiable {
    case straight
    case gay
    case lesbian
    case bisexual
    case pansexual
    case other

    var id: String { rawValue }

    var localizationKey: String {
        switch self {
        case .straight:
            return "profile.orientation.straight"
        case .gay:
            return "profile.orientation.gay"
        case .lesbian:
            return "profile.orientation.lesbian"
        case .bisexual:
            return "profile.orientation.bisexual"
        case .pansexual:
            return "profile.orientation.pansexual"
        case .other:
            return "profile.orientation.other"
        }
    }
}

enum UserShowMe: String, Codable, CaseIterable, Sendable, Identifiable {
    case men
    case women
    case everyone

    var id: String { rawValue }

    var localizationKey: String {
        switch self {
        case .men:
            return "profile.showMe.men"
        case .women:
            return "profile.showMe.women"
        case .everyone:
            return "profile.showMe.everyone"
        }
    }

    func matches(_ gender: UserGender) -> Bool {
        switch self {
        case .men:
            return gender == .male
        case .women:
            return gender == .female
        case .everyone:
            return true
        }
    }
}

struct User: Codable, Sendable {
    var email: String
    var password: String
    var appwriteUserId: String?
    var firstName: String?
    var lastName: String?
    var city: String?
    var birthDate: Date?
    var gender: UserGender?
    var orientation: UserOrientation?
    var showMe: UserShowMe
    var smokes: Bool?
    var drinks: Bool?
    var hobbies: String?
    var passions: String?
    var lookingFor: String?
    var favoriteSong: String?
    var favoriteMovie: String?
    var avatarFileId: String?
    var profileImageData: Data?

    var displayName: String {
        let first = firstName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let last = lastName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let full = "\(first) \(last)".trimmingCharacters(in: .whitespacesAndNewlines)
        return full.isEmpty ? email : full
    }

    var isProfileComplete: Bool {
        guard let firstName, !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard let lastName, !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard let birthDate, UserStore.age(from: birthDate) >= 18 else { return false }
        guard gender != nil else { return false }
        guard orientation != nil else { return false }
        guard smokes != nil, drinks != nil else { return false }
        return true
    }

    nonisolated init(email: String, password: String) {
        self.email = email
        self.password = password
        self.showMe = .everyone
    }

    private enum CodingKeys: String, CodingKey {
        case email
        case password
        case appwriteUserId
        case firstName
        case lastName
        case city
        case birthDate
        case gender
        case orientation
        case showMe
        case smokes
        case drinks
        case hobbies
        case passions
        case lookingFor
        case favoriteSong
        case favoriteMovie
        case avatarFileId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        email = try c.decode(String.self, forKey: .email)
        password = try c.decode(String.self, forKey: .password)
        appwriteUserId = try c.decodeIfPresent(String.self, forKey: .appwriteUserId)
        firstName = try c.decodeIfPresent(String.self, forKey: .firstName)
        lastName = try c.decodeIfPresent(String.self, forKey: .lastName)
        city = try c.decodeIfPresent(String.self, forKey: .city)
        birthDate = try c.decodeIfPresent(Date.self, forKey: .birthDate)
        gender = try c.decodeIfPresent(UserGender.self, forKey: .gender)
        orientation = try c.decodeIfPresent(UserOrientation.self, forKey: .orientation)
        showMe = try c.decode(UserShowMe.self, forKey: .showMe)
        smokes = try c.decodeIfPresent(Bool.self, forKey: .smokes)
        drinks = try c.decodeIfPresent(Bool.self, forKey: .drinks)
        hobbies = try c.decodeIfPresent(String.self, forKey: .hobbies)
        passions = try c.decodeIfPresent(String.self, forKey: .passions)
        lookingFor = try c.decodeIfPresent(String.self, forKey: .lookingFor)
        favoriteSong = try c.decodeIfPresent(String.self, forKey: .favoriteSong)
        favoriteMovie = try c.decodeIfPresent(String.self, forKey: .favoriteMovie)
        avatarFileId = try c.decodeIfPresent(String.self, forKey: .avatarFileId)
        profileImageData = nil
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(email, forKey: .email)
        try c.encode(password, forKey: .password)
        try c.encodeIfPresent(appwriteUserId, forKey: .appwriteUserId)
        try c.encodeIfPresent(firstName, forKey: .firstName)
        try c.encodeIfPresent(lastName, forKey: .lastName)
        try c.encodeIfPresent(city, forKey: .city)
        try c.encodeIfPresent(birthDate, forKey: .birthDate)
        try c.encodeIfPresent(gender, forKey: .gender)
        try c.encodeIfPresent(orientation, forKey: .orientation)
        try c.encode(showMe, forKey: .showMe)
        try c.encodeIfPresent(smokes, forKey: .smokes)
        try c.encodeIfPresent(drinks, forKey: .drinks)
        try c.encodeIfPresent(hobbies, forKey: .hobbies)
        try c.encodeIfPresent(passions, forKey: .passions)
        try c.encodeIfPresent(lookingFor, forKey: .lookingFor)
        try c.encodeIfPresent(favoriteSong, forKey: .favoriteSong)
        try c.encodeIfPresent(favoriteMovie, forKey: .favoriteMovie)
        try c.encodeIfPresent(avatarFileId, forKey: .avatarFileId)
    }
}

struct MainEventSnapshot: Sendable {
    let date: Date
    let title: String
    let maxParticipants: Int
    let maleCount: Int
    let femaleCount: Int
    let waitingListCount: Int

    var totalCount: Int { maleCount + femaleCount }
    var remainingMaleSlots: Int { max(0, 24 - maleCount) }
    var remainingFemaleSlots: Int { max(0, 24 - femaleCount) }
}

enum EventHistoryStatus: String, Codable, Sendable {
    case confirmed
    case waitlisted
    case cancelled
    case promoted
}

struct EventHistoryItem: Identifiable, Sendable {
    let id: UUID
    let eventTitle: String
    let eventDate: Date
    let status: EventHistoryStatus
    let timestamp: Date
}

@Observable
final class UserStore: @unchecked Sendable {
    private enum PersistenceKey {
        static let users = "fyre_users"
        static let currentUser = "fyre_current_user"
        static let mainEventState = "fyre_main_event_state"
    }

    private struct EventParticipant: Codable, Sendable {
        let email: String
        let gender: UserGender
    }

    private struct EventHistoryEntry: Codable, Sendable {
        let id: UUID
        let email: String
        let eventTitle: String
        let eventDate: Date
        let status: EventHistoryStatus
        let timestamp: Date
    }

    private struct MainEventState: Codable, Sendable {
        var participants: [EventParticipant] = []
        var waitingList: [EventParticipant] = []
        var history: [EventHistoryEntry] = []

        private enum CodingKeys: String, CodingKey {
            case participants
            case waitingList
            case history
        }

        init() {}

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            participants = try c.decodeIfPresent([EventParticipant].self, forKey: .participants) ?? []
            waitingList = try c.decodeIfPresent([EventParticipant].self, forKey: .waitingList) ?? []
            history = try c.decodeIfPresent([EventHistoryEntry].self, forKey: .history) ?? []
        }
    }

    static let shared = UserStore()

    var currentUser: User? {
        didSet {
            UserStore.saveCurrentUser(currentUser)
        }
    }

    var isLoggedIn: Bool { currentUser != nil }
    var isProfileComplete: Bool { currentUser?.isProfileComplete ?? false }

    var isCurrentUserRegisteredForMainEvent: Bool {
        if Self.shouldUseAppwrite, let status = remoteMainEventState?.currentStatus {
            return status == .confirmed || status == .promoted
        }

        guard let email = currentUser?.email else { return false }
        return mainEventState.participants.contains(where: { $0.email == email })
    }

    var isCurrentUserWaitingForMainEvent: Bool {
        if Self.shouldUseAppwrite, let status = remoteMainEventState?.currentStatus {
            return status == .waitlisted
        }

        guard let email = currentUser?.email else { return false }
        return mainEventState.waitingList.contains(where: { $0.email == email })
    }

    var hasCurrentUserMainEventRegistration: Bool {
        isCurrentUserRegisteredForMainEvent || isCurrentUserWaitingForMainEvent
    }

    var currentUserUpcomingEventHistory: [EventHistoryItem] {
        if Self.shouldUseAppwrite, let remoteHistory = remoteMainEventState?.history {
            return remoteHistory
        }

        guard let email = currentUser?.email else { return [] }
        let now = Date()
        return mainEventState.history
            .filter { $0.email == email && $0.eventDate >= now }
            .sorted(by: { $0.timestamp > $1.timestamp })
            .map {
                EventHistoryItem(
                    id: $0.id,
                    eventTitle: $0.eventTitle,
                    eventDate: $0.eventDate,
                    status: $0.status,
                    timestamp: $0.timestamp
                )
            }
    }

    var mainEventSnapshot: MainEventSnapshot {
        if Self.shouldUseAppwrite, let remoteSnapshot = remoteMainEventState?.snapshot {
            return remoteSnapshot
        }

        let male = mainEventState.participants.filter { $0.gender == .male }.count
        let female = mainEventState.participants.filter { $0.gender == .female }.count
        return MainEventSnapshot(
            date: mainEventDate,
            title: mainEventTitle,
            maxParticipants: maxParticipants,
            maleCount: male,
            femaleCount: female,
            waitingListCount: mainEventState.waitingList.count
        )
    }

    private let maxParticipants = 48
    private let mainEventTitle = "Fyre Event"
    private let appwriteService: AppwriteService?
    private let appwriteInitializationError: String?
    private let mainEventDate = Calendar.current.date(from: DateComponents(
        year: 2026,
        month: 3,
        day: 30,
        hour: 21,
        minute: 0
    )) ?? Date().addingTimeInterval(60 * 60 * 24 * 10)

    private var mainEventState: MainEventState {
        didSet {
            UserStore.saveMainEventState(mainEventState)
        }
    }

    private var remoteMainEventState: MainEventRemoteState?

    private init() {
        currentUser = UserStore.loadCurrentUser()
        mainEventState = UserStore.loadMainEventState()
        remoteMainEventState = nil
        if Self.shouldUseAppwrite {
            do {
                // Once Appwrite is configured, auth/profile/event state should come from the backend.
                let configuration = try AppwriteConfiguration.load()
                appwriteService = AppwriteService(configuration: configuration)
                appwriteInitializationError = nil
                UserDefaults.standard.removeObject(forKey: PersistenceKey.users)
                mainEventState = MainEventState()
                UserStore.saveCurrentUser(currentUser)
            } catch {
                appwriteService = nil
                appwriteInitializationError = error.localizedDescription
                debugLog("Appwrite initialization failed: \(error.localizedDescription)")
            }
        } else {
            appwriteService = nil
            appwriteInitializationError = nil
        }
    }

    // MARK: - Public API

    @MainActor
    func signUp(email: String, password: String) async -> String? {
        guard Self.isValidEmail(email) else {
            return L10n.tr("error.auth.invalidEmail")
        }

        let normalizedEmail = normalizeEmail(email)

        guard password.count >= 8 else {
            return L10n.tr("error.auth.invalidPasswordLength")
        }

        if Self.shouldUseAppwrite {
            guard let appwriteService else {
                return authConfigurationErrorMessage()
            }

            do {
                let user = try await appwriteService.signUp(email: normalizedEmail, password: password)
                currentUser = user
                await refreshRemoteMainEventState()
                return nil
            } catch {
                return authErrorMessage(for: error, isSignUp: true)
            }
        } else {
            var users = UserStore.loadUsers()

            if users.contains(where: { $0.email == normalizedEmail }) {
                return L10n.tr("error.signup.emailInUse")
            }

            let user = User(email: normalizedEmail, password: password)
            users.append(user)
            UserStore.saveUsers(users)
            currentUser = user
            return nil
        }
    }

    @MainActor
    func logIn(email: String, password: String) async -> String? {
        guard Self.isValidEmail(email) else {
            return L10n.tr("error.auth.invalidEmail")
        }

        let normalizedEmail = normalizeEmail(email)

        if Self.shouldUseAppwrite {
            guard let appwriteService else {
                return authConfigurationErrorMessage()
            }

            do {
                let user = try await appwriteService.logIn(email: normalizedEmail, password: password)
                currentUser = user
                await refreshRemoteMainEventState()
                return nil
            } catch {
                return authErrorMessage(for: error, isSignUp: false)
            }
        } else {
            let users = UserStore.loadUsers()

            guard let user = users.first(where: { $0.email == normalizedEmail }) else {
                return L10n.tr("error.login.userNotFound")
            }
            guard user.password == password else {
                return L10n.tr("error.login.invalidPassword")
            }

            currentUser = user
            return nil
        }
    }

    @MainActor
    func logOut() async {
        if let appwriteService {
            do {
                try await appwriteService.logOut()
            } catch {
                // Clear local state even when the remote session deletion fails.
            }
        }
        currentUser = nil
        remoteMainEventState = nil
    }

    @MainActor
    func updateProfile(
        firstName: String,
        lastName: String,
        gender: UserGender? = nil,
        city: String = "",
        birthDate: Date?,
        orientation: UserOrientation?,
        showMe: UserShowMe = .everyone,
        smokes: Bool,
        drinks: Bool,
        hobbies: String,
        passions: String,
        lookingFor: String,
        favoriteSong: String,
        favoriteMovie: String
    ) async -> String? {
        guard var user = currentUser else { return L10n.tr("profile.error.noCurrentUser") }
        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCity = city.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !first.isEmpty else { return L10n.tr("profile.error.emptyFirstName") }
        guard !last.isEmpty else { return L10n.tr("profile.error.emptyLastName") }
        guard !normalizedCity.isEmpty else { return L10n.tr("profile.error.emptyCity") }
        guard let birthDate, Self.age(from: birthDate) >= 18 else { return L10n.tr("profile.error.invalidAge") }
        guard let orientation else { return L10n.tr("profile.error.orientationRequired") }
        let nextGender = gender ?? user.gender
        let shouldRemoveMainEventRegistration = willCurrentUserLoseMainEventRegistrations(
            changingGenderTo: nextGender,
            orientation: orientation
        )

        user.firstName = first
        user.lastName = last
        user.gender = nextGender
        user.city = normalizedCity
        user.birthDate = birthDate
        user.orientation = orientation
        user.showMe = showMe
        user.smokes = smokes
        user.drinks = drinks
        user.hobbies = hobbies.trimmingCharacters(in: .whitespacesAndNewlines)
        user.passions = passions.trimmingCharacters(in: .whitespacesAndNewlines)
        user.lookingFor = lookingFor.trimmingCharacters(in: .whitespacesAndNewlines)
        user.favoriteSong = favoriteSong.trimmingCharacters(in: .whitespacesAndNewlines)
        user.favoriteMovie = favoriteMovie.trimmingCharacters(in: .whitespacesAndNewlines)

        if Self.shouldUseAppwrite {
            guard let appwriteService else {
                return authConfigurationErrorMessage()
            }

            do {
                let updatedUser = try await appwriteService.updateProfile(for: user)
                currentUser = updatedUser
                if shouldRemoveMainEventRegistration {
                    try? await appwriteService.cancelMainEventRegistration(
                        for: updatedUser,
                        eventId: remoteMainEventState?.eventId,
                        force: true
                    )
                }
                await refreshRemoteMainEventState()
            } catch {
                return profileErrorMessage(for: error)
            }
        } else {
            var users = UserStore.loadUsers()
            guard let userIndex = users.firstIndex(where: { $0.email == user.email }) else {
                return L10n.tr("profile.error.noCurrentUser")
            }

            users[userIndex] = user
            UserStore.saveUsers(users)
            currentUser = user
        }

        if shouldRemoveMainEventRegistration, !Self.shouldUseAppwrite {
            forceRemoveUserFromMainEvent(email: user.email)
        }

        return nil
    }

    @MainActor
    func updateProfileImage(_ imageData: Data?) async -> String? {
        guard var user = currentUser else { return L10n.tr("profile.error.noCurrentUser") }

        if Self.shouldUseAppwrite {
            if !user.isProfileComplete {
                user.profileImageData = imageData
                currentUser = user
                return nil
            }

            guard let appwriteService else {
                return authConfigurationErrorMessage()
            }

            do {
                let updatedUser = try await appwriteService.updateProfileImage(imageData, for: user)
                currentUser = updatedUser
                return nil
            } catch {
                return profileErrorMessage(for: error)
            }
        } else {
            var users = UserStore.loadUsers()
            guard let userIndex = users.firstIndex(where: { $0.email == user.email }) else {
                return L10n.tr("profile.error.noCurrentUser")
            }

            user.profileImageData = imageData
            users[userIndex] = user
            UserStore.saveUsers(users)
            currentUser = user
            return nil
        }
    }

    func willCurrentUserLoseMainEventRegistrations(
        changingGenderTo gender: UserGender? = nil,
        orientation: UserOrientation? = nil
    ) -> Bool {
        guard hasCurrentUserMainEventRegistration,
              let user = currentUser else { return false }

        let nextGender = gender ?? user.gender
        let nextOrientation = orientation ?? user.orientation

        return user.gender != nextGender || user.orientation != nextOrientation
    }

    @MainActor
    func refreshRemoteMainEventState() async {
        guard Self.shouldUseAppwrite else { return }
        guard let appwriteService else {
            remoteMainEventState = nil
            return
        }

        do {
            remoteMainEventState = try await appwriteService.fetchMainEventState(for: currentUser)
        } catch {
            debugLog("Remote event refresh failed: \(error.localizedDescription)")
        }
    }

    @MainActor
    func registerForMainEvent() async -> String? {
        if Self.shouldUseAppwrite {
            guard let user = currentUser else { return L10n.tr("events.error.loginRequired") }
            guard let appwriteService else { return eventRequestErrorMessage() }

            do {
                // Capacity, waitlist, and gender-balance rules live in the server-side function now.
                let status = try await appwriteService.registerForMainEvent(
                    for: user,
                    eventId: remoteMainEventState?.eventId
                )
                await refreshRemoteMainEventState()
                return status == .waitlisted ? L10n.tr("events.success.waitlisted") : nil
            } catch {
                return eventErrorMessage(for: error)
            }
        }

        return await registerForMainEvent()
    }

    @MainActor
    func cancelMainEventRegistration() async -> String? {
        if Self.shouldUseAppwrite {
            guard let user = currentUser else { return L10n.tr("events.error.loginRequired") }
            guard let appwriteService else { return eventRequestErrorMessage() }

            do {
                try await appwriteService.cancelMainEventRegistration(
                    for: user,
                    eventId: remoteMainEventState?.eventId
                )
                await refreshRemoteMainEventState()
                return nil
            } catch {
                return eventErrorMessage(for: error)
            }
        }

        return await cancelMainEventRegistration()
    }

    func registerForMainEvent() -> String? {
        guard let user = currentUser else { return L10n.tr("events.error.loginRequired") }
        guard !isCurrentUserRegisteredForMainEvent else { return L10n.tr("events.error.alreadyRegistered") }
        guard !isCurrentUserWaitingForMainEvent else { return L10n.tr("events.error.alreadyWaitlisted") }
        guard let gender = user.gender else { return L10n.tr("events.error.genderRequired") }
        guard gender == .male || gender == .female else { return L10n.tr("events.error.genderUnsupported") }
        guard user.orientation == .straight else { return L10n.tr("events.error.orientationUnsupported") }

        let now = Date()
        guard now < mainEventDate.addingTimeInterval(-(24 * 60 * 60)) else {
            return L10n.tr("events.error.registrationClosed")
        }

        let snapshot = mainEventSnapshot
        guard snapshot.totalCount < maxParticipants else {
            return L10n.tr("events.error.capacityFull")
        }

        let sameGenderCount = gender == .male ? snapshot.maleCount : snapshot.femaleCount
        if sameGenderCount >= 24 {
            mainEventState.waitingList.append(EventParticipant(email: user.email, gender: gender))
            appendEventHistory(email: user.email, status: .waitlisted)
            return L10n.tr("events.success.waitlisted")
        }

        mainEventState.participants.append(EventParticipant(email: user.email, gender: gender))
        appendEventHistory(email: user.email, status: .confirmed)
        return nil
    }

    func cancelMainEventRegistration() -> String? {
        guard let user = currentUser else { return L10n.tr("events.error.loginRequired") }

        let now = Date()
        guard now < mainEventDate.addingTimeInterval(-(48 * 60 * 60)) else {
            return L10n.tr("events.error.cancellationClosed")
        }

        if let participantIndex = mainEventState.participants.firstIndex(where: { $0.email == user.email }) {
            let removed = mainEventState.participants.remove(at: participantIndex)
            appendEventHistory(email: user.email, status: .cancelled)
            tryPromoteFromWaitingList(for: removed.gender)
            return nil
        }

        if let waitingIndex = mainEventState.waitingList.firstIndex(where: { $0.email == user.email }) {
            mainEventState.waitingList.remove(at: waitingIndex)
            appendEventHistory(email: user.email, status: .cancelled)
            return nil
        }

        return L10n.tr("events.error.notRegistered")
    }

    static func isValidEmail(_ email: String) -> Bool {
        guard email.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else { return false }
        let parts = email.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return false }
        let local = parts[0]
        let domain = parts[1]
        guard !local.isEmpty, domain.contains(".") else { return false }
        let domainParts = domain.split(separator: ".", omittingEmptySubsequences: false)
        guard domainParts.count >= 2, domainParts.allSatisfy({ !$0.isEmpty }) else { return false }
        guard let tld = domainParts.last, tld.count >= 2 else { return false }
        return true
    }

    static func age(from birthDate: Date) -> Int {
        Calendar.current.dateComponents([.year], from: birthDate, to: Date()).year ?? 0
    }

    // MARK: - Persistence helpers

    private func normalizeEmail(_ email: String) -> String {
        email.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    @MainActor
    func restoreRemoteSessionIfNeeded() async {
        guard Self.shouldUseAppwrite else { return }
        guard let appwriteService else {
            currentUser = nil
            remoteMainEventState = nil
            if let appwriteInitializationError {
                debugLog("Appwrite initialization failed: \(appwriteInitializationError)")
            }
            return
        }

        do {
            currentUser = try await appwriteService.restoreCurrentUser()
            await refreshRemoteMainEventState()
        } catch let error as AppwriteServiceError where error.isUnauthorized {
            currentUser = nil
            remoteMainEventState = nil
        } catch {
            // Keep the last persisted user visible if the network is temporarily unavailable.
        }
    }

    private static func loadUsers() -> [User] {
        loadPersistedValue([User].self, forKey: PersistenceKey.users) ?? []
    }

    private static func saveUsers(_ users: [User]) {
        savePersistedValue(users, forKey: PersistenceKey.users)
    }

    private static func loadCurrentUser() -> User? {
        loadPersistedValue(User.self, forKey: PersistenceKey.currentUser)
    }

    private static func saveCurrentUser(_ user: User?) {
        guard let user else {
            UserDefaults.standard.removeObject(forKey: PersistenceKey.currentUser)
            return
        }

        savePersistedValue(user, forKey: PersistenceKey.currentUser)
    }

    private static func loadMainEventState() -> MainEventState {
        loadPersistedValue(MainEventState.self, forKey: PersistenceKey.mainEventState) ?? MainEventState()
    }

    private static func saveMainEventState(_ state: MainEventState) {
        savePersistedValue(state, forKey: PersistenceKey.mainEventState)
    }

    private static func loadPersistedValue<Value: Decodable>(_ type: Value.Type, forKey key: String) -> Value? {
        guard let data = UserDefaults.standard.data(forKey: key) else {
            return nil
        }

        do {
            return try JSONDecoder().decode(Value.self, from: data)
        } catch {
            fatalError("Failed to decode persisted value for key '\(key)': \(error)")
        }
    }

    private static func savePersistedValue<Value: Encodable>(_ value: Value, forKey key: String) {
        do {
            let data = try JSONEncoder().encode(value)
            UserDefaults.standard.set(data, forKey: key)
        } catch {
            fatalError("Failed to encode persisted value for key '\(key)': \(error)")
        }
    }

    static func resetPersistedState() {
        let defaults = UserDefaults.standard
        defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix("fyre_") }
            .forEach { defaults.removeObject(forKey: $0) }
        UserStore.shared.resetForTests()
    }

    private func canPromote(_ participant: EventParticipant) -> Bool {
        let snapshot = mainEventSnapshot
        guard snapshot.totalCount < maxParticipants else { return false }

        let sameGenderCount = participant.gender == .male ? snapshot.maleCount : snapshot.femaleCount
        return sameGenderCount < 24
    }

    private func tryPromoteFromWaitingList(for gender: UserGender) {
        guard !mainEventState.waitingList.isEmpty else { return }

        let waitingIndex = mainEventState.waitingList.firstIndex(where: {
            $0.gender == gender && canPromote($0)
        })

        guard let indexToPromote = waitingIndex else { return }
        let promoted = mainEventState.waitingList.remove(at: indexToPromote)
        mainEventState.participants.append(promoted)
        appendEventHistory(email: promoted.email, status: .promoted)
    }

    private func appendEventHistory(email: String, status: EventHistoryStatus) {
        mainEventState.history.append(
            EventHistoryEntry(
                id: UUID(),
                email: email,
                eventTitle: mainEventTitle,
                eventDate: mainEventDate,
                status: status,
                timestamp: Date()
            )
        )
    }

    private func forceRemoveUserFromMainEvent(email: String) {
        if let participantIndex = mainEventState.participants.firstIndex(where: { $0.email == email }) {
            let removed = mainEventState.participants.remove(at: participantIndex)
            appendEventHistory(email: email, status: .cancelled)
            tryPromoteFromWaitingList(for: removed.gender)
        }

        if let waitingIndex = mainEventState.waitingList.firstIndex(where: { $0.email == email }) {
            mainEventState.waitingList.remove(at: waitingIndex)
            appendEventHistory(email: email, status: .cancelled)
        }
    }

    func resetForTests() {
        currentUser = nil
        mainEventState = MainEventState()
        remoteMainEventState = nil
    }

    private static var shouldUseAppwrite: Bool {
        !isRunningTests && !ProcessInfo.processInfo.arguments.contains("-uitest-reset")
    }

    private static var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    @MainActor
    private func authErrorMessage(for error: Error, isSignUp: Bool) -> String {
        switch error {
        case let serviceError as AppwriteServiceError:
            switch serviceError {
            case let .api(statusCode, message, type):
                let normalizedMessage = message?.lowercased() ?? ""
                let normalizedType = type?.lowercased() ?? ""

                if isSignUp && (statusCode == 409 || normalizedType.contains("already") || normalizedMessage.contains("already")) {
                    return L10n.tr("error.signup.emailInUse")
                }

                if statusCode == 401 {
                    return L10n.tr("error.login.invalidCredentials")
                }

                if normalizedType.contains("password") || normalizedMessage.contains("password") {
                    return L10n.tr("error.auth.invalidPasswordLength")
                }

                return L10n.tr("error.auth.requestFailed")
            case .network:
                return L10n.tr("error.auth.requestFailed")
            case .missingAccountId, .invalidResponse, .decoding, .missingConfiguration:
                return L10n.tr("error.auth.requestFailed")
            }
        default:
            return L10n.tr("error.auth.requestFailed")
        }
    }

    @MainActor
    private func authConfigurationErrorMessage() -> String {
        if let appwriteInitializationError {
            debugLog("Appwrite configuration error: \(appwriteInitializationError)")
        }
        return L10n.tr("error.auth.requestFailed")
    }

    @MainActor
    private func profileErrorMessage(for error: Error) -> String {
        switch error {
        case let serviceError as AppwriteServiceError:
            if serviceError.isUnauthorized {
                currentUser = nil
                return L10n.tr("profile.error.noCurrentUser")
            }
            if case let .api(_, message, _) = serviceError,
               let message,
               !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                debugLog("Appwrite profile save failed: \(message)")
            } else {
                debugLog("Appwrite profile save failed: \(serviceError)")
            }
            return L10n.tr("profile.error.saveFailed")
        default:
            debugLog("Profile save failed: \(error.localizedDescription)")
            return L10n.tr("profile.error.saveFailed")
        }
    }

    @MainActor
    private func eventErrorMessage(for error: Error) -> String {
        switch error {
        case let serviceError as AppwriteServiceError:
            if serviceError.isUnauthorized {
                currentUser = nil
                remoteMainEventState = nil
                return L10n.tr("events.error.loginRequired")
            }

            if case let .api(_, message, _) = serviceError,
               let message {
                if message.hasPrefix("events.") {
                    return L10n.tr(message)
                }
                debugLog("Appwrite event request failed: \(message)")
            } else {
                debugLog("Appwrite event request failed: \(serviceError)")
            }

            return eventRequestErrorMessage()
        default:
            debugLog("Event request failed: \(error.localizedDescription)")
            return eventRequestErrorMessage()
        }
    }

    @MainActor
    private func eventRequestErrorMessage() -> String {
        L10n.tr("events.error.requestFailed")
    }

    private func debugLog(_ message: String) {
#if DEBUG
        print(message)
#endif
    }
}
