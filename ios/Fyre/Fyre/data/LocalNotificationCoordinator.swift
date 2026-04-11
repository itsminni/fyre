//
//  LocalNotificationCoordinator.swift
//  Fyre
//
//  Created by Gabriele Mininni on 04/04/26.
//

import Foundation
import UserNotifications

@MainActor
final class LocalNotificationCoordinator: NSObject {
    private enum DefaultsKey {
        static let notificationsEnabled = "settings_notifications_enabled"
        static let matchNotificationsEnabled = "settings_notifications_matches"
        static let messageNotificationsEnabled = "settings_notifications_messages"
        static let eventReminderNotificationsEnabled = "settings_notifications_event_reminders"
        static let permissionRequested = "notifications_permission_requested"
        static let seenMatchIdsPrefix = "notifications_seen_match_ids"
        static let seenMessageIdsPrefix = "notifications_seen_message_ids"
    }

    private enum IdentifierPrefix {
        static let eventReminder = "event-reminder:"
        static let match = "match:"
        static let message = "message:"
    }

    static let shared = LocalNotificationCoordinator()

    private let notificationCenter = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard
    private var realtimeSubscription: AppwriteRealtimeSubscription?
    private var currentUserId: String?
    private var knownThreadIds = Set<String>()
    private var appwriteService: AppwriteService?

    private override init() {
        super.init()
        notificationCenter.delegate = self
    }

    func refresh(currentUserId: String?, upcomingEvents: [EventHistoryItem]) async {
        notificationCenter.delegate = self

        if self.currentUserId != currentUserId {
            stopRealtime()
            knownThreadIds.removeAll()
            self.currentUserId = currentUserId
        }

        if notificationsEnabled {
            await requestAuthorizationIfNeeded()
        }

        if let currentUserId, realtimeNotificationsEnabled {
            await ensureRealtimeStarted(for: currentUserId)
        } else {
            stopRealtime()
        }

        await syncEventReminders(upcomingEvents)
    }

    private var notificationsEnabled: Bool {
        defaults.object(forKey: DefaultsKey.notificationsEnabled) as? Bool ?? true
    }

    private var matchNotificationsEnabled: Bool {
        notificationsEnabled && (defaults.object(forKey: DefaultsKey.matchNotificationsEnabled) as? Bool ?? true)
    }

    private var messageNotificationsEnabled: Bool {
        notificationsEnabled && (defaults.object(forKey: DefaultsKey.messageNotificationsEnabled) as? Bool ?? true)
    }

    private var eventReminderNotificationsEnabled: Bool {
        notificationsEnabled && (defaults.object(forKey: DefaultsKey.eventReminderNotificationsEnabled) as? Bool ?? true)
    }

    private var realtimeNotificationsEnabled: Bool {
        matchNotificationsEnabled || messageNotificationsEnabled
    }

    private func ensureRealtimeStarted(for currentUserId: String) async {
        if realtimeSubscription == nil {
            await refreshKnownThreadIds()

            realtimeSubscription = AppwriteRealtimeService.makeNotificationSubscription(
                onEvent: { [weak self] event in
                    guard let self else { return }
                    Task { @MainActor in
                        await self.handleRealtimeEvent(event, currentUserId: currentUserId)
                    }
                }
            )
            return
        }

        if messageNotificationsEnabled && knownThreadIds.isEmpty {
            await refreshKnownThreadIds()
        }
    }

    private func stopRealtime() {
        realtimeSubscription?.cancel()
        realtimeSubscription = nil
    }

    private func handleRealtimeEvent(_ event: AppwriteRealtimeEvent, currentUserId: String) async {
        if isThreadParticipantEvent(event) {
            handleThreadParticipantEvent(event, currentUserId: currentUserId)
            return
        }

        if isMatchEvent(event) {
            await handleMatchEvent(event, currentUserId: currentUserId)
            return
        }

        if isMessageEvent(event) {
            await handleMessageEvent(event, currentUserId: currentUserId)
        }
    }

    private func handleThreadParticipantEvent(_ event: AppwriteRealtimeEvent, currentUserId: String) {
        guard event.stringValue(forKey: "userId") == currentUserId,
              let threadId = event.stringValue(forKey: "threadId")
        else {
            return
        }

        if event.isDelete {
            knownThreadIds.remove(threadId)
        } else {
            knownThreadIds.insert(threadId)
        }
    }

