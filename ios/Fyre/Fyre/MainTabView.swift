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
    private struct MatchBanner: Identifiable, Equatable {
        let id: String
        let thread: ChatThread
    }

    @Environment(AppServices.self) private var services
    @Environment(UserStore.self) private var store
    @State private var selectedTab: MainTab = .home
    @State private var threadToOpen: ChatThread?
    @State private var unreadMessageCount = 0
    @State private var unreadMatchThreadIds = Set<String>()
    @State private var matchBanner: MatchBanner?
    @State private var bannerDismissTask: Task<Void, Never>?
    @State private var realtimeSubscription: AppwriteRealtimeSubscription?
    @State private var realtimeBadgeReloadTask: Task<Void, Never>?

    private var messagesBadgeCount: Int {
        unreadMessageCount + unreadMatchThreadIds.count
    }

    var body: some View {
        ZStack(alignment: .top) {
            TabView(selection: $selectedTab) {
                SwipeHomeView(onMatchedThread: handleMatchedThread)
                    .tabItem {
                        Label(L10n.tr("tab.home"), systemImage: "flame.fill")
                    }
                    .tag(MainTab.home)

                MessagesView(
                    openThread: $threadToOpen,
                    onUnreadCountChanged: { unreadMessageCount = $0 }
                )
                .tabItem {
                    Label(L10n.tr("tab.messages"), systemImage: "message.fill")
                }
                .badge(messagesBadgeCount)
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
            .tint(.orange)

            if let matchBanner {
                MatchInAppBanner(thread: matchBanner.thread) {
                    openMessageThread(matchBanner.thread)
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .transition(.move(edge: .top).combined(with: .opacity))
                .zIndex(1)
            }
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.86), value: matchBanner)
        .task {
            await refreshUnreadMessageCount()
        }
        .onAppear {
            startRealtime()
        }
        .onDisappear {
            stopRealtime()
        }
        .onChange(of: selectedTab) { _, newValue in
            guard newValue == .messages else { return }
            unreadMatchThreadIds.removeAll()
            dismissMatchBanner()
        }
        .onReceive(NotificationCenter.default.publisher(for: .fyreThreadsDidChange)) { _ in
            scheduleUnreadBadgeReload()
        }
        .onReceive(NotificationCenter.default.publisher(for: .fyreThreadRemoved)) { notification in
            if let remoteId = notification.object as? String {
                unreadMatchThreadIds.remove(remoteId)
            }
            scheduleUnreadBadgeReload()
        }
    }

    private func handleMatchedThread(_ thread: ChatThread) {
        let alreadyTracked = unreadMatchThreadIds.contains(thread.remoteId)
        RecentChatThreadStore.upsert(thread)
        unreadMatchThreadIds.insert(thread.remoteId)
        if !alreadyTracked {
            showMatchBanner(for: thread)
        }
        scheduleUnreadBadgeReload()
    }

    private func openMessageThread(_ thread: ChatThread) {
        RecentChatThreadStore.upsert(thread)
        unreadMatchThreadIds.remove(thread.remoteId)
        dismissMatchBanner()
        selectedTab = .messages
        Task { @MainActor in
            await Task.yield()
            threadToOpen = thread
        }
    }

    private func showMatchBanner(for thread: ChatThread) {
        bannerDismissTask?.cancel()
        withAnimation {
            matchBanner = MatchBanner(id: thread.remoteId, thread: thread)
        }

        bannerDismissTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation {
                matchBanner = nil
            }
        }
    }

    private func dismissMatchBanner() {
        bannerDismissTask?.cancel()
        bannerDismissTask = nil
        withAnimation {
            matchBanner = nil
        }
    }

    private func startRealtime() {
        guard realtimeSubscription == nil else { return }

        realtimeSubscription = AppwriteRealtimeService.makeInboxSubscription(
            onChange: {
                scheduleUnreadBadgeReload()
            },
            onEvent: { event in
                handleInboxRealtimeEvent(event)
            },
            onError: { error in
#if DEBUG
                debugPrint("Main tab realtime error: \(error.localizedDescription)")
#endif
            }
        )
    }

    private func stopRealtime() {
        realtimeBadgeReloadTask?.cancel()
        realtimeBadgeReloadTask = nil
        realtimeSubscription?.cancel()
        realtimeSubscription = nil
        bannerDismissTask?.cancel()
        bannerDismissTask = nil
    }

    private func scheduleUnreadBadgeReload() {
        realtimeBadgeReloadTask?.cancel()
        realtimeBadgeReloadTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            await refreshUnreadMessageCount()
        }
    }

    private func handleInboxRealtimeEvent(_ event: AppwriteRealtimeEvent) {
        guard let currentUserId = store.currentUser?.appwriteUserId?.trimmingCharacters(in: .whitespacesAndNewlines),
              !currentUserId.isEmpty,
              let threadId = realtimeMatchThreadId(from: event, currentUserId: currentUserId),
              !unreadMatchThreadIds.contains(threadId)
        else {
            return
        }

        Task {
            await openRealtimeMatchedThread(threadId: threadId)
        }
    }

    private func realtimeMatchThreadId(from event: AppwriteRealtimeEvent, currentUserId: String) -> String? {
        if let userId = event.stringValue(forKey: "userId"),
           userId == currentUserId,
           event.isCreate,
           let threadId = event.stringValue(forKey: "threadId") {
            return threadId
        }

        let userAId = event.stringValue(forKey: "userAId")
        let userBId = event.stringValue(forKey: "userBId")
        guard userAId == currentUserId || userBId == currentUserId else {
            return nil
        }

        return event.stringValue(forKey: "threadId")
    }

    @MainActor
    private func openRealtimeMatchedThread(threadId: String) async {
        guard !unreadMatchThreadIds.contains(threadId) else { return }

        do {
            guard let dto = try await services.backend.fetchThread(threadId: threadId) else { return }
            let thread = ChatThread(
                id: dto.id,
                remoteId: dto.remoteId,
                name: dto.name,
                avatar: dto.avatar,
                isOnline: dto.isOnline,
                lastSeenAt: dto.lastSeenAt,
                currentUserReadAt: dto.currentUserReadAt,
                otherParticipantReadAt: dto.otherParticipantReadAt,
                participantUserIds: dto.participantUserIds,
                notificationsEnabled: dto.notificationsEnabled,
                relationshipState: dto.relationshipState,
                messages: dto.messages.map(ChatMessage.init(dto:))
            )
            RecentChatThreadStore.upsert(thread)
            unreadMatchThreadIds.insert(thread.remoteId)
            NotificationCenter.default.post(name: .fyreThreadsDidChange, object: thread)
            showMatchBanner(for: thread)
        } catch {
#if DEBUG
            debugPrint("Realtime match fetch failed for \(threadId): \(error.localizedDescription)")
#endif
        }
    }

    @MainActor
    private func refreshUnreadMessageCount() async {
        do {
            let threads = try await services.backend.fetchThreads()
            unreadMessageCount = threads.reduce(0) { total, thread in
                total + unreadMessageCount(in: thread)
            }
        } catch {
#if DEBUG
            debugPrint("Unread badge refresh failed: \(error.localizedDescription)")
#endif
        }
    }

    private func unreadMessageCount(in thread: ThreadDTO) -> Int {
        thread.messages.filter { message in
            guard !message.isMe else { return false }
            guard let currentUserReadAt = thread.currentUserReadAt else { return true }
            return message.sentAt > currentUserReadAt
        }.count
    }
}

private struct MatchInAppBanner: View {
    let thread: ChatThread
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                ChatAvatarView(
                    name: thread.name,
                    avatarKey: thread.avatar,
                    size: 42,
                    isOnline: thread.isOnline,
                    showsPresence: false
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(String(format: L10n.tr("match.banner.title"), thread.name))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Text(L10n.tr("match.banner.subtitle"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.primary.opacity(0.10), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.14), radius: 16, y: 8)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(format: L10n.tr("match.banner.title"), thread.name))
    }
}
