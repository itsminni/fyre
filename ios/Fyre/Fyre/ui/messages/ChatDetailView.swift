//
//  ChatDetailView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI
import UIKit

struct ChatDetailView: View {
    @Environment(\.colorScheme) private var colorScheme
    let thread: ChatThread

    @State private var messages: [ChatMessage]
    @State private var draft = ""
    @FocusState private var isInputFocused: Bool
    private let feedbackGenerator = UIImpactFeedbackGenerator(style: .light)

    init(thread: ChatThread) {
        self.thread = thread
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
                                    name: thread.name,
                                    avatarKey: thread.avatar,
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

            HStack(spacing: 10) {
                TextField(L10n.tr("chat.message.placeholder"), text: $draft)
                    .focused($isInputFocused)
                    .textFieldStyle(.plain)
                    .padding(.leading, 14)
                    .padding(.trailing, 10)
                    .frame(height: 38)
                    .background(composerBackground, in: Capsule(style: .continuous))
                    .overlay(
                        Capsule(style: .continuous)
                            .stroke(composerStroke, lineWidth: 1)
                    )
                    .shadow(color: colorScheme == .dark ? .clear : .black.opacity(0.06), radius: 8, y: 3)
                    // - swipe up to focus/open keyboard
                    // - swipe down to dismiss keyboard
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 18)
                            .onEnded { value in
                                handleInputSwipe(value)
                            }
                    )

                LiquidStretchSendButton(
                    isEnabled: !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    action: sendMessage
                )
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 8) {
                    ChatAvatarView(
                        name: thread.name,
                        avatarKey: thread.avatar,
                        size: 30,
                        showsPresence: false
                    )

                    Text(thread.name)
                        .font(.headline.weight(.semibold))
                        .lineLimit(1)
                }
            }
        }
        .onTapGesture {
            // Tap outside the input closes the keyboard.
            isInputFocused = false
        }
    }

    private func sendMessage() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        // New outgoing messages are timestamped at send time.
        messages.append(ChatMessage(id: UUID(), text: text, isMe: true, time: Self.timeFormatter.string(from: Date())))
        draft = ""
    }

    private func copyMessageText(_ text: String) {
        UIPasteboard.general.string = text
    }

    private func handleInputSwipe(_ value: DragGesture.Value) {
        let vertical = value.translation.height
        let predictedVertical = value.predictedEndTranslation.height

        // Combine distance and momentum to make the gesture feel natural.
        let opensKeyboard = vertical <= -18 || predictedVertical <= -55
        let closesKeyboard = vertical >= 18 || predictedVertical >= 55

        if opensKeyboard, !isInputFocused {
            isInputFocused = true
            feedbackGenerator.impactOccurred()
        } else if closesKeyboard, isInputFocused {
            isInputFocused = false
            feedbackGenerator.impactOccurred()
        }
    }

    private var outgoingTextColor: Color {
        colorScheme == .dark ? .white : Color(red: 0.29, green: 0.15, blue: 0.07)
    }

    private func messageTextStyle(isOutgoing: Bool) -> AnyShapeStyle {
        isOutgoing ? AnyShapeStyle(outgoingTextColor) : AnyShapeStyle(.primary)
    }

    private var composerBackground: Color {
        Color(uiColor: colorScheme == .dark ? .secondarySystemBackground : .systemBackground)
    }

    private var composerStroke: Color {
        colorScheme == .dark ? .white.opacity(0.14) : .black.opacity(0.10)
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

        return AnyShapeStyle(Color(uiColor: colorScheme == .dark ? .secondarySystemBackground : .systemGray6))
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

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}
