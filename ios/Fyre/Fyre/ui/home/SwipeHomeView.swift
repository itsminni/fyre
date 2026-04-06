//
//  SwipeHomeView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

private struct SwipeProfile: Identifiable {
    let id = UUID()
    let remoteUserId: String?
    let name: String
    let age: Int
    let bio: String
    let city: String?
    let distanceKm: Int?
    let intent: UserIntent?
    let interests: [String]
    let instagramTag: String?
    let spotifyTag: String?
    let avatarURL: URL?
}

struct SwipeHomeView: View {
    private enum DecisionDirection {
        case left
        case right
    }

    @Environment(AppServices.self) private var services
    @Environment(UserStore.self) private var store
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("settings_show_age") private var showAge = true
    @AppStorage("settings_show_distance") private var showDistance = true
    @AppStorage("settings_show_intent") private var showIntent = true
    @AppStorage("settings_show_interests") private var showInterests = true
    @AppStorage("settings_show_instagram_tag") private var showInstagramTag = true
    @AppStorage("settings_show_spotify_tag") private var showSpotifyTag = true
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
        VStack(alignment: .leading, spacing: 14) {
            cardHero(for: profile)

            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(nameLine(for: profile))
                        .font(.title3.bold())

                    if showDistance, let distanceKm = profile.distanceKm {
                        tag(text: "\(distanceKm) km", accent: .orange)
                    }

                    if let city = profile.city?.trimmingCharacters(in: .whitespacesAndNewlines),
                       !city.isEmpty {
                        tag(text: city)
                    }
                }

                if showIntent, let intent = profile.intent {
                    tag(text: L10n.tr(intent.localizationKey), accent: .orange)
                }

                Text(profile.bio)
                    .foregroundStyle(.secondary)
                    .lineLimit(4)

                if showInterests, !profile.interests.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(profile.interests.prefix(4)), id: \.self) { interest in
                                tag(text: interest)
                            }
                        }
                    }
                }

                let socialLabels = socialLabels(for: profile)
                if !socialLabels.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(socialLabels, id: \.self) { socialLabel in
                                tag(text: socialLabel, accent: .orange)
                            }
                        }
                    }
                }
            }
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

    @ViewBuilder
    private func cardHero(for profile: SwipeProfile) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color.orange.opacity(0.55), Color.red.opacity(0.60)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            if let avatarURL = profile.avatarURL {
                AsyncImage(url: avatarURL) { phase in
                    switch phase {
                    case let .success(image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        placeholderAvatar
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
            } else {
                placeholderAvatar
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            LinearGradient(
                colors: [.clear, .black.opacity(0.10), .black.opacity(0.55)],
                startPoint: .top,
                endPoint: .bottom
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .frame(maxWidth: .infinity)
        .frame(height: 320)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var placeholderAvatar: some View {
        ZStack {
            LinearGradient(
                colors: [Color.orange.opacity(0.45), Color.red.opacity(0.38)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Image(systemName: "person.fill")
                .font(.system(size: 64))
                .foregroundStyle(.white.opacity(0.92))
        }
    }

    private func tag(text: String, accent: Color? = nil) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(accent ?? .primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 999, style: .continuous)
                    .fill((accent ?? .white).opacity(accent == nil ? 0.08 : 0.14))
            )
    }

    private func commitDecision(_ direction: DecisionDirection) {
        guard let profile = profiles.first, !isAnimatingDecision, !isSubmittingSwipe else { return }
        animateDecision(direction, for: profile)
    }

    private func animateDecision(_ direction: DecisionDirection, for profile: SwipeProfile) {
        isAnimatingDecision = true
        swipeErrorMessage = nil

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
            profiles = dtos.map {
                SwipeProfile(
                    remoteUserId: $0.remoteUserId,
                    name: $0.name,
                    age: $0.age,
                    bio: $0.bio,
                    city: $0.city,
                    distanceKm: $0.distanceKm,
                    intent: $0.intent,
                    interests: $0.interests,
                    instagramTag: $0.instagramTag,
                    spotifyTag: $0.spotifyTag,
                    avatarURL: $0.avatarURL
                )
            }
        } catch {
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
            let matchedThread = try await services.backend.submitSwipe(
                otherUserId: remoteUserId,
                otherUserName: profile.name,
                decision: decision
            )

            guard let dto = matchedThread else { return }

            let displayName = ThreadNaming.isPlaceholderThreadName(dto.name)
                ? profile.name
                : dto.name
            selectedThread = ChatThread(
                id: dto.id,
                remoteId: dto.remoteId,
                name: displayName,
                avatar: dto.avatar,
                isOnline: dto.isOnline,
                lastSeenAt: dto.lastSeenAt,
                currentUserReadAt: dto.currentUserReadAt,
                otherParticipantReadAt: dto.otherParticipantReadAt,
                participantUserIds: dto.participantUserIds,
                messages: dto.messages.map(ChatMessage.init(dto:))
            )
            NotificationCenter.default.post(name: .fyreThreadsDidChange, object: nil)
        } catch {
#if DEBUG
            swipeErrorMessage = error.localizedDescription
#else
            swipeErrorMessage = L10n.tr("home.swipe.error")
#endif
        }
    }

    private var discoverFilterID: String {
        guard let user = store.currentUser else { return "discover" }
        let genders = user.resolvedPreferredGenders.map(\.rawValue).joined(separator: ",")
        return [
            genders,
            "\(user.resolvedMinPreferredAge)",
            "\(user.resolvedMaxPreferredAge)",
            user.normalizedMaxDistanceKm.map(String.init) ?? "none",
            user.city ?? "",
            user.latitude.map { String($0) } ?? "",
            user.longitude.map { String($0) } ?? ""
        ].joined(separator: "|")
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

    private func nameLine(for profile: SwipeProfile) -> String {
        if showAge {
            return "\(profile.name), \(profile.age)"
        }
        return profile.name
    }

    private func socialLabels(for profile: SwipeProfile) -> [String] {
        var labels: [String] = []

        if showInstagramTag,
           let instagramTag = normalizedSocialTag(profile.instagramTag) {
            labels.append("\(L10n.tr("profile.instagramTag")): @\(instagramTag)")
        }

        if showSpotifyTag,
           let spotifyTag = normalizedSocialTag(profile.spotifyTag) {
            labels.append("\(L10n.tr("profile.spotifyTag")): @\(spotifyTag)")
        }

        return labels
    }

    private func normalizedSocialTag(_ value: String?) -> String? {
        guard let value else { return nil }

        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let withoutAtPrefix = String(trimmed.drop(while: { $0 == "@" }))
        let withoutWhitespace = withoutAtPrefix.replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)
        let withoutAt = withoutWhitespace.replacingOccurrences(of: "@", with: "")
        guard !withoutAt.isEmpty else { return nil }

        return String(withoutAt.prefix(64))
    }
}
