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
                Section(L10n.tr("account.section.profile")) {
                    Text(store.currentUser?.name ?? "-")
                    Text(store.currentUser?.email ?? "-")
                        .foregroundStyle(.secondary)
                }

                Section(L10n.tr("account.section.settings")) {
                    Picker(L10n.tr("account.theme"), selection: $themeMode) {
                        Text(L10n.tr("account.theme.system")).tag("system")
                        Text(L10n.tr("account.theme.light")).tag("light")
                        Text(L10n.tr("account.theme.dark")).tag("dark")
                    }
                    Toggle(L10n.tr("account.notifications"), isOn: $notificationsEnabled)
                    Toggle(L10n.tr("account.showAge"), isOn: $showAge)
                    Toggle(L10n.tr("account.showDistance"), isOn: $showDistance)
                }

                Section {
                    Button(L10n.tr("auth.logout.action"), role: .destructive) {
                        store.logOut()
                    }
                }
            }
            .navigationTitle(L10n.tr("tab.account"))
        }
    }
}
