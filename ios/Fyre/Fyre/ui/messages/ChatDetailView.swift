//
//  ChatDetailView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI
import UIKit

struct ChatDetailView: View {
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
                                Image(systemName: thread.avatar)
                                    .font(.system(size: 28))
                                    .foregroundStyle(.secondary)
                            }

                            VStack(alignment: message.isMe ? .trailing : .leading, spacing: 3) {
                                Text(message.text)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(
                                        message.isMe
                                        ? AnyShapeStyle(.ultraThinMaterial)
                                        : AnyShapeStyle(Color(.secondarySystemBackground).opacity(0.75))
                                    )
                                    .clipShape(Capsule(style: .continuous))
                                    .overlay(
                                        Capsule(style: .continuous)
                                            .stroke(Color.white.opacity(0.2), lineWidth: 1)
                                    )
                                    .contextMenu {
                                        // Keep only lightweight message actions for now.
                                        Button {
                                            copyMessageText(message.text)
                                        } label: {
                                            Label(L10n.tr("chat.copy"), systemImage: "doc.on.doc")
                                        }

                                        Button {
                                            cutMessage(message)
                                        } label: {
                                            Label(L10n.tr("chat.cut"), systemImage: "scissors")
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
                    .background(.ultraThinMaterial, in: Capsule(style: .continuous))
                    .overlay(
                        Capsule(style: .continuous)
                            .stroke(Color.white.opacity(0.2), lineWidth: 1)
                    )
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
        .navigationTitle(thread.name)
        .navigationBarTitleDisplayMode(.inline)
        .onTapGesture {
            // Tap outside the input closes the keyboard.
            isInputFocused = false
        }
    }

    private func sendMessage() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        // New outgoing messages are timestamped at send time.
        messages.append(ChatMessage(text: text, isMe: true, time: Self.timeFormatter.string(from: Date())))
        draft = ""
    }

    private func copyMessageText(_ text: String) {
        UIPasteboard.general.string = text
    }

    private func cutMessage(_ message: ChatMessage) {
        UIPasteboard.general.string = message.text
        messages.removeAll { $0.id == message.id }
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

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}
