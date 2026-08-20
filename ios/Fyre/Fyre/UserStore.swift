//
//  UserStore.swift
//  Fyre
//
//  Created by Gabriele Mininni on 03/03/26.
//  Local user store with Keychain-backed session state and memory-only mock credentials.
//

import CoreLocation
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

enum UserIntent: String, Codable, CaseIterable, Sendable, Identifiable {
    case relationship
    case casual
    case friendship
    case notSure

    var id: String { rawValue }

    var localizationKey: String {
        switch self {
        case .relationship:
            return "profile.intent.relationship"
        case .casual:
            return "profile.intent.casual"
        case .friendship:
            return "profile.intent.friendship"
        case .notSure:
            return "profile.intent.notSure"
        }
    }
}

struct User: Codable, Sendable {
    var email: String
    var appwriteUserId: String?
    var firstName: String?
    var lastName: String?
    var city: String?
    var birthDate: Date?
    var gender: UserGender?
    var orientation: UserOrientation?
    var preferredGenders: [UserGender]?
    var minPreferredAge: Int?
    var maxPreferredAge: Int?
    var maxDistanceKm: Int?
    var latitude: Double?
    var longitude: Double?
    var excludeSmokers: Bool?
    var excludeDrinkers: Bool?
    var smokes: Bool?
    var drinks: Bool?
    var bio: String?
    var intent: UserIntent?
    var interests: String?
    var instagramTag: String?
    var spotifyTag: String?
    var avatarFileId: String?
    var photoFileIds: [String]?
    var profileImageData: Data?
    var profilePhotoDataItems: [Data]?

    nonisolated var displayName: String {
        let first = firstName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let last = lastName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let full = "\(first) \(last)".trimmingCharacters(in: .whitespacesAndNewlines)
        return full.isEmpty ? email : full
    }

    nonisolated var resolvedPreferredGenders: [UserGender] {
        let explicit = preferredGenders ?? []
        if !explicit.isEmpty {
            return UserGender.allCases.filter { explicit.contains($0) }
        }
        return UserStore.defaultPreferredGenders
    }

    nonisolated var resolvedMinPreferredAge: Int {
        min(max(minPreferredAge ?? 18, 18), 98)
    }

    nonisolated var resolvedMaxPreferredAge: Int {
        let minimum = max(resolvedMinPreferredAge + 1, 19)
        return max(min(maxPreferredAge ?? 35, 99), minimum)
    }

    nonisolated var normalizedMaxDistanceKm: Int? {
        guard let maxDistanceKm else { return nil }
        return min(max(maxDistanceKm, 5), 999)
    }

