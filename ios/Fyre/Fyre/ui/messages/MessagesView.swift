//
//  MessagesView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI
import UIKit

// Simple chat models used only for the UI layer in this test
struct ChatMessage: Identifiable, Hashable {
    let id: UUID
    let text: String
    let isMe: Bool
    let time: String
}

struct ChatThread: Identifiable, Hashable {
    let id: UUID
    let remoteId: String
    let name: String
    let avatar: String
    let isOnline: Bool
    let messages: [ChatMessage]

    var lastMessage: String {
        messages.last?.text ?? ""
    }

    var lastTime: String {
        messages.last?.time ?? ""
    }
}

struct MessagesView: View {
    @Environment(AppServices.self) private var services
    @Environment(\.colorScheme) private var colorScheme
    // Local UI state for the list of threads
    @State private var threads: [ChatThread] = []
    @State private var threadPendingDeletion: ChatThread?
    @State private var reloadToken = UUID()
    @State private var realtimeSubscription: AppwriteRealtimeSubscription?
    @State private var realtimeReloadTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Group {
                // Show a empty state while threads are loading
                if threads.isEmpty {
                    ContentUnavailableView(
                        L10n.tr("messages.empty.title"),
                        systemImage: "message",
                        description: Text(L10n.tr("messages.empty.description"))
                    )
                } else {
                    List {
                        ForEach(Array(threads.enumerated()), id: \.element.id) { index, thread in
                            NavigationLink(destination: ChatDetailView(thread: thread)) {
                                ChatThreadRow(thread: thread)
                                .padding(.vertical, 4)
                                .accessibilityHint(L10n.tr("messages.openChat.hint"))
                            }
                            .contextMenu {
                                Button(role: .destructive) {
                                    threadPendingDeletion = thread
                                } label: {
                                    Label(L10n.tr("messages.delete.action"), systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    threadPendingDeletion = thread
                                } label: {
                                    Label(L10n.tr("messages.delete.action"), systemImage: "trash")
                                }
                            }
                            .listRowSeparator(index < threads.count - 1 ? .visible : .hidden)
                            .listRowSeparatorTint(separatorTint)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(L10n.tr("messages.navigationTitle"))
            .alert(item: $threadPendingDeletion) { thread in
                Alert(
                    title: Text(L10n.tr("messages.delete.confirmTitle")),
                    message: Text(String(format: L10n.tr("messages.delete.confirmMessage"), thread.name)),
                    primaryButton: .destructive(Text(L10n.tr("messages.delete.action"))) {
                        deleteThread(thread)
                    },
                    secondaryButton: .cancel(Text(L10n.tr("common.cancel")))
                )
            }
        }
        .task(id: reloadToken) {
            await loadThreads()
        }
        .refreshable {
            await loadThreads()
        }
        .onAppear {
            startRealtime()
        }
        .onDisappear {
            stopRealtime()
        }
        .onReceive(NotificationCenter.default.publisher(for: .fyreThreadsDidChange)) { _ in
            // Swipe matches and chat sends publish this signal so the inbox can refresh lazily.
            reloadToken = UUID()
        }
    }

    private func loadThreads() async {
        do {
            let dtos = try await services.backend.fetchThreads()
            let existingNames = Dictionary(uniqueKeysWithValues: threads.map { ($0.remoteId, $0.name) })
            threads = dtos.map { dto in
                let resolvedName: String
                if isPlaceholderThreadName(dto.name),
                   let cachedName = existingNames[dto.remoteId],
                   !isPlaceholderThreadName(cachedName) {
                    resolvedName = cachedName
                } else {
                    resolvedName = dto.name
                }

                return ChatThread(
                    id: dto.id,
                    remoteId: dto.remoteId,
                    name: resolvedName,
                    avatar: dto.avatar,
                    isOnline: dto.isOnline,
                    messages: dto.messages.map {
                        ChatMessage(id: $0.id, text: $0.text, isMe: $0.isMe, time: $0.time)
                    }
                )
            }
        } catch {
#if DEBUG
            debugPrint("Inbox refresh failed: \(error.localizedDescription)")
#endif
        }
    }

    private func isPlaceholderThreadName(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed == "Match" || trimmed == "Fyre match"
    }

    private func deleteThread(_ thread: ChatThread) {
        threads.removeAll { $0.id == thread.id }
    }

    private var separatorTint: Color {
        colorScheme == .dark ? .white.opacity(0.14) : .black.opacity(0.10)
    }

    private func startRealtime() {
        guard realtimeSubscription == nil else { return }

        realtimeSubscription = AppwriteRealtimeService.makeInboxSubscription(
            onChange: {
                scheduleRealtimeReload()
            },
            onError: { error in
#if DEBUG
                debugPrint("Inbox realtime error: \(error.localizedDescription)")
#endif
            }
        )
    }

    private func stopRealtime() {
        realtimeReloadTask?.cancel()
        realtimeReloadTask = nil
        realtimeSubscription?.cancel()
        realtimeSubscription = nil
    }

    private func scheduleRealtimeReload() {
        realtimeReloadTask?.cancel()
        realtimeReloadTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            await loadThreads()
        }
    }
}

private struct ChatThreadRow: View {
    let thread: ChatThread

    var body: some View {
        HStack(spacing: 12) {
            ChatAvatarView(
                name: thread.name,
                avatarKey: thread.avatar,
                size: 54,
                isOnline: thread.isOnline
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(thread.name)
                    .font(.headline)
                Text(thread.lastMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(thread.lastTime)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if thread.isOnline {
                    Text(L10n.tr("messages.online"))
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
            }
        }
    }
}

struct ChatAvatarView: View {
    @Environment(\.colorScheme) private var colorScheme
    let name: String
    let avatarKey: String
    let size: CGFloat
    var isOnline = false
    var showsPresence = true

    private static let gradients: [[Color]] = [
        [Color(red: 0.98, green: 0.55, blue: 0.24), Color(red: 0.81, green: 0.22, blue: 0.19)],
        [Color(red: 0.31, green: 0.63, blue: 0.99), Color(red: 0.10, green: 0.31, blue: 0.77)],
        [Color(red: 0.25, green: 0.78, blue: 0.58), Color(red: 0.08, green: 0.47, blue: 0.34)],
        [Color(red: 0.77, green: 0.47, blue: 0.98), Color(red: 0.42, green: 0.23, blue: 0.74)],
        [Color(red: 0.98, green: 0.77, blue: 0.28), Color(red: 0.83, green: 0.49, blue: 0.09)]
    ]

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            avatarContent
                .frame(width: size, height: size)
                .clipShape(Circle())
                .overlay(
                    Circle()
                        .stroke(colorScheme == .dark ? Color.white.opacity(0.16) : Color.black.opacity(0.08), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.12), radius: 8, y: 4)

            if showsPresence && isOnline {
                Circle()
                    .fill(.green)
                    .frame(width: max(10, size * 0.22), height: max(10, size * 0.22))
                    .overlay(
                        Circle().stroke(colorScheme == .dark ? .white : .black.opacity(0.10), lineWidth: 1.5)
                    )
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var avatarContent: some View {
        if let uiImage = UIImage(named: avatarKey) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
        } else if UIImage(systemName: avatarKey) != nil {
            ZStack {
                Circle()
                    .fill(placeholderAvatarFill)

                Image(systemName: avatarKey)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(placeholderIconColor)
                    .padding(size * 0.18)
            }
        } else {
            ZStack {
                LinearGradient(
                    colors: Self.gradients[gradientIndex],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Circle()
                    .fill(.white.opacity(0.14))
                    .scaleEffect(0.68)
                    .offset(x: size * 0.16, y: size * 0.16)

                Image(systemName: "person.crop.circle.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(.white.opacity(0.92))
                    .padding(size * 0.18)
            }
        }
    }

    private var initials: String {
        let parts = name
            .split(whereSeparator: \.isWhitespace)
            .map(String.init)

        if parts.count >= 2 {
            let first = parts[0].prefix(1)
            let second = parts[1].prefix(1)
            return "\(first)\(second)".uppercased()
        }

        return String(name.prefix(2)).uppercased()
    }

    private var gradientIndex: Int {
        let total = name.unicodeScalars.reduce(0) { partialResult, scalar in
            partialResult + Int(scalar.value)
        }
        return total % Self.gradients.count
    }

    private var placeholderAvatarFill: Color {
        Color(uiColor: colorScheme == .dark ? .tertiarySystemFill : .secondarySystemFill)
    }

    private var placeholderIconColor: Color {
        colorScheme == .dark ? .white.opacity(0.88) : .secondary
    }
}

#Preview {
    MessagesView()
}
