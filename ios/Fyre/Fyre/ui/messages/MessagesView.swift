//
//  MessagesView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import SwiftUI

// Simple chat models used only for the UI layer in this test
struct ChatMessage: Identifiable {
    let id = UUID()
    let text: String
    let isMe: Bool
    let time: String
}

struct ChatThread: Identifiable {
    let id = UUID()
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
    // Local UI state for the list of threads
    @State private var threads: [ChatThread] = []

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
                    List(threads) { thread in
                        NavigationLink(destination: ChatDetailView(thread: thread)) {
                            HStack(spacing: 12) {
                                ZStack(alignment: .bottomTrailing) {
                                    Image(systemName: thread.avatar)
                                        .font(.system(size: 34))
                                        .foregroundStyle(.secondary)

                                    if thread.isOnline {
                                        Circle()
                                            .fill(.green)
                                            .frame(width: 10, height: 10)
                                            .overlay(
                                                Circle().stroke(.white, lineWidth: 1)
                                            )
                                    }
                                }

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
                            .padding(.vertical, 4)
                            .accessibilityHint(L10n.tr("messages.openChat.hint"))
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(L10n.tr("messages.navigationTitle"))
        }
        .task {
            // Load threads once when view appears
            if threads.isEmpty {
                await loadThreads()
            }
        }
    }

    private func loadThreads() async {
        do {
            let dtos = try await services.backend.fetchThreads()
            threads = dtos.map { dto in
                ChatThread(
                    name: dto.name,
                    avatar: dto.avatar,
                    isOnline: dto.isOnline,
                    messages: dto.messages.map {
                        ChatMessage(text: $0.text, isMe: $0.isMe, time: $0.time)
                    }
                )
            }
        } catch {
            threads = []
        }
    }
}

#Preview {
    MessagesView()
}