    nonisolated var normalizedBio: String {
        bio?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    nonisolated var normalizedInterests: String {
        interests?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    nonisolated var normalizedInstagramTag: String {
        Self.normalizedSocialTag(instagramTag) ?? ""
    }

    nonisolated var normalizedSpotifyTag: String {
        Self.normalizedSocialTag(spotifyTag) ?? ""
    }

    nonisolated var resolvedPhotoFileIds: [String] {
        photoFileIds?.filter { !$0.isEmpty } ?? []
    }

    nonisolated var resolvedProfilePhotoDataItems: [Data] {
        profilePhotoDataItems?.filter { !$0.isEmpty } ?? []
    }

    nonisolated var primaryProfileImageData: Data? {
        guard let profileImageData, !profileImageData.isEmpty else {
            return nil
        }
        return profileImageData
    }

    nonisolated var isProfileComplete: Bool {
        guard let firstName, !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard let city, !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard let birthDate, UserStore.age(from: birthDate) >= 18 else { return false }
        guard gender != nil else { return false }
        guard orientation != nil else { return false }
        guard !normalizedBio.isEmpty else { return false }
        guard let preferredGenders, !preferredGenders.isEmpty else { return false }
        return true
    }

    nonisolated init(email: String) {
        self.email = email
    }

    nonisolated static func normalizedSocialTag(_ value: String?) -> String? {
        guard let value else { return nil }

        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let withoutAtPrefix = String(trimmed.drop(while: { $0 == "@" }))
        let withoutWhitespace = withoutAtPrefix.replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
        let withoutAt = withoutWhitespace.replacingOccurrences(of: "@", with: "")
        guard !withoutAt.isEmpty else { return nil }

        return String(withoutAt.prefix(64))
    }

    private enum CodingKeys: String, CodingKey {
        case email
        case appwriteUserId
        case firstName
        case lastName
        case city
        case birthDate
        case gender
        case orientation
        case preferredGenders
        case minPreferredAge
        case maxPreferredAge
        case maxDistanceKm
        case latitude
        case longitude
        case excludeSmokers
        case excludeDrinkers
        case smokes
        case drinks
        case bio
        case intent
        case interests
        case instagramTag
        case spotifyTag
        case avatarFileId
        case photoFileIds
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        email = try c.decode(String.self, forKey: .email)
        appwriteUserId = try c.decodeIfPresent(String.self, forKey: .appwriteUserId)
        firstName = try c.decodeIfPresent(String.self, forKey: .firstName)
        lastName = try c.decodeIfPresent(String.self, forKey: .lastName)
        city = try c.decodeIfPresent(String.self, forKey: .city)
        birthDate = try c.decodeIfPresent(Date.self, forKey: .birthDate)
        gender = try c.decodeIfPresent(UserGender.self, forKey: .gender)
        orientation = try c.decodeIfPresent(UserOrientation.self, forKey: .orientation)
        preferredGenders = try c.decodeIfPresent([UserGender].self, forKey: .preferredGenders)
        minPreferredAge = try c.decodeIfPresent(Int.self, forKey: .minPreferredAge)
        maxPreferredAge = try c.decodeIfPresent(Int.self, forKey: .maxPreferredAge)
        maxDistanceKm = try c.decodeIfPresent(Int.self, forKey: .maxDistanceKm)
        latitude = try c.decodeIfPresent(Double.self, forKey: .latitude)
        longitude = try c.decodeIfPresent(Double.self, forKey: .longitude)
        excludeSmokers = try c.decodeIfPresent(Bool.self, forKey: .excludeSmokers)
        excludeDrinkers = try c.decodeIfPresent(Bool.self, forKey: .excludeDrinkers)
        smokes = try c.decodeIfPresent(Bool.self, forKey: .smokes)
        drinks = try c.decodeIfPresent(Bool.self, forKey: .drinks)
        bio = try c.decodeIfPresent(String.self, forKey: .bio)
        intent = try c.decodeIfPresent(UserIntent.self, forKey: .intent)
        interests = try c.decodeIfPresent(String.self, forKey: .interests)
        instagramTag = try c.decodeIfPresent(String.self, forKey: .instagramTag)
        spotifyTag = try c.decodeIfPresent(String.self, forKey: .spotifyTag)
        avatarFileId = try c.decodeIfPresent(String.self, forKey: .avatarFileId)
        photoFileIds = try c.decodeIfPresent([String].self, forKey: .photoFileIds)
        profileImageData = nil
        profilePhotoDataItems = nil
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(email, forKey: .email)
        try c.encodeIfPresent(appwriteUserId, forKey: .appwriteUserId)
        try c.encodeIfPresent(firstName, forKey: .firstName)
        try c.encodeIfPresent(lastName, forKey: .lastName)
        try c.encodeIfPresent(city, forKey: .city)
        try c.encodeIfPresent(birthDate, forKey: .birthDate)
        try c.encodeIfPresent(gender, forKey: .gender)
        try c.encodeIfPresent(orientation, forKey: .orientation)
        try c.encodeIfPresent(preferredGenders, forKey: .preferredGenders)
        try c.encodeIfPresent(minPreferredAge, forKey: .minPreferredAge)
        try c.encodeIfPresent(maxPreferredAge, forKey: .maxPreferredAge)
        try c.encodeIfPresent(maxDistanceKm, forKey: .maxDistanceKm)
        try c.encodeIfPresent(latitude, forKey: .latitude)
        try c.encodeIfPresent(longitude, forKey: .longitude)
        try c.encodeIfPresent(excludeSmokers, forKey: .excludeSmokers)
        try c.encodeIfPresent(excludeDrinkers, forKey: .excludeDrinkers)
        try c.encodeIfPresent(smokes, forKey: .smokes)
        try c.encodeIfPresent(drinks, forKey: .drinks)
        try c.encodeIfPresent(bio, forKey: .bio)
        try c.encodeIfPresent(intent, forKey: .intent)
        try c.encodeIfPresent(interests, forKey: .interests)
        try c.encodeIfPresent(instagramTag, forKey: .instagramTag)
        try c.encodeIfPresent(spotifyTag, forKey: .spotifyTag)
        try c.encodeIfPresent(avatarFileId, forKey: .avatarFileId)
        try c.encodeIfPresent(photoFileIds, forKey: .photoFileIds)
    }
}

struct MainEventSnapshot: Sendable {
    let date: Date
    let title: String
    let place: String?
    let eventDescription: String?
    let rules: [String]
    let maxParticipants: Int
    let maleLimit: Int
    let femaleLimit: Int
    let maleCount: Int
    let femaleCount: Int
    let waitingListCount: Int
    let registrationClosesAt: Date?
    let cancellationClosesAt: Date?

    var totalCount: Int { maleCount + femaleCount }
    var remainingMaleSlots: Int { max(0, maleLimit - maleCount) }
    var remainingFemaleSlots: Int { max(0, femaleLimit - femaleCount) }
}

enum EventHistoryStatus: String, Codable, Sendable {
    case confirmed
    case waitlisted
    case cancelled
    case promoted
}

extension EventHistoryStatus {
    nonisolated var sortOrder: Int {
        switch self {
        case .confirmed:
            return 0
        case .promoted:
            return 1
        case .waitlisted:
            return 2
        case .cancelled:
            return 3
        }
    }
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
        static let mainEventState = "fyre_main_event_state"
    }

    private enum SecurePersistenceKey {
        static let currentUser = "profile.current-user.v1"
        static let logoutPending = "auth.logout-pending.v1"
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

    /// Authentication fixture used only by XCTest and `-uitest-reset`.
    /// It is intentionally not Codable and is never handed to a persistence API.
    private struct EphemeralLocalAccount: Sendable {
        var user: User
        let password: String
    }

    static let shared = UserStore()

    var currentUser: User? {
        didSet {
            UserStore.saveCurrentUser(currentUser)
        }
    }

    private(set) var isSessionBootstrapComplete = false

    var isLoggedIn: Bool { currentUser != nil }
    var isProfileComplete: Bool { currentUser?.isProfileComplete ?? false }

    var isCurrentUserRegisteredForMainEvent: Bool {
        if Self.shouldUseAppwrite {
            guard let status = remoteMainEventState?.currentStatus else { return false }
            return status == .confirmed || status == .promoted
        }

        guard let email = currentUser?.email else { return false }
        return mainEventState.participants.contains(where: { $0.email == email })
    }

    var isCurrentUserWaitingForMainEvent: Bool {
        if Self.shouldUseAppwrite {
            return remoteMainEventState?.currentStatus == .waitlisted
        }

        guard let email = currentUser?.email else { return false }
        return mainEventState.waitingList.contains(where: { $0.email == email })
    }

    var hasCurrentUserMainEventRegistration: Bool {
        isCurrentUserRegisteredForMainEvent || isCurrentUserWaitingForMainEvent
    }

    var currentUserUpcomingEventHistory: [EventHistoryItem] {
        if Self.shouldUseAppwrite {
            return remoteMainEventState?.history ?? []
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
        if Self.shouldUseAppwrite {
            if let remoteSnapshot = remoteMainEventState?.snapshot {
                return remoteSnapshot
            }

            return MainEventSnapshot(
                date: mainEventDate,
                title: mainEventTitle,
                place: nil,
                eventDescription: nil,
                rules: [],
                maxParticipants: maxParticipants,
                maleLimit: maxParticipants / 2,
                femaleLimit: maxParticipants / 2,
                maleCount: 0,
                femaleCount: 0,
                waitingListCount: 0,
                registrationClosesAt: nil,
                cancellationClosesAt: nil
            )
        }

        let male = mainEventState.participants.filter { $0.gender == .male }.count
        let female = mainEventState.participants.filter { $0.gender == .female }.count
        return MainEventSnapshot(
            date: mainEventDate,
            title: mainEventTitle,
            place: nil,
            eventDescription: nil,
            rules: [],
            maxParticipants: maxParticipants,
            maleLimit: maxParticipants / 2,
            femaleLimit: maxParticipants / 2,
            maleCount: male,
            femaleCount: female,
            waitingListCount: mainEventState.waitingList.count,
            registrationClosesAt: mainEventDate.addingTimeInterval(-(24 * 60 * 60)),
            cancellationClosesAt: mainEventDate.addingTimeInterval(-(48 * 60 * 60))
        )
    }

    var mainEventAdminState: EventAdminState? {
        Self.shouldUseAppwrite ? remoteMainEventState?.adminState : nil
    }

    var hasLiveMainEvent: Bool {
        !Self.shouldUseAppwrite || remoteMainEventState != nil
    }

    var isCurrentUserEventAdmin: Bool {
        mainEventAdminState != nil
    }

    private let maxParticipants = 48
    private let mainEventTitle = "Fyre Event"
    private let appwriteService: AppwriteService?
    private let appwriteInitializationError: String?
    @ObservationIgnored private var sessionBootstrapTask: Task<Void, Never>?
    @ObservationIgnored private var authenticationOperationInFlight = false
    @ObservationIgnored private var authenticationWaiters: [CheckedContinuation<Void, Never>] = []
    @ObservationIgnored private var sessionEpoch: UInt = 0
    @ObservationIgnored private var eventRefreshGeneration: UInt = 0
    @ObservationIgnored private var logoutPendingInMemory = false
    @ObservationIgnored private var ephemeralLocalAccounts: [String: EphemeralLocalAccount] = [:]
    private let mainEventDate = Date().addingTimeInterval(60 * 60 * 24 * 10)

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
            UserDefaults.standard.removeObject(forKey: PersistenceKey.mainEventState)
            do {
                // Once Appwrite is configured, auth/profile/event state should come from the backend.
                let configuration = try AppwriteConfiguration.load()
                appwriteService = AppwriteService(configuration: configuration)
                appwriteInitializationError = nil
                mainEventState = MainEventState()
                UserStore.saveCurrentUser(currentUser)
            } catch {
                appwriteService = nil
                appwriteInitializationError = error.localizedDescription
                debugLog("Appwrite initialization failed")
            }
        } else {
            appwriteService = nil
            appwriteInitializationError = nil
        }
    }

    @MainActor
    private func acquireAuthenticationOperation() async {
        if !authenticationOperationInFlight {
            authenticationOperationInFlight = true
            return
        }

        await withCheckedContinuation { continuation in
            authenticationWaiters.append(continuation)
        }
    }

    @MainActor
    private func releaseAuthenticationOperation() {
        if authenticationWaiters.isEmpty {
            authenticationOperationInFlight = false
            return
        }
        authenticationWaiters.removeFirst().resume()
    }

    @MainActor
    @discardableResult
    private func advanceSessionEpoch() -> UInt {
        sessionEpoch &+= 1
        eventRefreshGeneration &+= 1
        return sessionEpoch
    }

    private func sessionIdentity(for user: User?) -> String? {
        guard let user else { return nil }
        let accountId = user.appwriteUserId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return accountId.isEmpty ? normalizeEmail(user.email) : accountId
    }

    @MainActor
    private func isCurrentSession(epoch: UInt, identity: String?) -> Bool {
        sessionEpoch == epoch && sessionIdentity(for: currentUser) == identity
    }

    private func hasPendingLogout() -> Bool {
        if logoutPendingInMemory {
            return true
        }
        do {
            return try SecurePersistenceStore.data(forKey: SecurePersistenceKey.logoutPending) != nil
        } catch {
            return true
        }
    }

    private func setLogoutPending(_ isPending: Bool) {
        logoutPendingInMemory = isPending
        if isPending {
            try? SecurePersistenceStore.setData(Data([1]), forKey: SecurePersistenceKey.logoutPending)
        } else {
            try? SecurePersistenceStore.removeData(forKey: SecurePersistenceKey.logoutPending)
        }
    }

    @MainActor
    private func finishPendingLogout(using service: AppwriteService) async -> Bool {
        guard hasPendingLogout() else { return true }
        do {
            try await service.logOut()
            setLogoutPending(false)
            return true
        } catch {
            return false
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

            await acquireAuthenticationOperation()
            defer { releaseAuthenticationOperation() }
            guard await finishPendingLogout(using: appwriteService) else {
                return L10n.tr("error.auth.requestFailed")
            }
            let operationEpoch = advanceSessionEpoch()
            remoteMainEventState = nil

            do {
                let user = try await appwriteService.signUp(email: normalizedEmail, password: password)
                guard sessionEpoch == operationEpoch else {
                    return L10n.tr("error.auth.requestFailed")
                }
                currentUser = user
                await refreshRemoteMainEventState()
                return nil
            } catch {
                return authErrorMessage(for: error, isSignUp: true)
            }
        } else {
            if ephemeralLocalAccounts[normalizedEmail] != nil {
                return L10n.tr("error.signup.emailInUse")
            }

            let user = User(email: normalizedEmail)
            ephemeralLocalAccounts[normalizedEmail] = EphemeralLocalAccount(
                user: user,
                password: password
            )
            advanceSessionEpoch()
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

            await acquireAuthenticationOperation()
            defer { releaseAuthenticationOperation() }
            guard await finishPendingLogout(using: appwriteService) else {
                return L10n.tr("error.auth.requestFailed")
            }
            let operationEpoch = advanceSessionEpoch()
            remoteMainEventState = nil

            do {
                let user = try await appwriteService.logIn(email: normalizedEmail, password: password)
                guard sessionEpoch == operationEpoch else {
                    return L10n.tr("error.auth.requestFailed")
                }
                currentUser = user
                await refreshRemoteMainEventState()
                return nil
            } catch {
                return authErrorMessage(for: error, isSignUp: false)
            }
        } else {
            guard let account = ephemeralLocalAccounts[normalizedEmail] else {
                return L10n.tr("error.login.userNotFound")
            }
            guard account.password == password else {
                return L10n.tr("error.login.invalidPassword")
            }

            advanceSessionEpoch()
            currentUser = account.user
            return nil
        }
    }

    @MainActor
    func logOut() async {
        let currentAccountId = currentUser?.appwriteUserId
        advanceSessionEpoch()
        RecentChatThreadStore.clearForLogout(currentUserId: currentAccountId)
        MatchSeenStore.clearForLogout(currentUserId: currentAccountId)
        currentUser = nil
        remoteMainEventState = nil

        guard Self.shouldUseAppwrite else { return }
        setLogoutPending(true)
        guard let appwriteService else { return }
        await acquireAuthenticationOperation()
        defer { releaseAuthenticationOperation() }

        do {
            try await appwriteService.logOut()
            setLogoutPending(false)
        } catch {
            // The Keychain tombstone forces another remote deletion before any
            // later session restore or login can authenticate the app again.
        }
    }

    @MainActor
    func setProfileGender(_ gender: UserGender) async -> String? {
        guard var user = currentUser else { return L10n.tr("profile.error.noCurrentUser") }
        let operationEpoch = sessionEpoch
        let operationIdentity = sessionIdentity(for: user)

        let shouldRemoveMainEventRegistration = willCurrentUserLoseMainEventRegistrations(changingGenderTo: gender)
        user.gender = gender

        if Self.shouldUseAppwrite {
            // Tests may still exercise this focused helper; production profile edits
            // otherwise flow through updateProfile.
            currentUser = user

            if user.isProfileComplete {
                guard let appwriteService else {
                    return authConfigurationErrorMessage()
                }

                do {
                    let updatedUser = try await appwriteService.updateProfile(for: user)
                    guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                        return L10n.tr("profile.error.noCurrentUser")
                    }
                    currentUser = updatedUser
                    if let removalError = await enforceMainEventEligibilityAfterProfileChange(
                        shouldRemoveMainEventRegistration,
                        user: updatedUser,
                        appwriteService: appwriteService
                    ) {
                        return removalError
                    }
                } catch {
                    guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                        return L10n.tr("profile.error.noCurrentUser")
                    }
                    return profileErrorMessage(for: error)
                }
            }
        } else {
            guard var account = ephemeralLocalAccounts[user.email] else {
                return L10n.tr("profile.error.noCurrentUser")
            }

            account.user = user
            ephemeralLocalAccounts[user.email] = account
            currentUser = user
        }

