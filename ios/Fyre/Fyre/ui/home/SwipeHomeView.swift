//
//  SwipeHomeView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

// In-memory profile card data used by the demo swipe experience.
private struct SwipeProfile: Identifiable {
    let id = UUID()
    let remoteUserId: String?
    let name: String
    let age: Int
    let bio: String
}

// Draft local implementation of the swipe-based discovery view.
struct SwipeHomeView: View {
    private enum DecisionDirection {
        case left
        case right
    }

    @Environment(AppServices.self) private var services
    @Environment(UserStore.self) private var store
    @Environment(\.colorScheme) private var colorScheme
    @State private var profiles: [SwipeProfile] = []
    @State private var dragOffset: CGSize = .zero
    @State private var isAnimatingDecision = false
    @State private var isSubmittingSwipe = false
    @State private var swipeErrorMessage: String?
    @State private var selectedThread: ChatThread?

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if let top = profiles.first {
                    card(for: top)
                        .offset(dragOffset)
                        .rotationEffect(.degrees(Double(dragOffset.width / 20)))
                        .gesture(
                            DragGesture()
                                .onChanged { value in
                                    dragOffset = value.translation
                                }
                                .onEnded { value in
                                    if abs(value.translation.width) > 120 {
                                        commitDecision(value.translation.width > 0 ? .right : .left)
                                    } else {
                                        withAnimation(.spring()) {
                                            dragOffset = .zero
                                        }
                                    }
                                }
                        )
                } else {
                    ContentUnavailableView(
                        L10n.tr("home.empty.title"),
                        systemImage: "checkmark.circle",
                        description: Text(L10n.tr("home.empty.description"))
                    )
                }

