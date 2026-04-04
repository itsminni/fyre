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
    @State private var store = UserStore.shared
    @StateObject private var router = AppRouter()
    @State private var services = AppServices.shared
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
}
