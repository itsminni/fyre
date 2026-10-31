//
//  FyreApp.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI
import UIKit

@main
struct FyreApp: App {
    @UIApplicationDelegateAdaptor(FyreAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("settings_theme_mode") private var themeMode = "system"
    @AppStorage("settings_notifications_enabled") private var notificationsEnabled = true
    @AppStorage("settings_notifications_matches") private var matchNotificationsEnabled = true
    @AppStorage("settings_notifications_messages") private var messageNotificationsEnabled = true
    @AppStorage("settings_notifications_event_reminders") private var eventReminderNotificationsEnabled = true
    @State private var store = UserStore.shared
    @StateObject private var router = AppRouter()
    @State private var services = AppServices.shared
    @State private var notificationCoordinator = LocalNotificationCoordinator.shared
    @State private var pushNotificationCoordinator = PushNotificationCoordinator.shared
    @State private var offlineDemoRevision = 0
    @State private var presenceHeartbeatTask: Task<Void, Never>?

    init() {
        if ProcessInfo.processInfo.arguments.contains("-uitest-reset") {
            UserStore.resetPersistedState()
        }
    }

    var body: some Scene {
        WindowGroup {
            Group {
#if DEBUG
                if ChatHistoryPreview.isEnabled {
                    NavigationStack {
                        ChatDetailView(thread: ChatHistoryPreview.thread)
                            .environment(\.dynamicTypeSize, ProcessInfo.processInfo.arguments.contains("-uitest-accessibility") ? .accessibility5 : .large)
                    }
                    .environment(ChatHistoryPreview.services)
                } else {
                    ContentView()
                }
#else
                ContentView()
#endif
            }
                .id(offlineDemoRevision)
                .safeAreaInset(edge: .top, spacing: 0) {
                    if OfflineDemoMode.isEnabled {
                        HStack {
                            Text(L10n.tr("demo.offline.banner")).font(.caption)
                            Spacer()
                            Button(L10n.tr("demo.offline.reset")) { Task { await store.resetOfflineDemo(); offlineDemoRevision += 1 } }
                                .accessibilityIdentifier("demo.reset")
                        }.padding(10).background(.regularMaterial)
                    }
                }
                .preferredColorScheme(preferredColorScheme)
                .environment(store)
                .environmentObject(router)
                .environment(services)
                .task(id: "\(pushUserId ?? "guest"):\(scenePhase == .active):\(store.sessionRevision)") {
                    guard !OfflineDemoMode.isEnabled else { return }
                    SharedRealtimeHub.shared.configure(accountId: pushUserId, isActive: scenePhase == .active, sessionRevision: store.sessionRevision)
                }
                .task(id: scenePhase) {
                    handleScenePhaseChange(scenePhase)
                }
                .task(id: notificationsRefreshKey) {
#if DEBUG
                    guard !ChatHistoryPreview.isEnabled else { return }
#endif
                    guard !OfflineDemoMode.isEnabled else { return }
                    await notificationCoordinator.refresh(
                        currentUserId: store.currentUser?.appwriteUserId,
                        upcomingEvents: store.currentUserUpcomingEventHistory
                    )
                }
                .task(id: pushRefreshKey) {
                    guard !OfflineDemoMode.isEnabled else { return }
                    await pushNotificationCoordinator.sync(
                        currentUserId: pushUserId,
                        enabled: notificationsEnabled
                    )
                }
        }
    }

    private var preferredColorScheme: ColorScheme? {
        switch themeMode {
        case "light":
            return .light
        case "dark":
            return .dark
        default:
            return nil
        }
    }

    private func handleScenePhaseChange(_ phase: ScenePhase) {
        guard !OfflineDemoMode.isEnabled else { return }
#if DEBUG
        guard !ChatHistoryPreview.isEnabled else { return }
#endif
        presenceHeartbeatTask?.cancel()

        switch phase {
        case .active:
            UIApplication.shared.registerForRemoteNotifications()
            presenceHeartbeatTask = Task {
                await pushNotificationCoordinator.sync(
                    currentUserId: pushUserId,
                    enabled: notificationsEnabled
                )
                while !Task.isCancelled {
                    await services.backend.markCurrentUserPresence(isOnline: true)
                    try? await Task.sleep(nanoseconds: 25_000_000_000)
                }
            }
        case .inactive, .background:
            Task {
                await services.backend.markCurrentUserPresence(isOnline: false)
            }
        @unknown default:
            break
        }
    }

    private var notificationsRefreshKey: String {
        let eventSignature = store.currentUserUpcomingEventHistory
            .map { item in
                "\(item.id.uuidString):\(item.status.rawValue):\(item.eventDate.timeIntervalSince1970)"
            }
            .joined(separator: "|")

        return [
            store.currentUser?.appwriteUserId ?? "guest",
            notificationsEnabled.description,
            matchNotificationsEnabled.description,
            messageNotificationsEnabled.description,
            eventReminderNotificationsEnabled.description,
            eventSignature
        ].joined(separator: "|")
    }

    private var pushUserId: String? {
        guard store.isSessionBootstrapComplete, store.sessionBootstrapFailure == nil else { return nil }
        return store.currentUser?.appwriteUserId
    }

    private var pushRefreshKey: String {
        "\(pushUserId ?? "guest"):\(notificationsEnabled)"
    }
}

final class FyreAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        _ = launchOptions
        _ = LocalNotificationCoordinator.shared
        if !OfflineDemoMode.isEnabled { application.registerForRemoteNotifications() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        _ = application
        Task { @MainActor in
            PushNotificationCoordinator.shared.updateDeviceToken(deviceToken)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        _ = application
        Task { @MainActor in
            PushNotificationCoordinator.shared.recordRegistrationFailure(error)
        }
    }
}
