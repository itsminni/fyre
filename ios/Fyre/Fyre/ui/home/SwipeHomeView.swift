//
//  SwipeHomeView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI
import UIKit

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
    let gender: String?
    let orientation: String?
    let intent: String?
    let smokes: Bool?
    let drinks: Bool?
    let instagramTag: String?
    let spotifyTag: String?
    let relationshipState: RelationshipStateDTO
}

private struct DiscoverProfileDetailsView: View {
    let profile: SwipeProfile
    let genderLabel: String?
    let orientationLabel: String?
    let intentLabel: String?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(profile.name), \(profile.age)")
                            .font(.largeTitle.bold())

                        if let city = profile.city {
                            Label(city, systemImage: "mappin.and.ellipse")
                                .font(.headline)
                                .foregroundStyle(.secondary)
                        }
                    }

                    infoBlock(title: L10n.tr("discover.details.section.info")) {
                        infoRow(L10n.tr("profile.gender"), value: genderLabel)
                        infoRow(L10n.tr("profile.orientation"), value: orientationLabel)
                        infoRow(L10n.tr("profile.intent"), value: intentLabel)
                        infoRow(L10n.tr("profile.smokes"), value: yesNo(profile.smokes))
                        infoRow(L10n.tr("profile.drinks"), value: yesNo(profile.drinks))
                        infoRow(L10n.tr("profile.instagramTag"), value: profile.instagramTag)
                        infoRow(L10n.tr("profile.spotifyTag"), value: profile.spotifyTag)
                    }

                    if let bio = normalized(profile.bio) {
                        infoBlock(title: L10n.tr("discover.details.section.bio")) {
                            Text(bio)
                                .font(.body)
                                .foregroundStyle(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }

                    if !profile.commonInterests.isEmpty {
                        infoBlock(title: L10n.tr("discover.details.section.interests")) {
                            FlowChips(items: profile.commonInterests)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 28)
            }
            .background(Color(uiColor: .systemBackground))
            .navigationTitle(L10n.tr("discover.details.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L10n.tr("common.done")) {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    @ViewBuilder
    private func infoBlock<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)

            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder
    private func infoRow(_ label: String, value: String?) -> some View {
        if let value = normalized(value) {
            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 14)
                Text(value)
                    .multilineTextAlignment(.trailing)
                    .fontWeight(.semibold)
            }
        }
    }

    private func yesNo(_ value: Bool?) -> String? {
        guard let value else { return nil }
        return value ? L10n.tr("discover.details.value.yes") : L10n.tr("discover.details.value.no")
    }

    private func normalized(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }
}

private struct FlowChips: View {
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { item in
                        Text(item)
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Color.primary.opacity(0.10), in: Capsule(style: .continuous))
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private var rows: [[String]] {
        var rows: [[String]] = [[]]
        var currentCount = 0

        for item in items {
            let estimatedWidth = item.count + 5
            if currentCount + estimatedWidth > 26 {
                rows.append([item])
                currentCount = estimatedWidth
            } else {
                rows[rows.count - 1].append(item)
                currentCount += estimatedWidth
            }
        }

        return rows.filter { !$0.isEmpty }
    }
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
    @State private var activePhotoIndices: [String: Int] = [:]
    @State private var selectedDetailsProfile: SwipeProfile?

    var onMatchedThread: (ChatThread) -> Void = { _ in }

    private let photoSwipeThreshold: CGFloat = 44

