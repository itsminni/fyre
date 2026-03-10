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
                    Label("Home", systemImage: "flame.fill")
                }

            MessagesView()
                .tabItem {
                    Label("Messaggi", systemImage: "message.fill")
                }

            AccountView()
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle")
                }
        }
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        .tint(.orange)
    }
}
