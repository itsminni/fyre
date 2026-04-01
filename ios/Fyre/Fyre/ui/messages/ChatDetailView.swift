//
//  ChatDetailView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI
import UIKit
import Combine

struct ChatDetailView: View {
    @Environment(AppServices.self) private var services
    @Environment(\.colorScheme) private var colorScheme
    let thread: ChatThread

    @State private var threadName: String
    @State private var threadAvatar: String
    @State private var messages: [ChatMessage]
    @State private var draft = ""
    @State private var sendErrorMessage: String?
    @State private var isSending = false
    @FocusState private var isInputFocused: Bool
    private let refreshTimer = Timer.publish(every: 3, on: .main, in: .common).autoconnect()

    init(thread: ChatThread) {
        self.thread = thread
        _threadName = State(initialValue: thread.name)
        _threadAvatar = State(initialValue: thread.avatar)
        _messages = State(initialValue: thread.messages)
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(messages) { message in
                        HStack(alignment: .bottom, spacing: 8) {
                            if message.isMe { Spacer() }

                            if !message.isMe {
                                ChatAvatarView(
                                    name: threadName,
                                    avatarKey: threadAvatar,
                                    size: 30,
                                    showsPresence: false
                                )
                            }

                            VStack(alignment: message.isMe ? .trailing : .leading, spacing: 3) {
                                Text(message.text)
                                    .foregroundStyle(messageTextStyle(isOutgoing: message.isMe))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(messageBubbleBackground(isOutgoing: message.isMe))
                                    .clipShape(Capsule(style: .continuous))
                                    .overlay(
                                        Capsule(style: .continuous)
                                            .stroke(messageBubbleStroke(isOutgoing: message.isMe), lineWidth: 1)
                                    )
                                    .shadow(color: messageBubbleShadow(isOutgoing: message.isMe), radius: colorScheme == .dark ? 0 : 6, y: colorScheme == .dark ? 0 : 3)
                                    .contextMenu {
                                        // Keep only lightweight message actions for now.
                                        Button {
                                            copyMessageText(message.text)
                                        } label: {
                                            Label(L10n.tr("chat.copy"), systemImage: "doc.on.doc")
                                        }
                                    }

                                Text(message.time)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                                    .padding(.horizontal, 2)
                            }

                            if !message.isMe { Spacer() }
                        }
                    }
                }
                .padding()
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(chatBackgroundColor)
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 8) {
                if let sendErrorMessage {
                    Text(sendErrorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                HStack(alignment: .bottom, spacing: 12) {
                    TextField(L10n.tr("chat.message.placeholder"), text: $draft, axis: .vertical)
                        .focused($isInputFocused)
                        .textFieldStyle(.plain)
                        .submitLabel(.send)
                        .onSubmit(sendMessage)
                        .lineLimit(1...4)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(composerFieldChrome)

                    Button(action: sendMessage) {
                        ZStack {
                            Circle()
                                .fill(canSendMessage ? Color.accentColor : Color(uiColor: .tertiarySystemFill))

                            Image(systemName: "arrow.up")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(canSendMessage ? Color.white : Color.secondary)
                        }
                        .frame(width: 38, height: 38)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSendMessage)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 12)
            .background(composerChrome)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 8) {
                    ChatAvatarView(
                        name: threadName,
                        avatarKey: threadAvatar,
                        size: 30,
                        showsPresence: false
                    )

                    Text(threadName)
                        .font(.headline.weight(.semibold))
                        .lineLimit(1)
                }
            }
        }
        .task {
            await reloadThread()
        }
        .onReceive(refreshTimer) { _ in
            Task {
                await reloadThread()
            }
        }
    }

    private func sendMessage() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        // Clear optimistically for a snappy composer, then restore the draft if the send fails.
        draft = ""
        sendErrorMessage = nil
        isSending = true

        Task {
            do {
                let dto = try await services.backend.sendMessage(threadId: thread.remoteId, text: text)
                let message = ChatMessage(id: dto.id, text: dto.text, isMe: dto.isMe, time: dto.time)
                await MainActor.run {
                    if !messages.contains(where: { $0.id == message.id }) {
                        messages.append(message)
                    }
                    NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
                    isSending = false
                }
            } catch {
                await MainActor.run {
                    draft = text
#if DEBUG
                    sendErrorMessage = error.localizedDescription
#else
                    sendErrorMessage = L10n.tr("chat.error.sendFailed")
#endif
                    isSending = false
                }
            }
        }
    }

    private func copyMessageText(_ text: String) {
        UIPasteboard.general.string = text
    }

    private var canSendMessage: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
    }

    private var chatBackgroundColor: Color {
        Color(uiColor: .systemBackground)
    }

    @ViewBuilder
    private var composerChrome: some View {
        if #available(iOS 26.0, *) {
            Color.clear
                .glassEffect(.regular, in: Rectangle())
                .overlay(alignment: .top) {
                    Divider()
                }
        } else {
            Color(uiColor: .systemBackground)
                .overlay(alignment: .top) {
                    Divider()
                }
        }
    }

    @ViewBuilder
    private var composerFieldChrome: some View {
        if #available(iOS 26.0, *) {
            Capsule(style: .continuous)
                .fill(.clear)
                .glassEffect(.regular, in: Capsule(style: .continuous))
        } else {
            Capsule(style: .continuous)
                .fill(Color(uiColor: .secondarySystemFill))
        }
    }

    private var outgoingTextColor: Color {
        colorScheme == .dark ? .white : Color(red: 0.29, green: 0.15, blue: 0.07)
    }

    private func messageTextStyle(isOutgoing: Bool) -> AnyShapeStyle {
        isOutgoing ? AnyShapeStyle(outgoingTextColor) : AnyShapeStyle(.primary)
    }

    private func messageBubbleBackground(isOutgoing: Bool) -> AnyShapeStyle {
        if isOutgoing {
            if colorScheme == .dark {
                return AnyShapeStyle(
                    LinearGradient(
                        colors: [
                            Color(red: 0.96, green: 0.47, blue: 0.15),
                            Color(red: 0.84, green: 0.33, blue: 0.20)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            }

            return AnyShapeStyle(
                LinearGradient(
                    colors: [
                        Color(red: 1.00, green: 0.88, blue: 0.74),
                        Color(red: 1.00, green: 0.80, blue: 0.69)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        }

        return AnyShapeStyle(
            Color(uiColor: colorScheme == .dark ? .secondarySystemBackground : .systemGray6)
        )
    }

    private func messageBubbleStroke(isOutgoing: Bool) -> Color {
        if isOutgoing {
            return colorScheme == .dark ? .white.opacity(0.14) : .orange.opacity(0.35)
        }

        return colorScheme == .dark ? .white.opacity(0.12) : .black.opacity(0.08)
    }

    private func messageBubbleShadow(isOutgoing: Bool) -> Color {
        guard colorScheme == .light else { return .clear }
        return isOutgoing ? .orange.opacity(0.10) : .black.opacity(0.05)
    }

    private func reloadThread() async {
        do {
            guard let dto = try await services.backend.fetchThread(threadId: thread.remoteId) else {
                return
            }

            let refreshedMessages = dto.messages.map {
                ChatMessage(id: $0.id, text: $0.text, isMe: $0.isMe, time: $0.time)
            }

            await MainActor.run {
                messages = refreshedMessages

                if !isPlaceholderThreadName(dto.name) || isPlaceholderThreadName(threadName) {
                    threadName = dto.name
                }

                if !dto.avatar.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    threadAvatar = dto.avatar
                }
            }
        } catch {
#if DEBUG
            debugPrint("Chat refresh failed for \(thread.remoteId): \(error.localizedDescription)")
#endif
        }
    }

    private func isPlaceholderThreadName(_ name: String) -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed == "Match" || trimmed == "Fyre match"
    }

}