    var body: some View {
        NavigationStack {
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
                        swipeDeck(in: geometry.size, safeAreaInsets: geometry.safeAreaInsets)
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .ignoresSafeArea(.container, edges: discoveryIgnoredSafeAreaEdges)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .background(discoveryScreenBackground)
            .toolbar(.hidden, for: .navigationBar)
            .toolbarBackground(discoveryBarBackground, for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
        }
        .onAppear {
            Task {
                await loadProfiles()
            }
        }
        .task(id: discoverFilterID) {
            await loadProfiles()
        }
        .fullScreenCover(item: $selectedDetailsProfile) { profile in
            DiscoverProfileDetailsView(
                profile: profile,
                genderLabel: genderLabel(for: profile.gender),
                orientationLabel: orientationLabel(for: profile.orientation),
                intentLabel: intentLabel(for: profile.intent)
            )
        }
    }

    @ViewBuilder
    private func swipeDeck(in size: CGSize, safeAreaInsets: EdgeInsets) -> some View {
        if let profile = profiles.first {
            ZStack(alignment: .bottom) {
                fullscreenStage(for: profile, in: size, safeAreaInsets: safeAreaInsets)
                    .offset(x: dragOffset.width, y: dragOffset.height * 0.14)
                    .rotationEffect(.degrees(rotationDegrees()))
                    .shadow(color: stageShadow, radius: 16, y: 8)
                    .allowsHitTesting(!isAnimatingDecision && !isSubmittingSwipe)
                    .gesture(dragGesture(for: profile))
                    .animation(.spring(response: 0.34, dampingFraction: 0.86), value: dragOffset)

                if selectedDetailsProfile == nil {
                    floatingControlsOverlay(safeAreaBottom: deviceBottomSafeAreaInset)
                }
            }
            .background(Color.black)
        } else {
            Color.clear
        }
    }

    private func fullscreenStage(for profile: SwipeProfile, in size: CGSize, safeAreaInsets: EdgeInsets) -> some View {
        let photoIndex = currentPhotoIndex(for: profile)
        let photoURL = profile.photos.indices.contains(photoIndex) ? profile.photos[photoIndex] : nil
        let photoLayerHeight = discoveryPhotoLayerHeight(in: size, safeAreaInsets: safeAreaInsets)

        return ZStack(alignment: .bottom) {
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
                    colors: [.clear, .black.opacity(0.18), .black.opacity(0.62)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .allowsHitTesting(false)
            }
            .frame(width: size.width, height: photoLayerHeight)
            .frame(width: size.width, height: size.height, alignment: .top)
            .ignoresSafeArea(.container, edges: discoveryIgnoredSafeAreaEdges)

            photoPositionIndicator(currentIndex: photoIndex, count: profile.photos.count)
                .padding(.horizontal, 34)
                .padding(.top, safeAreaInsets.top + 12)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .allowsHitTesting(false)

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(nameLine(for: profile))
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(2)

                    Spacer(minLength: 0)

                    Button {
                        selectedDetailsProfile = profile
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 42, height: 42)
                            .background(.ultraThinMaterial, in: Circle())
                            .overlay(
                                Circle()
                                    .stroke(Color.white.opacity(0.22), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.tr("discover.details.open.accessibility"))
                }

                if let city = nonEmpty(profile.city) {
                    Label(city, systemImage: "mappin.and.ellipse")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.92))
                }

                HStack(spacing: 8) {
                    overlayTag("\(profile.compatibilityScore)%", accent: .orange)

                    if showDistance, let distanceKm = profile.distanceKm {
                        overlayTag("\(distanceKm) km")
                    }

                    if showInterests, !profile.commonInterests.isEmpty {
                        overlayTag(profile.commonInterests[0])
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, max(112, deviceBottomSafeAreaInset + 82))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: size.width, height: size.height)
        .animation(.easeInOut(duration: 0.22), value: photoIndex)
    }

    @ViewBuilder
    private func photoPositionIndicator(currentIndex: Int, count: Int) -> some View {
        if count > 1 {
            HStack(spacing: 6) {
                ForEach(0..<count, id: \.self) { index in
                    Circle()
                        .fill(index == currentIndex ? Color.white : Color.white.opacity(0.34))
                        .frame(width: index == currentIndex ? 7 : 6, height: index == currentIndex ? 7 : 6)
                        .shadow(color: .black.opacity(0.24), radius: 2, y: 1)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.black.opacity(0.18), in: Capsule(style: .continuous))
        }
    }

    private var controlsRow: some View {
        HStack(spacing: 14) {
            Button {
                commitDecision(.left)
            } label: {
                Image(systemName: "forward.fill")
                    .font(.title3.weight(.bold))
                    .scaleEffect(x: -1, y: 1)
                    .foregroundStyle(.white.opacity(0.95))
                    .frame(width: 52, height: 52)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(
                        Circle()
                            .stroke(controlSurfaceStroke, lineWidth: 1)
                    )
                    .shadow(color: controlShadow, radius: 7, y: 3)
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
                    .frame(width: 52, height: 52)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(
                        Circle()
                            .fill(Color.orange.opacity(colorScheme == .dark ? 0.16 : 0.13))
                    )
                    .overlay(
                        Circle()
                            .stroke(primaryControlStroke, lineWidth: 1)
                    )
                    .shadow(color: Color.orange.opacity(colorScheme == .dark ? 0.20 : 0.14), radius: 8, y: 3)
                    .scaleEffect(dragOffset.width > 0 ? 1.05 : 1)
            }
            .accessibilityLabel(L10n.tr("app.name"))
            .disabled(isAnimatingDecision || isSubmittingSwipe || profiles.isEmpty)
        }
        .animation(.spring(response: 0.24, dampingFraction: 0.82), value: dragOffset)
        .offset(y: -14)
    }

    private func floatingControlsOverlay(safeAreaBottom: CGFloat) -> some View {
        VStack(spacing: 10) {
            controlsRow

            if let swipeErrorMessage {
                Text(swipeErrorMessage)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.42), in: Capsule(style: .continuous))
            }
        }
        .padding(.bottom, max(2, safeAreaBottom))
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

