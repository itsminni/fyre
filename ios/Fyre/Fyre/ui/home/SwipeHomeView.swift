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
                                        animateDecision(value.translation.width > 0 ? .right : .left)
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
                        animateDecision(.left)
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
                    .disabled(isAnimatingDecision || profiles.isEmpty)

                    Button {
                        animateDecision(.right)
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
                    .disabled(isAnimatingDecision || profiles.isEmpty)
                }
            }
            .padding()
            .navigationTitle(L10n.tr("home.navigationTitle"))
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

    private func animateDecision(_ direction: DecisionDirection) {
        guard !profiles.isEmpty, !isAnimatingDecision else { return }
        isAnimatingDecision = true

        // Push the top card out, then remove it from the stack.
        let targetX: CGFloat = direction == .left ? -180 : 180
        withAnimation(.easeOut(duration: 0.18)) {
            dragOffset = CGSize(width: targetX, height: 0)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            profiles.removeFirst()
            dragOffset = .zero
            isAnimatingDecision = false
        }
    }

    private func loadProfiles() async {
        do {
            let dtos = try await services.backend.fetchDiscoverProfiles()
            let preferredAudience = store.currentUser?.showMe ?? .everyone
            profiles = dtos
                .filter { preferredAudience.matches($0.gender) }
                .map { SwipeProfile(name: $0.name, age: $0.age, bio: $0.bio) }
        } catch {
            profiles = []
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
