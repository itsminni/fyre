//
//  SwipeHomeView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI

private struct SwipeProfile: Identifiable, Equatable {
    let id: String
    let name: String
    let age: Int
    let photos: [URL]
    let compatibilityScore: Int
    let distanceKm: Int?
    let commonInterests: [String]
    let bio: String
    let city: String?
    let intent: String?
    let smokes: Bool?
    let drinks: Bool?
    let relationshipState: RelationshipStateDTO

    var hasDetailContent: Bool {
        !normalizedBio.isEmpty || city != nil || intent != nil || smokes != nil || drinks != nil || !commonInterests.isEmpty
    }

    private var normalizedBio: String {
        bio.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct SwipeHomeView: View {
    private enum DecisionDirection {
        case left
        case right
    }

    private enum DragAxis {
        case horizontal
        case vertical
    }

    @Environment(AppServices.self) private var services
    @Environment(UserStore.self) private var store
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("settings_show_age") private var showAge = true
    @AppStorage("settings_show_distance") private var showDistance = true
    @AppStorage("settings_show_interests") private var showInterests = true
    @State private var profiles: [SwipeProfile] = []
    @State private var dragOffset: CGSize = .zero
    @State private var detailsDragOffset: CGFloat = 0
    @State private var dragAxis: DragAxis?
    @State private var isAnimatingDecision = false
    @State private var isSubmittingSwipe = false
    @State private var swipeErrorMessage: String?
    @State private var activePhotoIndices: [String: Int] = [:]
    @State private var detailsExpandedProfileID: String?

    var onMatchedThread: (ChatThread) -> Void = { _ in }

    private let swipeThreshold: CGFloat = 118
    private let detailsToggleThreshold: CGFloat = 90

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Group {
                    if profiles.isEmpty {
                        ContentUnavailableView(
                            L10n.tr("home.empty.title"),
                            systemImage: "checkmark.circle",
                            description: Text(L10n.tr("home.empty.description"))
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        GeometryReader { geometry in
                            swipeDeck(in: geometry.size)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }

                if !profiles.isEmpty || swipeErrorMessage != nil {
                    actionBar
                }
            }
            .navigationTitle(L10n.tr("home.navigationTitle"))
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

    private var actionBar: some View {
        VStack(spacing: 10) {
            controlsRow

            if let swipeErrorMessage {
                Text(swipeErrorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity)
        .background(actionBarBackground)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(actionBarSeparator)
                .frame(height: 1)
        }
    }

    @ViewBuilder
    private func swipeDeck(in size: CGSize) -> some View {
        if let profile = profiles.first {
            ZStack(alignment: .bottom) {
                fullscreenStage(for: profile, in: size)
                    .offset(x: dragOffset.width, y: dragOffset.height * 0.14)
                    .rotationEffect(.degrees(rotationDegrees()))
                    .shadow(color: stageShadow, radius: 16, y: 8)
                    .allowsHitTesting(!isAnimatingDecision && !isSubmittingSwipe)
                    .gesture(dragGesture(for: profile))
                    .animation(.spring(response: 0.34, dampingFraction: 0.86), value: dragOffset)

                if shouldShowDetails(for: profile) {
                    detailsSheet(for: profile, containerHeight: size.height)
                }
            }
            .background(Color.black)
            .clipped()
        } else {
            Color.clear
        }
    }

    private func fullscreenStage(for profile: SwipeProfile, in size: CGSize) -> some View {
        let photoIndex = currentPhotoIndex(for: profile)
        let photoURL = profile.photos.indices.contains(photoIndex) ? profile.photos[photoIndex] : nil

        return ZStack(alignment: .top) {
            ZStack {
                if let photoURL {
                    AsyncImage(url: photoURL) { phase in
                        switch phase {
                        case let .success(image):
                            image
                                .resizable()
                                .scaledToFill()
                                .transition(.opacity)
                        default:
                            placeholderAvatar
                        }
                    }
                    .id(photoURL.absoluteString)
                } else {
                    placeholderAvatar
                }

                LinearGradient(
                    colors: [.clear, .black.opacity(0.20), .black.opacity(0.80)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .allowsHitTesting(false)
            }
            .frame(width: size.width, height: size.height)
            .overlay(photoTapZones(for: profile))

            VStack(spacing: 0) {
                VStack(spacing: 10) {
                    if profile.photos.count > 1 {
                        photoIndicator(for: profile)
                    }

                    HStack(spacing: 8) {
                        if profile.photos.count > 1 {
                            overlayTag("\(photoIndex + 1)/\(profile.photos.count)")
                        }
                        overlayTag("\(profile.compatibilityScore)%", accent: .orange)
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)

                Spacer()

                VStack(alignment: .leading, spacing: 12) {
                    Text(nameLine(for: profile))
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(2)

                    if let city = nonEmpty(profile.city) {
                        Label(city, systemImage: "mappin.and.ellipse")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.white.opacity(0.88))
                    }

                    HStack(spacing: 8) {
                        if showDistance, let distanceKm = profile.distanceKm {
                            overlayTag("\(distanceKm) km")
                        }

                        if showInterests, !profile.commonInterests.isEmpty {
                            overlayTag(profile.commonInterests[0])
                        }
                    }

                    if profile.photos.count > 1 {
                        photoPillRail(for: profile)
                    }

                    if shouldShowDetails(for: profile) {
                        detailPeek(for: profile)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 22)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .overlay(swipeFeedbackOverlay)
        .animation(.easeInOut(duration: 0.22), value: photoIndex)
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
        .background(.black.opacity(0.20), in: Capsule(style: .continuous))
    }

    private func photoPillRail(for profile: SwipeProfile) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(profile.photos.enumerated()), id: \.offset) { offset, _ in
                    let isActive = offset == currentPhotoIndex(for: profile)
                    Button {
                        activePhotoIndices[profile.id] = offset
                    } label: {
                        Text("Foto \(offset + 1)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(isActive ? .black : .white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(isActive ? Color.white.opacity(0.96) : Color.black.opacity(0.28))
                            )
                            .overlay(
                                Capsule(style: .continuous)
                                    .stroke(Color.white.opacity(isActive ? 0.15 : 0.30), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func detailPeek(for profile: SwipeProfile) -> some View {
        let expanded = isDetailsExpanded(for: profile)

        return Button {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                detailsExpandedProfileID = expanded ? nil : profile.id
                detailsDragOffset = 0
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: expanded ? "chevron.down.circle.fill" : "chevron.up.circle.fill")
                Text(expanded ? "Chiudi dettagli" : "Swipe up per foto e dettagli")
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.black.opacity(0.30), in: Capsule(style: .continuous))
            .overlay(
                Capsule(style: .continuous)
                    .stroke(Color.white.opacity(0.26), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .opacity(shouldShowDetails(for: profile) ? 1 : 0)
    }

    private func detailsSheet(for profile: SwipeProfile, containerHeight: CGFloat) -> some View {
        let isExpanded = isDetailsExpanded(for: profile)
        let panelHeight = min(max(containerHeight * 0.58, 300), 470)
        let collapsedOffset = panelHeight - 88
        let baseOffset = isExpanded ? 0 : collapsedOffset
        let interactiveOffset = isExpanded ? max(0, detailsDragOffset) : min(0, detailsDragOffset)

        return VStack(alignment: .leading, spacing: 14) {
            Capsule(style: .continuous)
                .fill(Color.primary.opacity(0.25))
                .frame(width: 42, height: 5)
                .frame(maxWidth: .infinity)

            HStack(alignment: .firstTextBaseline) {
                Text("Dettagli profilo")
                    .font(.headline)

                Spacer()

                Text(photoCountLabel(for: profile.photos.count))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    if profile.photos.count > 1 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Galleria")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.secondary)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(Array(profile.photos.enumerated()), id: \.offset) { offset, url in
                                        Button {
                                            activePhotoIndices[profile.id] = offset
                                        } label: {
                                            ZStack(alignment: .bottomLeading) {
                                                AsyncImage(url: url) { phase in
                                                    switch phase {
                                                    case let .success(image):
                                                        image
                                                            .resizable()
                                                            .scaledToFill()
                                                    default:
                                                        placeholderAvatar
                                                    }
                                                }
                                                .frame(width: 110, height: 146)
                                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                                                Text("Foto \(offset + 1)")
                                                    .font(.caption2.weight(.semibold))
                                                    .foregroundStyle(.white)
                                                    .padding(.horizontal, 8)
                                                    .padding(.vertical, 5)
                                                    .background(.black.opacity(0.45), in: Capsule(style: .continuous))
                                                    .padding(8)
                                            }
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                    .stroke(
                                                        offset == currentPhotoIndex(for: profile)
                                                            ? Color.orange.opacity(0.9)
                                                            : Color.primary.opacity(0.10),
                                                        lineWidth: offset == currentPhotoIndex(for: profile) ? 2 : 1
                                                    )
                                            )
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                    }

                    if let bioText = nonEmpty(profile.bio) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Bio")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text(bioText)
                                .font(.body)
                                .foregroundStyle(.primary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    let pills = detailPills(for: profile)
                    if !pills.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Pillole")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.secondary)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(alignment: .top, spacing: 8) {
                                    ForEach(Array(pills.enumerated()), id: \.offset) { _, pill in
                                        detailPill(pill)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.bottom, 24)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .frame(maxWidth: .infinity)
        .frame(height: panelHeight, alignment: .top)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Color.primary.opacity(0.12), lineWidth: 1)
        )
        .offset(y: baseOffset + interactiveOffset)
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: detailsExpandedProfileID)
        .animation(.spring(response: 0.24, dampingFraction: 0.9), value: detailsDragOffset)
    }

    private func detailPill(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.primary.opacity(0.08), in: Capsule(style: .continuous))
    }

    private func detailPills(for profile: SwipeProfile) -> [String] {
        var pills: [String] = []

        if let intentLabel = intentLabel(for: profile.intent) {
            pills.append(intentLabel)
        }

        if let smokes = profile.smokes {
            pills.append(smokes ? "Fumo: si" : "Fumo: no")
        }

        if let drinks = profile.drinks {
            pills.append(drinks ? "Beve: si" : "Beve: no")
        }

        if showInterests, !profile.commonInterests.isEmpty {
            pills.append(contentsOf: profile.commonInterests.prefix(6))
        }

        return pills
    }

    private func overlayTag(_ text: String, accent: Color? = nil) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(accent ?? .white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule(style: .continuous)
                    .fill((accent == nil ? Color.black : accent!).opacity(accent == nil ? 0.34 : 0.20))
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(Color.white.opacity(0.22), lineWidth: 1)
            )
    }

    private var placeholderAvatar: some View {
        ZStack {
            LinearGradient(
                colors: [Color.orange.opacity(0.45), Color.red.opacity(0.40)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Image(systemName: "person.fill")
                .font(.system(size: 74))
                .foregroundStyle(.white.opacity(0.9))
        }
    }

    private var swipeFeedbackOverlay: some View {
        let likeOpacity = min(max(dragOffset.width / swipeThreshold, 0), 1) * 0.14
        let passOpacity = min(max(-dragOffset.width / swipeThreshold, 0), 1) * 0.10

        return Rectangle()
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

    private func dragGesture(for profile: SwipeProfile) -> some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                guard !isAnimatingDecision, !isSubmittingSwipe else { return }

                if dragAxis == nil {
                    dragAxis = abs(value.translation.width) >= abs(value.translation.height)
                        ? .horizontal
                        : .vertical
                }

                switch dragAxis {
                case .horizontal:
                    detailsDragOffset = 0
                    dragOffset = CGSize(width: value.translation.width, height: value.translation.height * 0.18)
                case .vertical:
                    guard shouldShowDetails(for: profile) else { return }
                    dragOffset = .zero

                    if isDetailsExpanded(for: profile) {
                        detailsDragOffset = max(0, value.translation.height)
                    } else {
                        detailsDragOffset = min(0, value.translation.height)
                    }
                case .none:
                    break
                }
            }
            .onEnded { value in
                guard !isAnimatingDecision, !isSubmittingSwipe else { return }
                defer { dragAxis = nil }

                switch dragAxis {
                case .horizontal:
                    let projectedWidth = value.predictedEndTranslation.width
                    let resolvedWidth = abs(projectedWidth) > abs(value.translation.width) ? projectedWidth : value.translation.width

                    if abs(resolvedWidth) > swipeThreshold {
                        commitDecision(resolvedWidth > 0 ? .right : .left)
                    } else {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) {
                            dragOffset = .zero
                        }
                    }
                case .vertical:
                    guard shouldShowDetails(for: profile) else {
                        withAnimation(.spring(response: 0.26, dampingFraction: 0.9)) {
                            detailsDragOffset = 0
                        }
                        return
                    }

                    withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                        if isDetailsExpanded(for: profile) {
                            if value.translation.height > detailsToggleThreshold {
                                detailsExpandedProfileID = nil
                            }
                        } else if value.translation.height < -detailsToggleThreshold {
                            detailsExpandedProfileID = profile.id
                        }
                        detailsDragOffset = 0
                    }
                case .none:
                    withAnimation(.spring(response: 0.30, dampingFraction: 0.84)) {
                        dragOffset = .zero
                        detailsDragOffset = 0
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

        let targetX: CGFloat = direction == .left ? -560 : 560
        withAnimation(.spring(response: 0.30, dampingFraction: 0.82)) {
            dragOffset = CGSize(width: targetX, height: direction == .left ? -20 : 20)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            if !profiles.isEmpty {
                profiles.removeFirst()
            }
            dragOffset = .zero
            detailsDragOffset = 0
            detailsExpandedProfileID = nil
            dragAxis = nil
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
                    bio: $0.bio,
                    city: nonEmpty($0.city),
                    intent: nonEmpty($0.intent),
                    smokes: $0.smokes,
                    drinks: $0.drinks,
                    relationshipState: $0.relationshipState
                )
            }

            let validIDs = Set(profiles.map(\.id))
            activePhotoIndices = activePhotoIndices.filter { validIDs.contains($0.key) }

            if let detailsExpandedProfileID, !validIDs.contains(detailsExpandedProfileID) {
                self.detailsExpandedProfileID = nil
            }
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
            let thread = ChatThread(
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
            RecentChatThreadStore.upsert(thread)
            NotificationCenter.default.post(name: .fyreThreadsDidChange, object: thread)
            onMatchedThread(thread)
        } catch {
#if DEBUG
            swipeErrorMessage = error.localizedDescription
#else
            swipeErrorMessage = L10n.tr("home.swipe.error")
#endif
            await loadProfiles()
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

    private func shouldShowDetails(for profile: SwipeProfile) -> Bool {
        profile.photos.count > 1 || profile.hasDetailContent
    }

    private func isDetailsExpanded(for profile: SwipeProfile) -> Bool {
        detailsExpandedProfileID == profile.id
    }

    private func nonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    private func intentLabel(for rawValue: String?) -> String? {
        guard let normalized = nonEmpty(rawValue)?.lowercased() else {
            return nil
        }

        switch normalized {
        case "relationship":
            return "Relazione"
        case "friendship":
            return "Amicizia"
        case "casual":
            return "Casual"
        case "networking":
            return "Networking"
        case "notsure", "not_sure":
            return "Esplorazione"
        default:
            return rawValue
        }
    }

    private func rotationDegrees() -> Double {
        let clamped = max(-18, min(18, dragOffset.width / 18))
        return Double(clamped)
    }

    private var stageShadow: Color {
        colorScheme == .dark ? .black.opacity(0.24) : .black.opacity(0.14)
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

    private var actionBarBackground: Color {
        colorScheme == .dark
            ? Color(uiColor: .secondarySystemBackground).opacity(0.98)
            : Color(uiColor: .systemBackground).opacity(0.96)
    }

    private var actionBarSeparator: Color {
        colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.08)
    }

    private func nameLine(for profile: SwipeProfile) -> String {
        if showAge {
            return "\(profile.name), \(profile.age)"
        }
        return profile.name
    }

    private func photoCountLabel(for count: Int) -> String {
        switch count {
        case 0:
            return "Nessuna foto"
        case 1:
            return "1 foto"
        default:
            return "\(count) foto"
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
}