        if shouldRemoveMainEventRegistration, !Self.shouldUseAppwrite {
            forceRemoveUserFromMainEvent(email: user.email)
        }

        return nil
    }

    @MainActor
    func updateProfile(
        firstName: String,
        lastName: String,
        gender: UserGender? = nil,
        city: String = "",
        birthDate: Date?,
        orientation: UserOrientation?,
        bio: String,
        intent: UserIntent?,
        interests: String,
        instagramTag: String,
        spotifyTag: String,
        preferredGenders: [UserGender],
        minPreferredAge: Int,
        maxPreferredAge: Int,
        maxDistanceKm: Int?,
        excludeSmokers: Bool,
        excludeDrinkers: Bool,
        smokes: Bool,
        drinks: Bool
    ) async -> String? {
        guard var user = currentUser else { return L10n.tr("profile.error.noCurrentUser") }
        let operationEpoch = sessionEpoch
        let operationIdentity = sessionIdentity(for: user)
        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCity = city.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedInterests = interests.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedInstagramTag = User.normalizedSocialTag(instagramTag)
        let normalizedSpotifyTag = User.normalizedSocialTag(spotifyTag)
        let normalizedPreferredGenders = UserGender.allCases.filter { preferredGenders.contains($0) }
        let normalizedMinAge = min(max(minPreferredAge, 18), 98)
        let normalizedMaxAge = max(min(maxPreferredAge, 99), max(normalizedMinAge + 1, 19))
        let normalizedMaxDistanceKm = maxDistanceKm.map { min(max($0, 5), 999) }
        guard !first.isEmpty else { return L10n.tr("profile.error.emptyFirstName") }
        guard !normalizedCity.isEmpty else { return L10n.tr("profile.error.emptyCity") }
        guard let birthDate, Self.age(from: birthDate) >= 18 else { return L10n.tr("profile.error.invalidAge") }
        guard let orientation else { return L10n.tr("profile.error.orientationRequired") }
        guard !normalizedBio.isEmpty else { return L10n.tr("profile.error.emptyBio") }
        guard !normalizedPreferredGenders.isEmpty else { return L10n.tr("profile.error.preferredGendersRequired") }
        let existingCity = user.city?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let shouldRefreshCoordinates = existingCity.caseInsensitiveCompare(normalizedCity) != .orderedSame
            || user.latitude == nil
            || user.longitude == nil
        let resolvedLocation: (displayName: String, latitude: Double, longitude: Double)
        if !shouldRefreshCoordinates,
           let latitude = user.latitude,
           let longitude = user.longitude,
           !existingCity.isEmpty {
            resolvedLocation = (existingCity, latitude, longitude)
        } else {
            do {
                resolvedLocation = try await Self.resolvedCity(for: normalizedCity)
            } catch {
                return L10n.tr("profile.error.cityLookupFailed")
            }
            guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                return L10n.tr("profile.error.noCurrentUser")
            }
        }
        let nextGender = gender ?? user.gender
        let shouldRemoveMainEventRegistration = willCurrentUserLoseMainEventRegistrations(
            changingGenderTo: nextGender,
            orientation: orientation
        )

        user.firstName = first
        user.lastName = last
        user.gender = nextGender
        user.city = resolvedLocation.displayName
        user.birthDate = birthDate
        user.orientation = orientation
        user.preferredGenders = normalizedPreferredGenders
        user.minPreferredAge = normalizedMinAge
        user.maxPreferredAge = normalizedMaxAge
        user.maxDistanceKm = normalizedMaxDistanceKm
        user.latitude = resolvedLocation.latitude
        user.longitude = resolvedLocation.longitude
        user.excludeSmokers = excludeSmokers
        user.excludeDrinkers = excludeDrinkers
        user.smokes = smokes
        user.drinks = drinks
        user.bio = normalizedBio
        user.intent = intent
        user.interests = normalizedInterests
        user.instagramTag = normalizedInstagramTag
        user.spotifyTag = normalizedSpotifyTag

        if Self.shouldUseAppwrite {
            guard let appwriteService else {
                return authConfigurationErrorMessage()
            }

            do {
                let updatedUser = try await appwriteService.updateProfile(for: user)
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return L10n.tr("profile.error.noCurrentUser")
                }
                currentUser = updatedUser
                if let removalError = await enforceMainEventEligibilityAfterProfileChange(
                    shouldRemoveMainEventRegistration,
                    user: updatedUser,
                    appwriteService: appwriteService
                ) {
                    return removalError
                }
            } catch {
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return L10n.tr("profile.error.noCurrentUser")
                }
                return profileErrorMessage(for: error)
            }
        } else {
            guard var account = ephemeralLocalAccounts[user.email] else {
                return L10n.tr("profile.error.noCurrentUser")
            }

            account.user = user
            ephemeralLocalAccounts[user.email] = account
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
        let operationEpoch = sessionEpoch
        let operationIdentity = sessionIdentity(for: user)
        let sanitizedImage = imageData.flatMap { $0.isEmpty ? nil : $0 }

        if Self.shouldUseAppwrite {
            if !user.isProfileComplete {
                user.profileImageData = sanitizedImage
                if sanitizedImage == nil {
                    user.avatarFileId = nil
                }
                currentUser = user
                return nil
            }

            guard let appwriteService else {
                return authConfigurationErrorMessage()
            }

            do {
                let updatedUser = try await appwriteService.updateProfileImage(sanitizedImage, for: user)
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return L10n.tr("profile.error.noCurrentUser")
                }
                currentUser = updatedUser
                return nil
            } catch {
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return L10n.tr("profile.error.noCurrentUser")
                }
                return profileErrorMessage(for: error)
            }
        }

        guard var account = ephemeralLocalAccounts[user.email] else {
            return L10n.tr("profile.error.noCurrentUser")
        }

        user.profileImageData = sanitizedImage
        user.avatarFileId = nil
        account.user = user
        ephemeralLocalAccounts[user.email] = account
        currentUser = user
        return nil
    }

    @MainActor
    func updateProfileImages(_ imageDataItems: [Data]) async -> String? {
        guard var user = currentUser else { return L10n.tr("profile.error.noCurrentUser") }
        let operationEpoch = sessionEpoch
        let operationIdentity = sessionIdentity(for: user)
        let sanitizedImages = imageDataItems
            .filter { !$0.isEmpty }
            .prefix(6)
            .map { $0 }

        if Self.shouldUseAppwrite {
            if !user.isProfileComplete {
                user.profilePhotoDataItems = sanitizedImages
                if sanitizedImages.isEmpty {
                    user.photoFileIds = []
                }
                currentUser = user
                return nil
            }

            guard let appwriteService else {
                return authConfigurationErrorMessage()
            }

            do {
                let updatedUser = try await appwriteService.updateProfileImages(sanitizedImages, for: user)
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return L10n.tr("profile.error.noCurrentUser")
                }
                currentUser = updatedUser
                return nil
            } catch {
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return L10n.tr("profile.error.noCurrentUser")
                }
                return profileErrorMessage(for: error)
            }
        }

        guard var account = ephemeralLocalAccounts[user.email] else {
            return L10n.tr("profile.error.noCurrentUser")
        }

        user.profilePhotoDataItems = sanitizedImages
        user.photoFileIds = []
        account.user = user
        ephemeralLocalAccounts[user.email] = account
        currentUser = user
        return nil
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
    private func enforceMainEventEligibilityAfterProfileChange(
        _ shouldRemoveRegistration: Bool,
        user: User,
        appwriteService: AppwriteService
    ) async -> String? {
        let operationEpoch = sessionEpoch
        let operationIdentity = sessionIdentity(for: user)
        if shouldRemoveRegistration {
            guard let eventId = remoteMainEventState?.eventId else {
                return eventRequestErrorMessage()
            }
            do {
                try await appwriteService.cancelMainEventRegistration(
                    for: user,
                    eventId: eventId
                )
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return L10n.tr("profile.error.noCurrentUser")
                }
            } catch {
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return L10n.tr("profile.error.noCurrentUser")
                }
                debugLog("Cancellation after profile change failed")
            }
        }

        await refreshRemoteMainEventStateWithRetry()

        if shouldRemoveRegistration, hasCurrentUserMainEventRegistration {
            return L10n.tr("events.error.requestFailed")
        }

        return nil
    }

    @MainActor
    func refreshRemoteMainEventState() async {
        guard Self.shouldUseAppwrite else { return }
        guard let appwriteService else {
            eventRefreshGeneration &+= 1
            remoteMainEventState = nil
            return
        }

        eventRefreshGeneration &+= 1
        let refreshGeneration = eventRefreshGeneration
        let refreshEpoch = sessionEpoch
        let refreshIdentity = sessionIdentity(for: currentUser)

        do {
            let state = try await appwriteService.fetchMainEventState(for: currentUser)
            guard refreshGeneration == eventRefreshGeneration,
                  isCurrentSession(epoch: refreshEpoch, identity: refreshIdentity) else { return }
            remoteMainEventState = state
        } catch {
            guard refreshGeneration == eventRefreshGeneration,
                  isCurrentSession(epoch: refreshEpoch, identity: refreshIdentity) else { return }
            remoteMainEventState = nil
            if !isCancelledNetworkError(error) {
                debugLog("Remote event refresh failed")
            }
        }
    }

    @MainActor
    func registerForMainEvent() async -> String? {
        if Self.shouldUseAppwrite {
            guard let user = currentUser else { return L10n.tr("events.error.loginRequired") }
            guard let appwriteService else { return eventRequestErrorMessage() }
            guard let gender = user.gender else { return L10n.tr("events.error.genderRequired") }
            guard gender == .male || gender == .female else { return L10n.tr("events.error.genderUnsupported") }
            guard user.orientation == .straight else { return L10n.tr("events.error.orientationUnsupported") }
            guard let eventId = remoteMainEventState?.eventId else { return eventRequestErrorMessage() }
            let hadRegistrationBeforeRequest = hasCurrentUserMainEventRegistration
            let operationEpoch = sessionEpoch
            let operationIdentity = sessionIdentity(for: user)

            do {
                // Capacity, waitlist, and gender-balance rules live in the server-side function now.
                let status = try await appwriteService.registerForMainEvent(
                    for: user,
                    eventId: eventId
                )
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return eventRequestErrorMessage()
                }
                await refreshRemoteMainEventStateWithRetry()

                let resolvedStatus = remoteMainEventState?.currentStatus ?? status
                return resolvedStatus == .waitlisted ? L10n.tr("events.success.waitlisted") : nil
            } catch {
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return eventRequestErrorMessage()
                }
                // Functions can time out on cold start even when the mutation eventually succeeds.
                await refreshRemoteMainEventStateWithRetry()

                if !hadRegistrationBeforeRequest,
                   hasCurrentUserMainEventRegistration {
                    return isCurrentUserWaitingForMainEvent ? L10n.tr("events.success.waitlisted") : nil
                }

                return eventErrorMessage(for: error)
            }
        }

        return registerForMainEventLocally()
    }

    @MainActor
    func cancelMainEventRegistration() async -> String? {
        if Self.shouldUseAppwrite {
            guard let user = currentUser else { return L10n.tr("events.error.loginRequired") }
            guard let appwriteService else { return eventRequestErrorMessage() }
            guard let eventId = remoteMainEventState?.eventId else { return eventRequestErrorMessage() }
            let hadRegistrationBeforeRequest = hasCurrentUserMainEventRegistration
            let operationEpoch = sessionEpoch
            let operationIdentity = sessionIdentity(for: user)

            do {
                try await appwriteService.cancelMainEventRegistration(
                    for: user,
                    eventId: eventId
                )
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return eventRequestErrorMessage()
                }
                await refreshRemoteMainEventStateWithRetry()
                return nil
            } catch {
                guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                    return eventRequestErrorMessage()
                }
                // Treat late function responses as success when backend state confirms cancellation.
                await refreshRemoteMainEventStateWithRetry()

                if hadRegistrationBeforeRequest,
                   !hasCurrentUserMainEventRegistration {
                    return nil
                }

                return eventErrorMessage(for: error)
            }
        }

        return cancelMainEventRegistrationLocally()
    }

    @MainActor
    func updateMainEventAsAdmin(_ draft: EventAdminDraft) async -> String? {
        guard Self.shouldUseAppwrite else { return L10n.tr("events.admin.error.forbidden") }
        guard let appwriteService, let eventId = remoteMainEventState?.eventId else {
            return eventRequestErrorMessage()
        }
        let operationEpoch = sessionEpoch
        let operationIdentity = sessionIdentity(for: currentUser)

        do {
            let adminState = try await appwriteService.updateMainEventAsAdmin(eventId: eventId, draft: draft)
            guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                return eventRequestErrorMessage()
            }
            if let remoteState = remoteMainEventState {
                remoteMainEventState = MainEventRemoteState(
                    eventId: remoteState.eventId,
                    snapshot: MainEventSnapshot(
                        date: adminState.startsAt,
                        title: adminState.title,
                        place: remoteState.snapshot.place,
                        eventDescription: remoteState.snapshot.eventDescription,
                        rules: remoteState.snapshot.rules,
                        maxParticipants: adminState.maxParticipants,
                        maleLimit: adminState.maleLimit,
                        femaleLimit: adminState.femaleLimit,
                        maleCount: remoteState.snapshot.maleCount,
                        femaleCount: remoteState.snapshot.femaleCount,
                        waitingListCount: remoteState.snapshot.waitingListCount,
                        registrationClosesAt: adminState.registrationClosesAt,
                        cancellationClosesAt: adminState.cancellationClosesAt
                    ),
                    currentStatus: remoteState.currentStatus,
                    history: remoteState.history,
                    adminState: adminState
                )
            }
            await refreshRemoteMainEventStateWithRetry()
            return nil
        } catch {
            guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                return eventRequestErrorMessage()
            }
            return eventErrorMessage(for: error)
        }
    }

    @MainActor
    func addMainEventParticipantAsAdmin(lookup: String, status: EventHistoryStatus) async -> String? {
        guard Self.shouldUseAppwrite else { return L10n.tr("events.admin.error.forbidden") }
        guard let appwriteService, let eventId = remoteMainEventState?.eventId else {
            return eventRequestErrorMessage()
        }
        let operationEpoch = sessionEpoch
        let operationIdentity = sessionIdentity(for: currentUser)

        do {
            _ = try await appwriteService.addEventParticipantAsAdmin(eventId: eventId, lookup: lookup, status: status)
            guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                return eventRequestErrorMessage()
            }
            await refreshRemoteMainEventStateWithRetry()
            return nil
        } catch {
            guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                return eventRequestErrorMessage()
            }
            return eventErrorMessage(for: error)
        }
    }

    @MainActor
    func removeMainEventParticipantAsAdmin(registrationId: String) async -> String? {
        guard Self.shouldUseAppwrite else { return L10n.tr("events.admin.error.forbidden") }
        guard let appwriteService, let eventId = remoteMainEventState?.eventId else {
            return eventRequestErrorMessage()
        }
        let operationEpoch = sessionEpoch
        let operationIdentity = sessionIdentity(for: currentUser)

        do {
            _ = try await appwriteService.removeEventParticipantAsAdmin(eventId: eventId, registrationId: registrationId)
            guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                return eventRequestErrorMessage()
            }
            await refreshRemoteMainEventStateWithRetry()
            return nil
        } catch {
            guard isCurrentSession(epoch: operationEpoch, identity: operationIdentity) else {
                return eventRequestErrorMessage()
            }
            return eventErrorMessage(for: error)
        }
    }

    @MainActor
    private func refreshRemoteMainEventStateWithRetry() async {
        let refreshEpoch = sessionEpoch
        let refreshIdentity = sessionIdentity(for: currentUser)
        await refreshRemoteMainEventState()

        // Appwrite table updates may become visible a moment after function completion.
        do {
            try await Task.sleep(nanoseconds: 350_000_000)
        } catch {
            return
        }
        guard isCurrentSession(epoch: refreshEpoch, identity: refreshIdentity) else { return }
        await refreshRemoteMainEventState()
    }

    private func registerForMainEventLocally() -> String? {
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

    private func cancelMainEventRegistrationLocally() -> String? {
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

    nonisolated static func age(from birthDate: Date) -> Int {
        Calendar.current.dateComponents([.year], from: birthDate, to: Date()).year ?? 0
    }

    nonisolated static var defaultPreferredGenders: [UserGender] { UserGender.allCases }

    @MainActor
    private static func resolvedCity(for city: String) async throws -> (displayName: String, latitude: Double, longitude: Double) {
#if DEBUG
        if isRunningTests {
            return (city, 0, 0)
        }
#endif

        let placemarks = try await CLGeocoder().geocodeAddressString(city)
        guard let placemark = placemarks.first,
              let coordinate = placemark.location?.coordinate else {
            throw CLError(.geocodeFoundNoResult)
        }

        return (
            normalizedCityName(from: placemark, fallback: city),
            coordinate.latitude,
            coordinate.longitude
        )
    }

    private static func normalizedCityName(from placemark: CLPlacemark, fallback: String) -> String {
        let primaryName = [
            placemark.locality,
            placemark.subAdministrativeArea,
            placemark.administrativeArea,
            placemark.name
        ]
        .lazy
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .first(where: { !$0.isEmpty })

        let country = placemark.country?.trimmingCharacters(in: .whitespacesAndNewlines)
        let components = [primaryName, country]
            .compactMap { $0 }
            .filter { !$0.isEmpty }

        if !components.isEmpty {
            return Array(NSOrderedSet(array: components)).compactMap { $0 as? String }.joined(separator: ", ")
        }

        return fallback.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Persistence helpers

    private func normalizeEmail(_ email: String) -> String {
        email.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    @MainActor
    func restoreRemoteSessionIfNeeded() async {
        if isSessionBootstrapComplete {
            return
        }

        if let sessionBootstrapTask {
            await sessionBootstrapTask.value
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.performRemoteSessionRestore()
            self.isSessionBootstrapComplete = true
            self.sessionBootstrapTask = nil
        }
        sessionBootstrapTask = task
        await task.value
    }

    @MainActor
    private func performRemoteSessionRestore() async {
        guard Self.shouldUseAppwrite else { return }
        guard let appwriteService else {
            currentUser = nil
            remoteMainEventState = nil
            if appwriteInitializationError != nil {
                debugLog("Appwrite initialization failed")
            }
            return
        }

        await acquireAuthenticationOperation()
        defer { releaseAuthenticationOperation() }
        advanceSessionEpoch()
        currentUser = nil
        remoteMainEventState = nil

        if hasPendingLogout() {
            _ = await finishPendingLogout(using: appwriteService)
            return
        }

        let restoreEpoch = sessionEpoch
        do {
            let restoredUser = try await appwriteService.restoreCurrentUser()
            guard sessionEpoch == restoreEpoch else { return }
            currentUser = restoredUser
            await refreshRemoteMainEventState()
        } catch let error as AppwriteServiceError where error.isUnauthorized {
            currentUser = nil
            remoteMainEventState = nil
        } catch {
            // Authentication is not established until /account succeeds. A
            // cached profile must never bootstrap an offline authenticated UI.
            currentUser = nil
            remoteMainEventState = nil
        }
    }

    static func loadCurrentUser() -> User? {
        do {
            if let secureData = try SecurePersistenceStore.data(forKey: SecurePersistenceKey.currentUser) {
                do {
                    let user = try JSONDecoder().decode(User.self, from: secureData)
                    guard isValidEmail(user.email) else {
                        throw DecodingError.dataCorrupted(
                            .init(codingPath: [], debugDescription: "Invalid current-user email")
                        )
                    }
                    return user
                } catch {
                    try? SecurePersistenceStore.removeData(forKey: SecurePersistenceKey.currentUser)
                    return nil
                }
            }
        } catch {
            return nil
        }

        return nil
    }

    private static func saveCurrentUser(_ user: User?) {
        guard let user else {
            try? SecurePersistenceStore.removeData(forKey: SecurePersistenceKey.currentUser)
            return
        }

        do {
            try SecurePersistenceStore.setData(
                try JSONEncoder().encode(user),
                forKey: SecurePersistenceKey.currentUser
            )
        } catch {
            try? SecurePersistenceStore.removeData(forKey: SecurePersistenceKey.currentUser)
#if DEBUG
            debugPrint("Failed to persist the current user securely")
#endif
        }
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
            // Corrupt cached state should not brick the app on launch; drop it and rebuild from network/defaults.
            UserDefaults.standard.removeObject(forKey: key)
#if DEBUG
            debugPrint("Dropped invalid persisted value")
#endif
            return nil
        }
    }

    private static func savePersistedValue<Value: Encodable>(_ value: Value, forKey key: String) {
        do {
            let data = try JSONEncoder().encode(value)
            UserDefaults.standard.set(data, forKey: key)
        } catch {
            // Persistence failures are recoverable; keep the in-memory state and avoid crashing user sessions.
#if DEBUG
            debugPrint("Failed to encode persisted value")
#endif
        }
    }

    static func resetPersistedState() {
        let defaults = UserDefaults.standard
        defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix("fyre_") }
            .forEach { defaults.removeObject(forKey: $0) }
        try? SecurePersistenceStore.removeAllData()
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
        sessionBootstrapTask?.cancel()
        sessionBootstrapTask = nil
        isSessionBootstrapComplete = false
        advanceSessionEpoch()
        logoutPendingInMemory = false
        ephemeralLocalAccounts.removeAll(keepingCapacity: false)
        currentUser = nil
        mainEventState = MainEventState()
        remoteMainEventState = nil
    }

    private static var shouldUseAppwrite: Bool {
        if isRunningTests {
            return false
        }
#if DEBUG
        return !ProcessInfo.processInfo.arguments.contains("-uitest-reset")
#else
        return true
#endif
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
        if appwriteInitializationError != nil {
            debugLog("Appwrite configuration error")
        }
        return L10n.tr("error.auth.requestFailed")
    }

    @MainActor
    private func profileErrorMessage(for error: Error) -> String {
        switch error {
        case let serviceError as AppwriteServiceError:
            if serviceError.isUnauthorized {
                advanceSessionEpoch()
                currentUser = nil
                remoteMainEventState = nil
                return L10n.tr("profile.error.noCurrentUser")
            }
            debugLog("Appwrite profile save failed")
            return L10n.tr("profile.error.saveFailed")
        default:
            debugLog("Profile save failed")
            return L10n.tr("profile.error.saveFailed")
        }
    }

    @MainActor
    private func eventErrorMessage(for error: Error) -> String {
        switch error {
        case let serviceError as AppwriteServiceError:
            if serviceError.isUnauthorized {
                advanceSessionEpoch()
                currentUser = nil
                remoteMainEventState = nil
                return L10n.tr("events.error.loginRequired")
            }

            if case let .api(_, message, _) = serviceError,
               let message {
                if message.hasPrefix("events.") {
                    return L10n.tr(message)
                }
                debugLog("Appwrite event request failed")
            } else {
                debugLog("Appwrite event request failed")
            }

            return eventRequestErrorMessage()
        default:
            debugLog("Event request failed")
            return eventRequestErrorMessage()
        }
    }

    @MainActor
    private func eventRequestErrorMessage() -> String {
        L10n.tr("events.error.requestFailed")
    }

    private func isCancelledNetworkError(_ error: Error) -> Bool {
        if let urlError = error as? URLError {
            return urlError.code == .cancelled
        }

        if let serviceError = error as? AppwriteServiceError,
           case let .network(innerError) = serviceError,
           let urlError = innerError as? URLError {
            return urlError.code == .cancelled
        }

        let nsError = error as NSError
        return nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
    }

    private func debugLog(_ message: String) {
#if DEBUG
        debugPrint(message)
#endif
    }
}