                HStack(spacing: 20) {
                    Button {
                        commitDecision(.left)
                    } label: {
                        Image(systemName: "forward.fill")
                            .font(.title3.weight(.bold))
                            .scaleEffect(x: -1, y: 1)
                            .foregroundStyle(.primary)
                            .frame(width: 58, height: 58)
                            .background(controlSurfaceFill, in: Circle())
                            .overlay(
                                Circle()
                                    .stroke(controlSurfaceStroke, lineWidth: 1)
                            )
                            .shadow(color: controlShadow, radius: 10, y: 5)
                    }
                    .accessibilityLabel(L10n.tr("home.skip.accessibility"))
                    .disabled(isAnimatingDecision || isSubmittingSwipe || profiles.isEmpty)

                    Button {
                        commitDecision(.right)
                    } label: {
                        Image(systemName: "flame.fill")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.orange)
                            .frame(width: 62, height: 62)
                            .background(primaryControlFill, in: Circle())
                            .overlay(
                                Circle()
                                    .stroke(primaryControlStroke, lineWidth: 1)
                            )
                            .shadow(color: Color.orange.opacity(colorScheme == .dark ? 0.20 : 0.14), radius: 12, y: 6)
                    }
                    .accessibilityLabel(L10n.tr("app.name"))
                    .disabled(isAnimatingDecision || isSubmittingSwipe || profiles.isEmpty)
                }

                if let swipeErrorMessage {
                    Text(swipeErrorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding()
            .navigationTitle(L10n.tr("home.navigationTitle"))
            .navigationDestination(item: $selectedThread) { thread in
                ChatDetailView(thread: thread)
            }
        }
        .onAppear {
            Task {
                await loadProfiles()
            }
        }
        .task(id: discoverFilterID) {
            await loadProfiles()
        }
    }

    private func card(for profile: SwipeProfile) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            RoundedRectangle(cornerRadius: 14)
                .fill(
                    LinearGradient(
                        colors: [Color.orange.opacity(0.6), Color.red.opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(height: 260)
                .overlay(
                    Image(systemName: "person.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(.white)
                )

            Text("\(profile.name), \(profile.age)")
                .font(.title3.bold())
            Text(profile.bio)
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(cardSurfaceFill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(cardSurfaceStroke, lineWidth: 1)
        )
        .shadow(color: cardSurfaceShadow, radius: colorScheme == .dark ? 16 : 12, y: colorScheme == .dark ? 8 : 5)
    }

    private func commitDecision(_ direction: DecisionDirection) {
        guard let profile = profiles.first, !isAnimatingDecision, !isSubmittingSwipe else { return }
        animateDecision(direction, for: profile)
    }

    private func animateDecision(_ direction: DecisionDirection, for profile: SwipeProfile) {
        isAnimatingDecision = true
        swipeErrorMessage = nil

        // Push the top card out, then remove it from the stack.
        let targetX: CGFloat = direction == .left ? -180 : 180
        withAnimation(.easeOut(duration: 0.18)) {
            dragOffset = CGSize(width: targetX, height: 0)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            if !profiles.isEmpty {
                profiles.removeFirst()
            }
            dragOffset = .zero
            isAnimatingDecision = false

            // Keep the card interaction feeling immediate, then persist the decision in the background.
            Task {
                await submitDecision(direction, for: profile)
            }
        }
    }

    @MainActor
    private func loadProfiles() async {
        do {
            swipeErrorMessage = nil
            let dtos = try await services.backend.fetchDiscoverProfiles()
            let preferredAudience = store.currentUser?.showMe ?? .everyone
            let filteredProfiles = dtos
                .filter { preferredAudience.matches($0.gender) }
                .map {
                    SwipeProfile(
                        remoteUserId: $0.remoteUserId,
                        name: $0.name,
                        age: $0.age,
                        bio: $0.bio
                    )
                }
#if DEBUG
            debugPrint("Discover loaded \(dtos.count) profiles from backend, \(filteredProfiles.count) after applying showMe=\(preferredAudience.rawValue).")
#endif
            profiles = filteredProfiles
        } catch {
#if DEBUG
            debugPrint("Discover load failed: \(error.localizedDescription)")
#endif
            profiles = []
            swipeErrorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func submitDecision(_ direction: DecisionDirection, for profile: SwipeProfile) async {
        guard let remoteUserId = profile.remoteUserId else { return }

        isSubmittingSwipe = true
        defer { isSubmittingSwipe = false }

        do {
            let decision: SwipeDecisionDTO = direction == .right ? .liked : .passed
            let matchedThread = try await services.backend.submitSwipe(otherUserId: remoteUserId, decision: decision)

            // A mutual like returns the already-created thread so we can jump straight into chat.
            guard let dto = matchedThread else { return }

            let displayName = dto.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || dto.name == "Match"
                ? profile.name
                : dto.name
            selectedThread = ChatThread(
                id: dto.id,
                remoteId: dto.remoteId,
                name: displayName,
                avatar: dto.avatar,
                isOnline: dto.isOnline,
                messages: dto.messages.map {
                    ChatMessage(id: $0.id, text: $0.text, isMe: $0.isMe, time: $0.time)
                }
            )
            NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
        } catch {
            swipeErrorMessage = L10n.tr("home.swipe.error")
        }
    }

    private var discoverFilterID: String {
        (store.currentUser?.showMe ?? .everyone).rawValue
    }

    private var cardSurfaceFill: Color {
        Color(uiColor: colorScheme == .dark ? .secondarySystemBackground : .systemBackground)
    }

    private var cardSurfaceStroke: Color {
        colorScheme == .dark ? .white.opacity(0.16) : .black.opacity(0.10)
    }

    private var cardSurfaceShadow: Color {
        colorScheme == .dark ? .black.opacity(0.16) : .black.opacity(0.08)
    }

    private var controlSurfaceFill: Color {
        Color(uiColor: colorScheme == .dark ? .secondarySystemBackground : .systemBackground)
    }

    private var controlSurfaceStroke: Color {
        colorScheme == .dark ? .white.opacity(0.12) : .black.opacity(0.10)
    }

    private var controlShadow: Color {
        colorScheme == .dark ? .black.opacity(0.16) : .black.opacity(0.08)
    }

    private var primaryControlFill: Color {
        colorScheme == .dark ? .orange.opacity(0.18) : .orange.opacity(0.14)
    }

    private var primaryControlStroke: Color {
        colorScheme == .dark ? .orange.opacity(0.28) : .orange.opacity(0.34)
    }
}
