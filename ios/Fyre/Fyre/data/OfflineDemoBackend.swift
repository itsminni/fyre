import Foundation

/// Only the dedicated Demo build selects fictional data. Configuration failure never does.
enum OfflineDemoMode {
    static var isEnabled: Bool {
#if FYRE_DEMO
        true
#else
        false
#endif
    }
    static var user: User {
        var user = User(email: "demo@example.invalid")
        user.appwriteUserId = "offline-demo-user"
        user.firstName = "Alex"; user.lastName = "Demo"; user.city = "Modena"
        user.birthDate = Date(timeIntervalSince1970: 946684800)
        user.gender = .male; user.orientation = .straight; user.preferredGenders = UserGender.allCases
        user.latitude = 44.6471; user.longitude = 10.9252
        user.bio = "Profilo dimostrativo: cinema, musica e nuove amicizie."
        user.intent = .friendship; user.interests = "Cinema, Musica, Viaggi"
        return user
    }
}

/// In-memory backend for the real iOS screens; no URLSession, credentials or server fallback.
actor OfflineDemoBackend: BackendAPI, UserAccountService {
    static let shared = OfflineDemoBackend()
    private var user: User?
    private var dismissed: Set<String> = []
    private var profiles: [DiscoverProfileDTO] = []
    private var threads: [String: ThreadDTO] = [:]
    private var histories: [String: [MessageDTO]] = [:]
    private var files: [String: Data] = [:]
    private var events: [String: EventAdminState] = [:]
    private var statuses: [String: EventHistoryStatus] = [:]
    private var historyIds: [String: UUID] = [:]
    private var seeded = false

    func reset() async { seeded = false; await seed() }
    private func seed() async {
        let account = await MainActor.run { OfflineDemoMode.user }
        guard !seeded else { return }
        seeded = true
        user = account
        dismissed = []; threads = [:]; histories = [:]; files = [:]; events = [:]; statuses = [:]; historyIds = [:]
        profiles = ["Sam", "Jules", "Robin"].enumerated().map { index, name in
            DiscoverProfileDTO(id: "demo-\(name.lowercased())", name: name, age: 25 + index, photos: [],
                compatibilityScore: 82, distance: index + 3, commonInterests: ["Cinema", "Musica"],
                bio: "Profilo fittizio della demo offline.", city: "Modena", gender: nil, intent: "friendship",
                instagramTag: nil, spotifyTag: nil, relationshipState: .none)
        }
        _ = createThread(id: "demo-chat", name: "Taylor")
        histories["demo-chat"] = (1...120).map { number in
            let date = Date().addingTimeInterval(-Double(121 - number) * 60)
            return MessageDTO(id: UUID(), remoteId: "demo-history-\(number)",
                text: number == 120 ? "Benvenuto! Puoi scrivere senza configurare Appwrite." : "Messaggio dimostrativo \(number)",
                messageType: .text, attachment: nil, isMe: number % 3 == 0, time: date.formatted(date: .omitted, time: .shortened),
                sentAt: date, replyToRemoteId: nil, replyPreviewText: nil)
        }
        for (index, title) in ["Aperitivo Fyre · Demo", "Cinema insieme · Demo"].enumerated() {
            let id = "demo-event-\(index)"
            let start = Date().addingTimeInterval(Double(index + 3) * 86400)
            events[id] = EventAdminState(eventId: id, title: title, startsAt: start, maxParticipants: 24,
                maleLimit: 12, femaleLimit: 12, registrationClosesAt: start.addingTimeInterval(-86400),
                cancellationClosesAt: start.addingTimeInterval(-86400), participants: [
                    EventAdminParticipant(id: "demo-sam", userId: "demo-sam", displayName: "Sam", email: "sam@example.invalid",
                        gender: .male, status: .confirmed, createdAt: Date())
                ])
            historyIds[id] = UUID()
        }
    }

    func signUp(email: String, password: String) async throws -> User {
        await seed()
        var created = await MainActor.run { OfflineDemoMode.user }
        created.email = email; user = created
        return created
    }
    func logIn(email: String, password: String) async throws -> User {
        await seed(); let account = await MainActor.run { OfflineDemoMode.user }; user = account; return account
    }
    func logOut() async throws { await seed(); user = nil }
    func restoreCurrentUser() async throws -> User? { await seed(); return user }
    func updateProfile(for user: User, control: UploadControl?) async throws -> User {
        try await control?.beginCommit(); self.user = user; return user
    }
    func updateProfileImage(_ imageData: Data?, for user: User, control: UploadControl?) async throws -> User {
        var updated = user; updated.profileImageData = imageData
        return try await updateProfile(for: updated, control: control)
    }
    func updateProfileImages(_ imageDataItems: [Data], for user: User, control: UploadControl?) async throws -> User {
        var updated = user; updated.profilePhotoDataItems = imageDataItems
        return try await updateProfile(for: updated, control: control)
    }
    func fetchDiscoverProfiles() async throws -> [DiscoverProfileDTO] {
        await seed(); return profiles.filter { !dismissed.contains($0.id) }
    }
    func fetchThreads() async throws -> [ThreadDTO] {
        await seed(); return threads.keys.sorted().compactMap { thread(id: $0, summary: true) }
    }
    func fetchThread(threadId: String) async throws -> ThreadDTO? {
        await seed(); return thread(id: threadId, summary: false)
    }
    func fetchMessagePage(threadId: String, before cursor: String) async throws -> MessagePageDTO {
        await seed()
        let all = histories[threadId] ?? []
        guard let end = all.firstIndex(where: { $0.remoteId == cursor }) else { throw URLError(.badURL) }
        let start = max(0, end - 50)
        return MessagePageDTO(messages: Array(all[start..<end]), nextCursor: start > 0 ? all[start].remoteId : nil)
    }
    func createOrGetThread(otherUserId: String) async throws -> ThreadDTO {
        await seed(); return createThread(id: "chat-\(otherUserId)", name: profiles.first { $0.id == otherUserId }?.name ?? "Demo")
    }
    func submitSwipe(otherUserId: String, otherUserName: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO? {
        await seed(); dismissed.insert(otherUserId)
        return decision == .liked ? createThread(id: "chat-\(otherUserId)", name: otherUserName ?? "Demo") : nil
    }
    func sendMessage(threadId: String, attempt: OutgoingMessageAttempt) async throws -> MessageDTO {
        await seed()
        guard threads[threadId] != nil, let owner = user?.appwriteUserId else { throw URLError(.userAuthenticationRequired) }
        let id = OutgoingMessageAttempt.remoteMessageId(userId: owner, threadId: threadId, operationId: attempt.operationId)
        if let prior = histories[threadId]?.first(where: { $0.remoteId == id }) { return prior }
        try await attempt.uploadControl?.beginCommit()
        let attachment = attempt.draft.attachment.map { input in
            files[id] = input.data
            return MessageAttachmentDTO(fileId: id, name: input.fileName, mimeType: input.mimeType, size: input.size,
                width: input.width, height: input.height, duration: input.duration)
        }
        let now = Date()
        let message = MessageDTO(id: UUID(), remoteId: id, text: attempt.draft.text, messageType: attempt.draft.attachment?.type ?? .text,
            attachment: attachment, isMe: true, time: now.formatted(date: .omitted, time: .shortened), sentAt: now,
            replyToRemoteId: attempt.draft.replyToMessageId, replyPreviewText: nil)
        histories[threadId, default: []].append(message)
        return message
    }
    func updateRelationship(threadId: String, action: RelationshipActionDTO) async throws {
        await seed(); threads.removeValue(forKey: threadId); histories.removeValue(forKey: threadId)
    }
    func updateThreadNotifications(threadId: String, enabled: Bool) async throws {
        await seed()
        guard let old = threads[threadId] else { return }
        threads[threadId] = ThreadDTO(id: old.id, remoteId: old.remoteId, name: old.name, avatar: old.avatar,
            isOnline: false, lastSeenAt: nil, currentUserReadAt: Date(), otherParticipantReadAt: nil,
            participantUserIds: old.participantUserIds, notificationsEnabled: enabled, relationshipState: .matched, messages: [])
    }
    func markCurrentUserPresence(isOnline: Bool) async {}
    func markThreadRead(threadId: String) async {}
    func fetchAttachmentData(fileId: String) async throws -> Data? { files[fileId] }

    func fetchUserEventHistory(for user: User?) async throws -> [EventHistoryItem] {
        await seed()
        guard user != nil else { return [] }
        return events.values.compactMap { event in
            statuses[event.eventId].map { EventHistoryItem(id: historyIds[event.eventId] ?? UUID(), eventTitle: event.title,
                eventDate: event.startsAt, status: $0, timestamp: Date(), remoteEventId: event.eventId) }
        }
    }
    func fetchMainEventState(for user: User?, selectedEventId: String?) async throws -> MainEventRemoteState? {
        await seed()
        guard let event = events[selectedEventId ?? "demo-event-0"] else { return nil }
        return MainEventRemoteState(eventId: event.eventId, snapshot: snapshot(event), currentStatus: statuses[event.eventId],
            history: try await fetchUserEventHistory(for: user), adminState: event,
            availableEvents: events.values.sorted { $0.startsAt < $1.startsAt }.map { EventSummary(id: $0.eventId, snapshot: snapshot($0), status: statuses[$0.eventId]) })
    }
    func registerForMainEvent(for user: User, eventId: String?) async throws -> EventHistoryStatus {
        await seed(); let id = eventId ?? "demo-event-0"; statuses[id] = .confirmed
        _ = try await addEventParticipantAsAdmin(eventId: id, lookup: user.email, status: .confirmed)
        return .confirmed
    }
    func cancelMainEventRegistration(for user: User, eventId: String?) async throws {
        await seed(); let id = eventId ?? "demo-event-0"; statuses[id] = .cancelled
        if let event = events[id] {
            events[id] = replacing(event, participants: event.participants.filter { $0.email != user.email })
        }
    }
    func updateMainEventAsAdmin(eventId: String, draft: EventAdminDraft) async throws -> EventAdminState {
        await seed(); guard let old = events[eventId] else { throw URLError(.badURL) }
        let updated = EventAdminState(eventId: eventId, title: draft.title, startsAt: draft.startsAt,
            maxParticipants: draft.maxParticipants, maleLimit: draft.maleLimit, femaleLimit: draft.femaleLimit,
            registrationClosesAt: draft.registrationClosesAt, cancellationClosesAt: draft.cancellationClosesAt, participants: old.participants)
        events[eventId] = updated; return updated
    }
    func addEventParticipantAsAdmin(eventId: String, lookup: String, status: EventHistoryStatus) async throws -> EventAdminState {
        await seed(); guard let old = events[eventId] else { throw URLError(.badURL) }
        let participant = EventAdminParticipant(id: "demo-\(lookup)", userId: "demo-\(lookup)", displayName: lookup.components(separatedBy: "@")[0],
            email: lookup, gender: .male, status: status, createdAt: Date())
        let updated = replacing(old, participants: old.participants.filter { $0.email != lookup } + [participant])
        events[eventId] = updated
        if lookup == user?.email { statuses[eventId] = status }
        return updated
    }
    func removeEventParticipantAsAdmin(eventId: String, registrationId: String) async throws -> EventAdminState {
        await seed(); guard let old = events[eventId] else { throw URLError(.badURL) }
        if old.participants.contains(where: { $0.id == registrationId && $0.email == user?.email }) { statuses[eventId] = .cancelled }
        let updated = replacing(old, participants: old.participants.filter { $0.id != registrationId })
        events[eventId] = updated; return updated
    }
    private func replacing(_ event: EventAdminState, participants: [EventAdminParticipant]) -> EventAdminState {
        EventAdminState(eventId: event.eventId, title: event.title, startsAt: event.startsAt, maxParticipants: event.maxParticipants,
            maleLimit: event.maleLimit, femaleLimit: event.femaleLimit, registrationClosesAt: event.registrationClosesAt,
            cancellationClosesAt: event.cancellationClosesAt, participants: participants)
    }
    private func snapshot(_ event: EventAdminState) -> MainEventSnapshot {
        let active = event.participants.filter { $0.status == .confirmed || $0.status == .promoted }
        return MainEventSnapshot(date: event.startsAt, title: event.title, place: "Modena · luogo dimostrativo",
            eventDescription: "Evento fittizio della demo offline.", rules: ["Dati dimostrativi", "Rispetta gli altri partecipanti"],
            maxParticipants: event.maxParticipants, maleLimit: event.maleLimit, femaleLimit: event.femaleLimit,
            maleCount: active.filter { $0.gender == .male }.count, femaleCount: active.filter { $0.gender == .female }.count,
            waitingListCount: event.participants.filter { $0.status == .waitlisted }.count,
            registrationClosesAt: event.registrationClosesAt, cancellationClosesAt: event.cancellationClosesAt)
    }
    private func createThread(id: String, name: String) -> ThreadDTO {
        if let existing = thread(id: id, summary: false) { return existing }
        let item = ThreadDTO(id: UUID(), remoteId: id, name: name, avatar: "", isOnline: false, lastSeenAt: nil,
            currentUserReadAt: Date(), otherParticipantReadAt: nil, participantUserIds: ["offline-demo-user", id],
            notificationsEnabled: true, relationshipState: .matched, messages: [])
        threads[id] = item; histories[id] = []; return item
    }
    private func thread(id: String, summary: Bool) -> ThreadDTO? {
        guard let item = threads[id] else { return nil }
        let all = histories[id] ?? []
        return ThreadDTO(id: item.id, remoteId: id, name: item.name, avatar: item.avatar, isOnline: false,
            lastSeenAt: nil, currentUserReadAt: item.currentUserReadAt, otherParticipantReadAt: nil,
            participantUserIds: item.participantUserIds, notificationsEnabled: item.notificationsEnabled, relationshipState: .matched,
            messages: Array(all.suffix(summary ? 1 : 50)), olderMessagesCursor: !summary && all.count > 50 ? all[all.count - 50].remoteId : nil,
            remoteUnreadCount: 0)
    }
}
