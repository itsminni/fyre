import Foundation

protocol UserAccountService: Sendable {
    func signUp(email: String, password: String) async throws -> User
    func logIn(email: String, password: String) async throws -> User
    func logOut() async throws
    func restoreCurrentUser() async throws -> User?
    func updateProfile(for user: User, control: UploadControl?) async throws -> User
    func updateProfileImage(_ imageData: Data?, for user: User, control: UploadControl?) async throws -> User
    func updateProfileImages(_ imageDataItems: [Data], for user: User, control: UploadControl?) async throws -> User
    func fetchUserEventHistory(for user: User?) async throws -> [EventHistoryItem]
    func fetchMainEventState(for user: User?, selectedEventId: String?) async throws -> MainEventRemoteState?
    func registerForMainEvent(for user: User, eventId: String?) async throws -> EventHistoryStatus
    func cancelMainEventRegistration(for user: User, eventId: String?) async throws
    func updateMainEventAsAdmin(eventId: String, draft: EventAdminDraft) async throws -> EventAdminState
    func addEventParticipantAsAdmin(eventId: String, lookup: String, status: EventHistoryStatus) async throws -> EventAdminState
    func removeEventParticipantAsAdmin(eventId: String, registrationId: String) async throws -> EventAdminState
}

extension UserAccountService {
    func updateProfile(for user: User) async throws -> User { try await updateProfile(for: user, control: nil) }
    func updateProfileImage(_ image: Data?, for user: User) async throws -> User { try await updateProfileImage(image, for: user, control: nil) }
    func updateProfileImages(_ images: [Data], for user: User) async throws -> User { try await updateProfileImages(images, for: user, control: nil) }
}

extension AppwriteService: UserAccountService {}
