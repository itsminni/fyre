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
                            .background(.ultraThinMaterial, in: Circle())
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
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel(L10n.tr("app.name"))
                    .disabled(isAnimatingDecision || profiles.isEmpty)
                }
            }
            .padding()
            .navigationTitle(L10n.tr("home.navigationTitle"))
        }
        .task {
            if profiles.isEmpty {
                await loadProfiles()
            }
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
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.25), lineWidth: 1)
        )
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
            profiles = dtos.map { SwipeProfile(name: $0.name, age: $0.age, bio: $0.bio) }
        } catch {
            profiles = []
        }
    }
}
