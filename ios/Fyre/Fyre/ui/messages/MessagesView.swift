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
    let remoteId: String
    let text: String
    let messageType: MessageTypeDTO
    let attachment: MessageAttachmentDTO?
    let isMe: Bool
    let time: String
    let sentAt: Date
    let replyToRemoteId: String?
    let replyPreviewText: String?

    init(
        id: UUID,
        remoteId: String,
        text: String,
        messageType: MessageTypeDTO,
        attachment: MessageAttachmentDTO?,
        isMe: Bool,
        time: String,
        sentAt: Date,
        replyToRemoteId: String? = nil,
        replyPreviewText: String? = nil
    ) {
        self.id = id
        self.remoteId = remoteId
        self.text = text
        self.messageType = messageType
        self.attachment = attachment
        self.isMe = isMe
        self.time = time
        self.sentAt = sentAt
        self.replyToRemoteId = replyToRemoteId
        self.replyPreviewText = replyPreviewText
    }

    init(dto: MessageDTO) {
        self.init(
            id: dto.id,
            remoteId: dto.remoteId,
            text: dto.text,
            messageType: dto.messageType,
            attachment: dto.attachment,
            isMe: dto.isMe,
            time: dto.time,
            sentAt: dto.sentAt,
            replyToRemoteId: dto.replyToRemoteId,
            replyPreviewText: dto.replyPreviewText
        )
    }
}

struct ChatThread: Identifiable, Hashable {
    let id: UUID
    let remoteId: String
    let name: String
    let avatar: String
    let isOnline: Bool
    let lastSeenAt: Date?
    let currentUserReadAt: Date?
    let otherParticipantReadAt: Date?
    let participantUserIds: [String]
    let messages: [ChatMessage]

    var lastMessage: String {
        guard let last = messages.last else { return "" }
        if !last.text.isEmpty { return last.text }

        switch last.messageType {
        case .image:
            return L10n.tr("chat.attachment.photo")
        case .video:
            return L10n.tr("chat.attachment.video")
        case .audio:
            return L10n.tr("chat.attachment.audio")
        case .file:
            return last.attachment?.name ?? L10n.tr("chat.attachment.file")
        case .text:
            return ""
        }
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
            .navigationBarTitleDisplayMode(.large)
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
        .onReceive(NotificationCenter.default.publisher(for: .fyreThreadRemoved)) { notification in
            guard let remoteId = notification.object as? String else { return }
            threads.removeAll { $0.remoteId == remoteId }
        }
        .background {
            TabBarRestoreController()
        }
    }

    private func loadThreads() async {
        do {
            let dtos = try await services.backend.fetchThreads()
            let existingNames = Dictionary(uniqueKeysWithValues: threads.map { ($0.remoteId, $0.name) })
            threads = dtos.map { dto in
                let resolvedName: String
                if ThreadNaming.isPlaceholderThreadName(dto.name),
                   let cachedName = existingNames[dto.remoteId],
                   !ThreadNaming.isPlaceholderThreadName(cachedName) {
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
                    lastSeenAt: dto.lastSeenAt,
                    currentUserReadAt: dto.currentUserReadAt,
                    otherParticipantReadAt: dto.otherParticipantReadAt,
                    participantUserIds: dto.participantUserIds,
                    messages: dto.messages.map(ChatMessage.init(dto:))
                )
            }
        } catch {
#if DEBUG
            debugPrint("Inbox refresh failed: \(error.localizedDescription)")
#endif
        }
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
            try? await Task.sleep(nanoseconds: 100_000_000)
            guard !Task.isCancelled else { return }
            await loadThreads()
        }
    }
}

private struct TabBarRestoreController: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller {
        Controller()
    }

    func updateUIViewController(_ uiViewController: Controller, context: Context) {}

    final class Controller: UIViewController {
        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            guard let tabBar = tabBarController?.tabBar else { return }
            tabBar.isHidden = false
            tabBar.alpha = 1
            for subview in tabBar.subviews {
                subview.alpha = 1
            }
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

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(thread.name)
                        .font(.headline)
                        .lineLimit(1)

                    Spacer(minLength: 8)

                    if let trailingTimeText {
                        Text(trailingTimeText)
                            .font(.subheadline.weight(unreadCount > 0 ? .semibold : .regular))
                            .foregroundStyle(trailingTimeColor)
                            .lineLimit(1)
                    }
                }

                HStack(alignment: .center, spacing: 8) {
                    Text(thread.lastMessage)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Spacer(minLength: 8)

                    if unreadCount > 0 {
                        unreadBadge
                    } else if let deliveryStatusText {
                        Text(deliveryStatusText)
                            .font(.subheadline)
                            .foregroundStyle(deliveryStatusColor)
                            .lineLimit(1)
                    }
                }
            }
        }
    }

    private var unreadCount: Int {
        thread.messages.filter { message in
            guard !message.isMe else { return false }
            guard let currentUserReadAt = thread.currentUserReadAt else { return true }
            return message.sentAt > currentUserReadAt
        }.count
    }

    private var lastMessage: ChatMessage? {
        thread.messages.last
    }

    private var isLastOutgoingMessageRead: Bool {
        guard let lastMessage, lastMessage.isMe, let otherParticipantReadAt = thread.otherParticipantReadAt else {
            return false
        }

        return otherParticipantReadAt >= lastMessage.sentAt
    }

    private var trailingTimeText: String? {
        thread.lastTime.isEmpty ? nil : thread.lastTime
    }

    private var deliveryStatusText: String? {
        guard unreadCount == 0, let lastMessage, lastMessage.isMe else {
            return nil
        }

        return isLastOutgoingMessageRead ? L10n.tr("messages.read") : L10n.tr("messages.sent")
    }

    private var trailingTimeColor: Color {
        if unreadCount > 0 {
            return .orange
        }

        return .secondary
    }

    private var deliveryStatusColor: Color {
        isLastOutgoingMessageRead ? .green : .secondary
    }

    private var unreadBadge: some View {
        Group {
            if unreadCount >= 10 {
                Text("\(unreadCount)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(
                        Capsule(style: .continuous)
                            .fill(Color.orange)
                    )
            } else {
                ZStack {
                    Circle()
                        .fill(Color.orange)
                        .frame(width: 24, height: 24)

                    Text("\(unreadCount)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
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
        if let remoteAvatarURL {
            AsyncImage(url: remoteAvatarURL) { phase in
                switch phase {
                case let .success(image):
                    image
                        .resizable()
                        .scaledToFill()
                default:
                    fallbackAvatarContent
                }
            }
        } else {
            fallbackAvatarContent
        }
    }

    @ViewBuilder
    private var fallbackAvatarContent: some View {
        if let uiImage = UIImage(named: avatarKey) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
        } else if !avatarKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  UIImage(systemName: avatarKey) != nil {
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

    private var remoteAvatarURL: URL? {
        let trimmed = avatarKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else {
            return nil
        }
        guard scheme == "http" || scheme == "https" else {
            return nil
        }
        return url
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
