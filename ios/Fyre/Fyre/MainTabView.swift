//
//  MainTabView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

private enum MainTab: Hashable {
    case home
    case messages
    case events
    case account
}

struct MainTabView: View {
    @State private var selectedTab: MainTab = .home
    @State private var threadToOpen: ChatThread?

    var body: some View {
        TabView(selection: $selectedTab) {
            SwipeHomeView(onMatchedThread: openMatchedThread)
                .tabItem {
                    Label(L10n.tr("tab.home"), systemImage: "flame.fill")
                }
                .tag(MainTab.home)

            MessagesView(openThread: $threadToOpen)
                .tabItem {
                    Label(L10n.tr("tab.messages"), systemImage: "message.fill")
                }
                .tag(MainTab.messages)

            EventsView()
                .tabItem {
                    Label(L10n.tr("tab.events"), systemImage: "calendar.badge.plus")
                }
                .tag(MainTab.events)

            AccountView()
                .tabItem {
                    Label(L10n.tr("tab.account"), systemImage: "person.crop.circle")
                }
                .tag(MainTab.account)
        }
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        .tint(.orange)
    }

    private func openMatchedThread(_ thread: ChatThread) {
        RecentChatThreadStore.upsert(thread)
        threadToOpen = thread
        selectedTab = .messages
    }
}
