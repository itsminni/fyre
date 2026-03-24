//
//  FyreApp.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

@main
struct FyreApp: App {
    @AppStorage("settings_theme_mode") private var themeMode = "system"
    @State private var store = UserStore.shared
    @StateObject private var router = AppRouter()
    @State private var services = AppServices.shared

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
}
