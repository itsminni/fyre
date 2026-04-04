//
//  FyreApp.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

@main
struct FyreApp: App {
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
    @State private var presenceHeartbeatTask: Task<Void, Never>?

    init() {
        if ProcessInfo.processInfo.arguments.contains("-uitest-reset") {
            UserStore.resetPersistedState()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(preferredColorScheme)
                .environment(store)
                .environmentObject(router)
                .environment(services)
                .task(id: scenePhase) {
                    handleScenePhaseChange(scenePhase)
                }
                .task(id: notificationsRefreshKey) {
                    await notificationCoordinator.refresh(
                        currentUserId: store.currentUser?.appwriteUserId,
                        upcomingEvents: store.currentUserUpcomingEventHistory
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
        presenceHeartbeatTask?.cancel()

        switch phase {
        case .active:
            presenceHeartbeatTask = Task {
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
}
