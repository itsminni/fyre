//
//  MainTabView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            SwipeHomeView()
                .tabItem {
                    Label(L10n.tr("tab.home"), systemImage: "flame.fill")
                }

            MessagesView()
                .tabItem {
                    Label(L10n.tr("tab.messages"), systemImage: "message.fill")
                }

            AccountView()
                .tabItem {
                    Label(L10n.tr("tab.account"), systemImage: "person.crop.circle")
                }
        }
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        .tint(.orange)
    }
}
