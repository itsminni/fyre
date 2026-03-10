//
//  AccountView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

struct AccountView: View {
    @Environment(UserStore.self) private var store
    @AppStorage("settings_theme_mode") private var themeMode = "system"
    @AppStorage("settings_notifications_enabled") private var notificationsEnabled = true
    @AppStorage("settings_show_age") private var showAge = true
    @AppStorage("settings_show_distance") private var showDistance = true

    var body: some View {
        NavigationStack {
            Form {
                Section("Profilo") {
                    Text(store.currentUser?.name ?? "-")
                    Text(store.currentUser?.email ?? "-")
                        .foregroundStyle(.secondary)
                }

                Section("Impostazioni") {
                    Picker("Tema", selection: $themeMode) {
                        Text("Sistema").tag("system")
                        Text("Chiaro").tag("light")
                        Text("Scuro").tag("dark")
                    }
                    Toggle("Notifiche", isOn: $notificationsEnabled)
                    Toggle("Mostra età", isOn: $showAge)
                    Toggle("Mostra distanza", isOn: $showDistance)
                }

                Section {
                    Button("Disconnettiti", role: .destructive) {
                        store.logOut()
                    }
                }
            }
            .navigationTitle("Account")
        }
    }
}