    private func dragGesture(for profile: SwipeProfile) -> some Gesture {
        DragGesture(minimumDistance: 10)
            .onEnded { value in
                guard !isAnimatingDecision, !isSubmittingSwipe else { return }
                guard abs(value.translation.width) > abs(value.translation.height) else { return }

                let projectedWidth = value.predictedEndTranslation.width
                let resolvedWidth = abs(projectedWidth) > abs(value.translation.width)
                    ? projectedWidth
                    : value.translation.width

                if resolvedWidth <= -photoSwipeThreshold {
                    shiftPhoto(for: profile, delta: 1)
                } else if resolvedWidth >= photoSwipeThreshold {
                    shiftPhoto(for: profile, delta: -1)
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
            selectedDetailsProfile = nil
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
            let visibleDTOs = dtos.filter { dto in
                let excludeSmokers = store.currentUser?.excludeSmokers ?? false
                let excludeDrinkers = store.currentUser?.excludeDrinkers ?? false
                return !(excludeSmokers && (dto.smokes ?? false))
                    && !(excludeDrinkers && (dto.drinks ?? false))
            }

            profiles = visibleDTOs.map {
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
                    gender: nonEmpty($0.gender),
                    orientation: nonEmpty($0.orientation),
                    intent: nonEmpty($0.intent),
                    smokes: $0.smokes,
                    drinks: $0.drinks,
                    instagramTag: nonEmpty($0.instagramTag),
                    spotifyTag: nonEmpty($0.spotifyTag),
                    relationshipState: $0.relationshipState
                )
            }

            let validIDs = Set(profiles.map(\.id))
            activePhotoIndices = activePhotoIndices.filter { validIDs.contains($0.key) }

            if let selectedDetailsProfile, !validIDs.contains(selectedDetailsProfile.id) {
                self.selectedDetailsProfile = nil
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
                notificationsEnabled: dto.notificationsEnabled,
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
            return L10n.tr("profile.intent.relationship")
        case "friendship":
            return L10n.tr("profile.intent.friendship")
        case "casual":
            return L10n.tr("profile.intent.casual")
        case "networking":
            return "Networking"
        case "notsure", "not_sure":
            return L10n.tr("profile.intent.notSure")
        default:
            return rawValue
        }
    }

    private func genderLabel(for rawValue: String?) -> String? {
        guard let normalized = nonEmpty(rawValue)?.lowercased() else {
            return nil
        }

        switch normalized {
        case "male":
            return L10n.tr("profile.gender.male")
        case "female":
            return L10n.tr("profile.gender.female")
        case "nonbinary", "non_binary", "non-binary":
            return L10n.tr("profile.gender.nonBinary")
        case "other":
            return L10n.tr("profile.gender.other")
        default:
            return rawValue
        }
    }

    private func orientationLabel(for rawValue: String?) -> String? {
        guard let normalized = nonEmpty(rawValue)?.lowercased() else {
            return nil
        }

        switch normalized {
        case "straight":
            return L10n.tr("profile.orientation.straight")
        case "gay":
            return L10n.tr("profile.orientation.gay")
        case "lesbian":
            return L10n.tr("profile.orientation.lesbian")
        case "bisexual":
            return L10n.tr("profile.orientation.bisexual")
        case "pansexual":
            return L10n.tr("profile.orientation.pansexual")
        case "other":
            return L10n.tr("profile.orientation.other")
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

    private var controlSurfaceStroke: Color {
        colorScheme == .dark ? .white.opacity(0.12) : .black.opacity(0.10)
    }

    private var controlShadow: Color {
        colorScheme == .dark ? .black.opacity(0.16) : .black.opacity(0.08)
    }

    private var primaryControlStroke: Color {
        colorScheme == .dark ? .orange.opacity(0.28) : .orange.opacity(0.34)
    }

    private var discoveryBarBackground: Color {
        Color(uiColor: colorScheme == .dark ? .secondarySystemBackground : .secondarySystemGroupedBackground)
    }

    private var discoveryScreenBackground: Color {
        profiles.isEmpty ? Color(uiColor: .systemGroupedBackground) : .black
    }

    private var discoveryIgnoredSafeAreaEdges: Edge.Set {
        if #available(iOS 26.0, *) {
            return .all
        }

        return [.top, .bottom]
    }

    private func discoveryPhotoLayerHeight(in size: CGSize, safeAreaInsets: EdgeInsets) -> CGFloat {
        let bottomExtension = max(safeAreaInsets.bottom, deviceBottomSafeAreaInset)
        if #available(iOS 26.0, *) {
            return size.height + safeAreaInsets.top + bottomExtension
        }

        return size.height + bottomExtension
    }

    private var deviceBottomSafeAreaInset: CGFloat {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .safeAreaInsets.bottom ?? 0
    }

    private func nameLine(for profile: SwipeProfile) -> String {
        if showAge {
            return "\(profile.name), \(profile.age)"
        }
        return profile.name
    }

    private var discoverFilterID: String {
        guard let user = store.currentUser else { return "discover" }
        let genders = user.resolvedPreferredGenders.map(\.rawValue).joined(separator: ",")
        return [
            genders,
            "\(user.resolvedMinPreferredAge)",
            "\(user.resolvedMaxPreferredAge)",
            user.normalizedMaxDistanceKm.map(String.init) ?? "none",
            "\(user.excludeSmokers ?? false)",
            "\(user.excludeDrinkers ?? false)",
            user.city ?? "",
            user.latitude.map { String($0) } ?? "",
            user.longitude.map { String($0) } ?? ""
        ].joined(separator: "|")
    }
}
