//
//  SwipeHomeView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

private struct SwipeProfile: Identifiable {
    let id: String
    let name: String
    let age: Int
    let photos: [URL]
    let compatibilityScore: Int
    let distanceKm: Int?
    let commonInterests: [String]
    let relationshipState: RelationshipStateDTO
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
    @AppStorage("settings_show_interests") private var showInterests = true
    @State private var profiles: [SwipeProfile] = []
    @State private var dragOffset: CGSize = .zero
    @State private var isAnimatingDecision = false
    @State private var isSubmittingSwipe = false
    @State private var swipeErrorMessage: String?
    @State private var selectedThread: ChatThread?
    @State private var activePhotoIndices: [String: Int] = [:]

    private let swipeThreshold: CGFloat = 118

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Group {
                    if profiles.isEmpty {
                        ContentUnavailableView(
                            L10n.tr("home.empty.title"),
                            systemImage: "checkmark.circle",
                            description: Text(L10n.tr("home.empty.description"))
                        )
                    } else {
                        GeometryReader { geometry in
                            swipeDeck(in: geometry.size)
                        }
                        .frame(height: 560)
                    }
                }

                controlsRow

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

    @ViewBuilder
    private func swipeDeck(in size: CGSize) -> some View {
        let visibleProfiles = Array(profiles.prefix(3))
        let dragProgress = min(abs(dragOffset.width) / swipeThreshold, 1)

        ZStack {
            ForEach(Array(visibleProfiles.indices.reversed()), id: \.self) { index in
                let profile = visibleProfiles[index]
                let isTopCard = index == 0

                card(for: profile)
                    .scaleEffect(scale(for: index, dragProgress: dragProgress))
                    .offset(
                        x: isTopCard ? dragOffset.width : 0,
                        y: yOffset(for: index, dragProgress: dragProgress) + (isTopCard ? dragOffset.height * 0.16 : 0)
                    )
                    .rotationEffect(.degrees(rotationDegrees(forTopCard: isTopCard)))
                    .opacity(opacity(for: index))
                    .shadow(
                        color: cardSurfaceShadow.opacity(isTopCard ? 1 : 0.75),
                        radius: isTopCard ? 18 : 12,
                        y: isTopCard ? 10 : 6
                    )
                    .allowsHitTesting(isTopCard && !isAnimatingDecision && !isSubmittingSwipe)
                    .gesture(dragGesture)
                    .animation(.spring(response: 0.36, dampingFraction: 0.84), value: profiles)
                    .animation(.spring(response: 0.32, dampingFraction: 0.86), value: dragOffset)
                    .zIndex(Double(visibleProfiles.count - index))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.top, 4)
    }

    private var controlsRow: some View {
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
                    .scaleEffect(dragOffset.width < 0 ? 1.04 : 1)
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
                    .scaleEffect(dragOffset.width > 0 ? 1.05 : 1)
            }
            .accessibilityLabel(L10n.tr("app.name"))
            .disabled(isAnimatingDecision || isSubmittingSwipe || profiles.isEmpty)
        }
        .animation(.spring(response: 0.24, dampingFraction: 0.82), value: dragOffset)
    }

    private func card(for profile: SwipeProfile) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            cardHero(for: profile)

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(nameLine(for: profile))
                        .font(.title3.bold())

                    Spacer(minLength: 0)

                    tag(text: "\(profile.compatibilityScore)%", accent: .orange)

                    if showDistance, let distanceKm = profile.distanceKm {
                        tag(text: "\(distanceKm) km")
                    }
                }

                if showInterests, !profile.commonInterests.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(profile.commonInterests, id: \.self) { interest in
                                tag(text: interest)
                            }
                        }
                    }
                } else {
                    Text(L10n.tr("home.commonInterests.empty"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(cardSurfaceFill, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(cardSurfaceStroke, lineWidth: 1)
        )
        .overlay(swipeFeedbackOverlay)
    }

    @ViewBuilder
    private func cardHero(for profile: SwipeProfile) -> some View {
        let photoIndex = currentPhotoIndex(for: profile)
        let photoURL = profile.photos.indices.contains(photoIndex) ? profile.photos[photoIndex] : nil

        ZStack(alignment: .top) {
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color.orange.opacity(0.55), Color.red.opacity(0.60)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                if let photoURL {
                    AsyncImage(url: photoURL) { phase in
                        switch phase {
                        case let .success(image):
                            image
                                .resizable()
                                .scaledToFill()
                                .transition(.opacity.combined(with: .scale(scale: 0.985)))
                        default:
                            placeholderAvatar
                        }
                    }
                    .id(photoURL.absoluteString)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                } else {
                    placeholderAvatar
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }

                LinearGradient(
                    colors: [.clear, .black.opacity(0.08), .black.opacity(0.52)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            }
            .overlay(photoTapZones(for: profile))
            .animation(.easeInOut(duration: 0.24), value: photoIndex)

            if profile.photos.count > 1 {
                photoIndicator(for: profile)
                    .padding(.horizontal, 14)
                    .padding(.top, 14)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 368)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func photoTapZones(for profile: SwipeProfile) -> some View {
        HStack(spacing: 0) {
            Button {
                shiftPhoto(for: profile, delta: -1)
            } label: {
                Color.clear
            }
            .buttonStyle(.plain)
            .disabled(profile.photos.count <= 1)

            Button {
                shiftPhoto(for: profile, delta: 1)
            } label: {
                Color.clear
            }
            .buttonStyle(.plain)
            .disabled(profile.photos.count <= 1)
        }
    }

    private func photoIndicator(for profile: SwipeProfile) -> some View {
        HStack(spacing: 6) {
            ForEach(Array(profile.photos.enumerated()), id: \.offset) { offset, _ in
                Capsule(style: .continuous)
                    .fill(offset == currentPhotoIndex(for: profile) ? .white : .white.opacity(0.34))
                    .frame(width: offset == currentPhotoIndex(for: profile) ? 22 : 10, height: 4)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.black.opacity(0.18), in: Capsule(style: .continuous))
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

    private var swipeFeedbackOverlay: some View {
        let likeOpacity = min(max(dragOffset.width / swipeThreshold, 0), 1) * 0.14
        let passOpacity = min(max(-dragOffset.width / swipeThreshold, 0), 1) * 0.10

        return RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [
                        Color.white.opacity(passOpacity),
                        Color.clear,
                        Color.orange.opacity(likeOpacity)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .allowsHitTesting(false)
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

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                guard !isAnimatingDecision, !isSubmittingSwipe else { return }
                dragOffset = CGSize(width: value.translation.width, height: value.translation.height * 0.2)
            }
            .onEnded { value in
                guard !isAnimatingDecision, !isSubmittingSwipe else { return }

                let projectedWidth = value.predictedEndTranslation.width
                let resolvedWidth = abs(projectedWidth) > abs(value.translation.width) ? projectedWidth : value.translation.width

                if abs(resolvedWidth) > swipeThreshold {
                    commitDecision(resolvedWidth > 0 ? .right : .left)
                } else {
                    withAnimation(.spring(response: 0.36, dampingFraction: 0.78)) {
                        dragOffset = .zero
                    }
                }
            }
    }

    private func commitDecision(_ direction: DecisionDirection) {
        guard let profile = profiles.first, !isAnimatingDecision, !isSubmittingSwipe else { return }
        animateDecision(direction, for: profile)
    }

    private func animateDecision(_ direction: DecisionDirection, for profile: SwipeProfile) {
        isAnimatingDecision = true
        swipeErrorMessage = nil

        let targetX: CGFloat = direction == .left ? -520 : 520
        withAnimation(.spring(response: 0.30, dampingFraction: 0.82)) {
            dragOffset = CGSize(width: targetX, height: direction == .left ? -18 : 18)
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
                    id: $0.id,
                    name: $0.name,
                    age: $0.age,
                    photos: $0.photos,
                    compatibilityScore: $0.compatibilityScore,
                    distanceKm: $0.distance,
                    commonInterests: $0.commonInterests,
                    relationshipState: $0.relationshipState
                )
            }

            let validIDs = Set(profiles.map(\.id))
            activePhotoIndices = activePhotoIndices.filter { validIDs.contains($0.key) }
        } catch {
            profiles = []
            swipeErrorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func submitDecision(_ direction: DecisionDirection, for profile: SwipeProfile) async {
        guard !profile.id.isEmpty else { return }

        isSubmittingSwipe = true
        defer { isSubmittingSwipe = false }

        do {
            let decision: SwipeDecisionDTO = direction == .right ? .liked : .passed
            let matchedThread = try await services.backend.submitSwipe(
                otherUserId: profile.id,
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
                relationshipState: dto.relationshipState,
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

    private func currentPhotoIndex(for profile: SwipeProfile) -> Int {
        let stored = activePhotoIndices[profile.id] ?? 0
        guard !profile.photos.isEmpty else { return 0 }
        return min(max(stored, 0), profile.photos.count - 1)
    }

    private func shiftPhoto(for profile: SwipeProfile, delta: Int) {
        guard profile.photos.count > 1 else { return }

        let currentIndex = currentPhotoIndex(for: profile)
        let nextIndex = min(max(currentIndex + delta, 0), profile.photos.count - 1)
        guard nextIndex != currentIndex else { return }

        withAnimation(.easeInOut(duration: 0.20)) {
            activePhotoIndices[profile.id] = nextIndex
        }
    }

    private func scale(for index: Int, dragProgress: CGFloat) -> CGFloat {
        switch index {
        case 0:
            return 1
        case 1:
            return 0.95 + (dragProgress * 0.03)
        default:
            return 0.91 + (dragProgress * 0.02)
        }
    }

    private func yOffset(for index: Int, dragProgress: CGFloat) -> CGFloat {
        switch index {
        case 0:
            return 0
        case 1:
            return 20 - (dragProgress * 12)
        default:
            return 38 - (dragProgress * 16)
        }
    }

    private func opacity(for index: Int) -> Double {
        switch index {
        case 0:
            return 1
        case 1:
            return 0.92
        default:
            return 0.82
        }
    }

    private func rotationDegrees(forTopCard isTopCard: Bool) -> Double {
        guard isTopCard else { return 0 }
        let clamped = max(-18, min(18, dragOffset.width / 18))
        return Double(clamped)
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
        colorScheme == .dark ? .black.opacity(0.18) : .black.opacity(0.08)
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
}