    private func handleMatchEvent(_ event: AppwriteRealtimeEvent, currentUserId: String) async {
        guard matchNotificationsEnabled else { return }

        let userAId = event.stringValue(forKey: "userAId")
        let userBId = event.stringValue(forKey: "userBId")
        guard userAId == currentUserId || userBId == currentUserId else { return }

        let rawIdentifier = event.stringValue(forKey: "$id")
            ?? event.stringValue(forKey: "matchKey")
            ?? event.stringValue(forKey: "threadId")
        guard let rawIdentifier,
              markSeenRealtimeIdentifier(rawIdentifier, kind: .match, userId: currentUserId)
        else {
            return
        }

        var body = L10n.tr("notifications.match.body.generic")
        if let threadId = event.stringValue(forKey: "threadId"),
           let threadName = await resolvedThreadName(threadId: threadId),
           !threadName.isEmpty {
            body = String(format: L10n.tr("notifications.match.body.named"), threadName)
        }

        await scheduleImmediateNotification(
            identifier: IdentifierPrefix.match + rawIdentifier,
            title: L10n.tr("notifications.match.title"),
            body: body
        )
    }

    private func handleMessageEvent(_ event: AppwriteRealtimeEvent, currentUserId: String) async {
        guard messageNotificationsEnabled else { return }

        let senderUserId = event.stringValue(forKey: "senderUserId")
        guard senderUserId != nil, senderUserId != currentUserId else { return }
        guard let threadId = event.stringValue(forKey: "threadId") else { return }

        if !knownThreadIds.contains(threadId) {
            await refreshKnownThreadIds()
        }

        guard knownThreadIds.contains(threadId) else { return }

        let rawIdentifier = event.stringValue(forKey: "$id")
            ?? event.stringValue(forKey: "messageId")
            ?? "\(threadId):\(event.dateValue(forKey: "createdAt")?.timeIntervalSince1970 ?? Date().timeIntervalSince1970)"
        guard markSeenRealtimeIdentifier(rawIdentifier, kind: .message, userId: currentUserId) else {
            return
        }

        let threadName = await resolvedThreadName(threadId: threadId) ?? L10n.tr("messages.navigationTitle")
        let messageText = event.stringValue(forKey: "text") ?? ""
        let body: String
        if messageText.isEmpty {
            body = String(format: L10n.tr("notifications.message.body.generic"), threadName)
        } else {
            body = String(format: L10n.tr("notifications.message.body.text"), threadName, messageText)
        }

        await scheduleImmediateNotification(
            identifier: IdentifierPrefix.message + rawIdentifier,
            title: L10n.tr("notifications.message.title"),
            body: body
        )
    }

    private func refreshKnownThreadIds() async {
        guard let service = ensureAppwriteService() else {
            knownThreadIds = []
            return
        }

        do {
            let threads = try await service.fetchThreads()
            knownThreadIds = Set(threads.map(\.remoteId))
        } catch {
            knownThreadIds = []
        }
    }

    private func resolvedThreadName(threadId: String) async -> String? {
        guard let service = ensureAppwriteService() else { return nil }

        guard let thread = try? await service.fetchThreadDTO(threadId: threadId) else {
            return nil
        }

        return ThreadNaming.isPlaceholderThreadName(thread.name) ? nil : thread.name
    }

    private func ensureAppwriteService() -> AppwriteService? {
        if let appwriteService {
            return appwriteService
        }

        guard let configuration = try? AppwriteConfiguration.load() else {
            return nil
        }

        let service = AppwriteService(configuration: configuration)
        appwriteService = service
        return service
    }

    private func syncEventReminders(_ events: [EventHistoryItem]) async {
        await clearEventReminderNotifications()

        guard eventReminderNotificationsEnabled else { return }

        let eligibleStatuses: Set<EventHistoryStatus> = [.confirmed, .promoted]
        let now = Date()
        for item in events where eligibleStatuses.contains(item.status) {
            let reminderDate = item.eventDate.addingTimeInterval(-24 * 60 * 60)
            let interval = reminderDate.timeIntervalSince(now)
            guard interval > 60 else { continue }

            let content = UNMutableNotificationContent()
            content.title = L10n.tr("notifications.eventReminder.title")
            content.body = String(
                format: L10n.tr("notifications.eventReminder.body"),
                item.eventTitle,
                Self.eventDateFormatter.string(from: item.eventDate)
            )
            content.sound = .default

            let request = UNNotificationRequest(
                identifier: IdentifierPrefix.eventReminder + item.id.uuidString,
                content: content,
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            )
            try? await addNotificationRequest(request)
        }
    }

    private func scheduleImmediateNotification(identifier: String, title: String, body: String) async {
        guard notificationsEnabled else { return }
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        )
        try? await addNotificationRequest(request)
    }

    private func clearEventReminderNotifications() async {
        let pending = await pendingRequests()
            .filter { $0.identifier.hasPrefix(IdentifierPrefix.eventReminder) }
            .map(\.identifier)
        if !pending.isEmpty {
            notificationCenter.removePendingNotificationRequests(withIdentifiers: pending)
        }

        let delivered = await deliveredNotifications()
            .filter { $0.request.identifier.hasPrefix(IdentifierPrefix.eventReminder) }
            .map { $0.request.identifier }
        if !delivered.isEmpty {
            notificationCenter.removeDeliveredNotifications(withIdentifiers: delivered)
        }
    }

    private func requestAuthorizationIfNeeded() async {
        let settings = await notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return
        case .notDetermined:
            guard !defaults.bool(forKey: DefaultsKey.permissionRequested) else { return }
            defaults.set(true, forKey: DefaultsKey.permissionRequested)
            _ = try? await requestAuthorization(options: [.alert, .badge, .sound])
        case .denied:
            return
        @unknown default:
            return
        }
    }

    private enum RealtimeEventKind {
        case match
        case message
    }

    private func markSeenRealtimeIdentifier(_ identifier: String, kind: RealtimeEventKind, userId: String) -> Bool {
        let key = scopedDefaultsKey(for: kind, userId: userId)
        var identifiers = defaults.stringArray(forKey: key) ?? []
        if identifiers.contains(identifier) {
            return false
        }

        identifiers.append(identifier)
        if identifiers.count > 80 {
            identifiers.removeFirst(identifiers.count - 80)
        }
        defaults.set(identifiers, forKey: key)
        return true
    }

    private func scopedDefaultsKey(for kind: RealtimeEventKind, userId: String) -> String {
        switch kind {
        case .match:
            return "\(DefaultsKey.seenMatchIdsPrefix).\(userId)"
        case .message:
            return "\(DefaultsKey.seenMessageIdsPrefix).\(userId)"
        }
    }

    private func isMatchEvent(_ event: AppwriteRealtimeEvent) -> Bool {
        event.stringValue(forKey: "matchKey") != nil
            || (event.stringValue(forKey: "userAId") != nil && event.stringValue(forKey: "userBId") != nil)
    }

    private func isMessageEvent(_ event: AppwriteRealtimeEvent) -> Bool {
        event.stringValue(forKey: "senderUserId") != nil
    }

    private func isThreadParticipantEvent(_ event: AppwriteRealtimeEvent) -> Bool {
        guard event.stringValue(forKey: "threadId") != nil,
              event.stringValue(forKey: "userId") != nil
        else {
            return false
        }

        return event.stringValue(forKey: "role") != nil
            || event.payload["muted"] != nil
            || event.payload["pinned"] != nil
            || event.payload["notificationsEnabled"] != nil
            || event.payload["lastReadAt"] != nil
    }

    private static let eventDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}

extension LocalNotificationCoordinator: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}

private extension LocalNotificationCoordinator {
    func notificationSettings() async -> UNNotificationSettings {
        await withCheckedContinuation { continuation in
            notificationCenter.getNotificationSettings { settings in
                continuation.resume(returning: settings)
            }
        }
    }

    func requestAuthorization(options: UNAuthorizationOptions) async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            notificationCenter.requestAuthorization(options: options) { granted, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: granted)
                }
            }
        }
    }

    func addNotificationRequest(_ request: UNNotificationRequest) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            notificationCenter.add(request) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }

    func pendingRequests() async -> [UNNotificationRequest] {
        await withCheckedContinuation { continuation in
            notificationCenter.getPendingNotificationRequests { requests in
                continuation.resume(returning: requests)
            }
        }
    }

    func deliveredNotifications() async -> [UNNotification] {
        await withCheckedContinuation { continuation in
            notificationCenter.getDeliveredNotifications { notifications in
                continuation.resume(returning: notifications)
            }
        }
    }
}
