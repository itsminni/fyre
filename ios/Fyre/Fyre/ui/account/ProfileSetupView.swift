//
//  ProfileSetupView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 20/03/26.
//

import SwiftUI
import PhotosUI
import UIKit

struct ProfileSetupView: View {
    @Environment(UserStore.self) private var store

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var city = ""
    @State private var birthDate = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    @State private var gender: UserGender = .male
    @State private var orientation: UserOrientation = .straight
    @State private var bio = ""
    @State private var intent: UserIntent = .relationship
    @State private var interests = ""
    @State private var instagramTag = ""
    @State private var spotifyTag = ""
    @State private var preferredGenders = Set(UserStore.defaultPreferredGenders)
    @State private var minPreferredAge = 20
    @State private var maxPreferredAge = 32
    @State private var maxDistanceKm: Int? = 50
    @State private var smokes = false
    @State private var drinks = false
    @State private var pickedPhotoItem: PhotosPickerItem?
    @State private var pickedAdditionalPhotoItems: [PhotosPickerItem] = []
    @State private var pendingAvatarCrop: PendingProfileAvatarCrop?
    @State private var errorMessage: String?
    @State private var isSaving = false
    @State private var showEventRemovalAlert = false
    @State private var hasHydratedFromUser = false

    private let maxProfilePhotoCount = 6

    var body: some View {
        NavigationStack {
            Form {
                Section(L10n.tr("profile.photo.section")) {
                    HStack(spacing: 14) {
                        profileAvatar

                        PhotosPicker(selection: $pickedPhotoItem, matching: .images) {
                            Text(L10n.tr("profile.photo.action"))
                        }
                    }
                }

                Section(L10n.tr("profile.photo.galleryTitle")) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(L10n.tr("profile.photo.galleryHint"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)

                        PhotosPicker(
                            selection: $pickedAdditionalPhotoItems,
                            maxSelectionCount: max(1, remainingProfilePhotoCapacity),
                            selectionBehavior: .ordered,
                            matching: .images
                        ) {
                            Label(L10n.tr("profile.photo.addAction"), systemImage: "plus.circle.fill")
                        }
                        .disabled(currentProfilePhotoDataItems.count >= maxProfilePhotoCount)

                        if currentProfilePhotoDataItems.isEmpty {
                            Text(L10n.tr("profile.photo.galleryEmpty"))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        } else {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(Array(currentProfilePhotoDataItems.enumerated()), id: \.offset) { index, data in
                                        profilePhotoThumbnail(data: data, index: index)
                                    }
                                }
                                .padding(.vertical, 2)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section(L10n.tr("profile.section.required")) {
                    labeledField(L10n.tr("profile.firstName"), text: $firstName, isRequired: true)
                    labeledField(L10n.tr("profile.lastName"), text: $lastName)
                    VStack(alignment: .leading, spacing: 8) {
                        labeledField(L10n.tr("profile.city"), text: $city, isRequired: true)

                        Text(L10n.tr("profile.city.hint"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    DatePicker(
                        L10n.tr("profile.birthDate"),
                        selection: $birthDate,
                        in: ...Date(),
                        displayedComponents: [.date]
                    )

                    Picker(L10n.tr("profile.gender"), selection: $gender) {
                        ForEach(UserGender.allCases) { option in
                            Text(L10n.tr(option.localizationKey)).tag(option)
                        }
                    }

                    Picker(L10n.tr("profile.orientation"), selection: $orientation) {
                        ForEach(UserOrientation.allCases) { option in
                            Text(L10n.tr(option.localizationKey)).tag(option)
                        }
                    }

                    multilineField(L10n.tr("profile.bio"), text: $bio, isRequired: true)
                }

                Section(L10n.tr("profile.section.discovery")) {
                    Picker(L10n.tr("profile.intent"), selection: $intent) {
                        ForEach(UserIntent.allCases) { option in
                            Text(L10n.tr(option.localizationKey)).tag(option)
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        fieldLabel(L10n.tr("profile.preferredGenders") + ":", isRequired: true)

                        ForEach(UserGender.allCases) { option in
                            Toggle(isOn: preferredGenderBinding(for: option)) {
                                Text(L10n.tr(option.localizationKey))
                            }
                        }
                    }
                    .padding(.vertical, 4)

                    numericField(L10n.tr("profile.ageRange.min"), text: minAgeText)
                    numericField(L10n.tr("profile.ageRange.max"), text: maxAgeText)
                    numericField(
                        L10n.tr("profile.maxDistanceKm"),
                        text: maxDistanceText,
                        prompt: L10n.tr("common.none"),
                        suffix: "km",
                        caption: L10n.tr("profile.maxDistanceKm.hint")
                    )

                    multilineField(L10n.tr("profile.interests"), text: $interests)
                }

                Section(L10n.tr("profile.section.social")) {
                    labeledField(L10n.tr("profile.instagramTag"), text: $instagramTag)
                    labeledField(L10n.tr("profile.spotifyTag"), text: $spotifyTag)
                }

                Section(L10n.tr("profile.section.preferences")) {
                    Toggle(L10n.tr("profile.smokes"), isOn: $smokes)
                    Toggle(L10n.tr("profile.drinks"), isOn: $drinks)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button(L10n.tr("profile.complete")) {
                        handleCompleteProfile()
                    }
                    .disabled(isSaving)
                }
            }
            .navigationTitle(L10n.tr("profile.setup.title"))
            .alert(
                L10n.tr("profile.eventsRemoval.warning.title"),
                isPresented: $showEventRemovalAlert
            ) {
                Button(L10n.tr("profile.eventsRemoval.warning.confirm"), role: .destructive) {
                    Task {
                        await completeProfile()
                    }
                }
                Button(L10n.tr("common.cancel"), role: .cancel) {}
            } message: {
                Text(L10n.tr("profile.eventsRemoval.warning.message"))
            }
            .task(id: pickedPhotoItem) {
                guard let pickedPhotoItem else { return }
                if let crop = await loadPendingProfileAvatarCrop(from: pickedPhotoItem) {
                    pendingAvatarCrop = crop
                } else {
                    errorMessage = L10n.tr("profile.photo.crop.invalid")
                }
                self.pickedPhotoItem = nil
            }
            .onChange(of: pickedAdditionalPhotoItems) { _, newItems in
                guard !newItems.isEmpty else { return }
                let selectedItems = newItems
                pickedAdditionalPhotoItems = []

                Task { @MainActor in
                    await handleAdditionalPhotoSelection(selectedItems)
                }
            }
            .onAppear {
                hydrateFromCurrentUserIfNeeded()
            }
            .sheet(item: $pendingAvatarCrop) { crop in
                ProfileAvatarCropSheet(
                    image: crop.image,
                    onCancel: {
                        pendingAvatarCrop = nil
                    },
                    onComplete: { data in
                        pendingAvatarCrop = nil
                        Task { @MainActor in
                            errorMessage = await store.updateProfileImage(data)
                        }
                    }
                )
            }
        }
    }

    @ViewBuilder
    private var profileAvatar: some View {
        if let data = store.currentUser?.primaryProfileImageData,
           let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .frame(width: 64, height: 64)
                .clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill")
                .resizable()
                .scaledToFit()
                .foregroundStyle(.secondary)
                .frame(width: 64, height: 64)
            }
    }

    private var currentProfilePhotoDataItems: [Data] {
        store.currentUser?.resolvedProfilePhotoDataItems ?? []
    }

    private var remainingProfilePhotoCapacity: Int {
        max(0, maxProfilePhotoCount - currentProfilePhotoDataItems.count)
    }

    private func profilePhotoThumbnail(data: Data, index: Int) -> some View {
        VStack(spacing: 8) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if let uiImage = UIImage(data: data) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(.secondary.opacity(0.12))
                            .overlay {
                                Image(systemName: "photo")
                                    .foregroundStyle(.secondary)
                            }
                    }
                }
                .frame(width: 86, height: 112)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(alignment: .bottomLeading) {
                    if index == 0 {
                        Text(L10n.tr("profile.photo.primaryBadge"))
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(.orange.opacity(0.92), in: Capsule(style: .continuous))
                            .padding(7)
                    }
                }

                Button {
                    removeProfilePhoto(at: index)
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(.black.opacity(0.72), in: Circle())
                }
                .buttonStyle(.plain)
                .padding(7)
                .accessibilityLabel(L10n.tr("profile.photo.remove"))
            }

            HStack(spacing: 6) {
                Button {
                    moveProfilePhoto(at: index, by: -1)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.caption.weight(.bold))
                        .frame(width: 24, height: 24)
                }
                .disabled(index == 0)
                .opacity(index == 0 ? 0.35 : 1)

                Text("\(index + 1)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 20)

                Button {
                    moveProfilePhoto(at: index, by: 1)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .frame(width: 24, height: 24)
                }
                .disabled(index >= currentProfilePhotoDataItems.count - 1)
                .opacity(index >= currentProfilePhotoDataItems.count - 1 ? 0.35 : 1)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.orange)
        }
        .frame(width: 86)
    }

    @MainActor
    private func handleAdditionalPhotoSelection(_ items: [PhotosPickerItem]) async {
        let remainingCapacity = max(0, maxProfilePhotoCount - currentProfilePhotoDataItems.count)
        guard remainingCapacity > 0 else { return }

        var appendedImages: [Data] = []
        for item in items.prefix(remainingCapacity) {
            if let data = try? await item.loadTransferable(type: Data.self), !data.isEmpty {
                appendedImages.append(data)
            }
        }

        guard !appendedImages.isEmpty else { return }
        errorMessage = await store.updateProfileImages(currentProfilePhotoDataItems + appendedImages)
    }

    private func removeProfilePhoto(at index: Int) {
        guard currentProfilePhotoDataItems.indices.contains(index) else { return }

        var updatedImages = currentProfilePhotoDataItems
        updatedImages.remove(at: index)

        Task { @MainActor in
            errorMessage = await store.updateProfileImages(updatedImages)
        }
    }

    private func moveProfilePhoto(at index: Int, by delta: Int) {
        let targetIndex = index + delta
        guard currentProfilePhotoDataItems.indices.contains(index),
              currentProfilePhotoDataItems.indices.contains(targetIndex) else { return }

        var updatedImages = currentProfilePhotoDataItems
        updatedImages.swapAt(index, targetIndex)

        Task { @MainActor in
            errorMessage = await store.updateProfileImages(updatedImages)
        }
    }

    private func labeledField(_ label: String, text: Binding<String>, isRequired: Bool = false) -> some View {
        LabeledContent {
            TextField(label, text: text)
                .multilineTextAlignment(.trailing)
        } label: {
            fieldLabel(label, isRequired: isRequired)
        }
    }

    private func numericField(
        _ label: String,
        text: Binding<String>,
        prompt: String = "",
        suffix: String? = nil,
        caption: String? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                Text(label)
                    .font(.body)

                Spacer(minLength: 0)

                HStack(alignment: .center, spacing: 6) {
                    TextField(prompt, text: text)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 64, alignment: .trailing)

                    if let suffix, !text.wrappedValue.isEmpty {
                        Text(suffix)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(minHeight: 34)

            if let caption, !caption.isEmpty {
                Text(caption)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    private func multilineField(_ label: String, text: Binding<String>, isRequired: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            fieldLabel(label, isRequired: isRequired)
            TextField(label, text: text, axis: .vertical)
                .lineLimit(3, reservesSpace: true)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func fieldLabel(_ label: String, isRequired: Bool) -> some View {
        if isRequired {
            Text(label) +
            Text("*")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .baselineOffset(1)
        } else {
            Text(label)
        }
    }

    private func preferredGenderBinding(for option: UserGender) -> Binding<Bool> {
        Binding(
            get: { preferredGenders.contains(option) },
            set: { isSelected in
                if isSelected {
                    preferredGenders.insert(option)
                } else {
                    preferredGenders.remove(option)
                }
            }
        )
    }

    private func hydrateFromCurrentUserIfNeeded() {
        guard !hasHydratedFromUser else { return }
        hasHydratedFromUser = true

        guard let user = store.currentUser else { return }

        firstName = user.firstName ?? firstName
        lastName = user.lastName ?? lastName
        city = user.city ?? city
        birthDate = user.birthDate ?? birthDate
        gender = user.gender ?? gender
        orientation = user.orientation ?? orientation
        bio = user.normalizedBio.isEmpty ? bio : user.normalizedBio
        intent = user.intent ?? intent
        interests = user.normalizedInterests.isEmpty ? interests : user.normalizedInterests
        instagramTag = user.normalizedInstagramTag
        spotifyTag = user.normalizedSpotifyTag
        preferredGenders = Set(user.resolvedPreferredGenders)
        minPreferredAge = user.resolvedMinPreferredAge
        maxPreferredAge = user.resolvedMaxPreferredAge
        maxDistanceKm = user.normalizedMaxDistanceKm
        smokes = user.smokes ?? smokes
        drinks = user.drinks ?? drinks
    }

    private func handleCompleteProfile() {
        errorMessage = nil

        if store.willCurrentUserLoseMainEventRegistrations(
            changingGenderTo: gender,
            orientation: orientation
        ) {
            showEventRemovalAlert = true
            return
        }

        Task {
            await completeProfile()
        }
    }

    @MainActor
    private func completeProfile() async {
        guard !isSaving else { return }
        errorMessage = nil

        guard hasRequiredFields else {
            errorMessage = L10n.tr("profile.error.completeRequiredFields")
            return
        }

        isSaving = true

        if let err = await store.updateProfile(
            firstName: firstName,
            lastName: lastName,
            gender: gender,
            city: city,
            birthDate: birthDate,
            orientation: orientation,
            bio: bio,
            intent: intent,
            interests: interests,
            instagramTag: instagramTag,
            spotifyTag: spotifyTag,
            preferredGenders: orderedPreferredGenders,
            minPreferredAge: minPreferredAge,
            maxPreferredAge: maxPreferredAge,
            maxDistanceKm: maxDistanceKm,
            smokes: smokes,
            drinks: drinks
        ) {
            errorMessage = err
            isSaving = false
            return
        }

        isSaving = false
    }

    private var orderedPreferredGenders: [UserGender] {
        UserGender.allCases.filter { preferredGenders.contains($0) }
    }

    private var minAgeText: Binding<String> {
        Binding(
            get: { String(minPreferredAge) },
            set: { newValue in
                let digits = newValue.filter(\.isNumber)
                guard !digits.isEmpty, let parsed = Int(digits) else { return }
                let clamped = min(max(parsed, 18), 98)
                minPreferredAge = clamped
                if maxPreferredAge <= clamped {
                    maxPreferredAge = min(max(clamped + 1, 19), 99)
                }
            }
        )
    }

    private var maxAgeText: Binding<String> {
        Binding(
            get: { String(maxPreferredAge) },
            set: { newValue in
                let digits = newValue.filter(\.isNumber)
                guard !digits.isEmpty, let parsed = Int(digits) else { return }
                let minimum = max(minPreferredAge + 1, 19)
                maxPreferredAge = max(min(parsed, 99), minimum)
            }
        )
    }

    private var maxDistanceText: Binding<String> {
        Binding(
            get: { maxDistanceKm.map(String.init) ?? "" },
            set: { newValue in
                let digits = newValue.filter(\.isNumber)
                if digits.isEmpty {
                    maxDistanceKm = nil
                    return
                }

                guard let parsed = Int(digits) else { return }
                maxDistanceKm = max(parsed, 5)
            }
        )
    }

    private var hasRequiredFields: Bool {
        [
            firstName,
            city,
            bio
        ].allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        && !orderedPreferredGenders.isEmpty
    }
}

struct PendingProfileAvatarCrop: Identifiable {
    let id = UUID()
    let image: UIImage
}

@MainActor
func loadPendingProfileAvatarCrop(from item: PhotosPickerItem) async -> PendingProfileAvatarCrop? {
    guard let data = try? await item.loadTransferable(type: Data.self),
          let image = UIImage(data: data)?.normalizedForProfileAvatarCrop()
    else {
        return nil
    }

    return PendingProfileAvatarCrop(image: image)
}

struct ProfileAvatarCropSheet: View {
    let image: UIImage
    let onCancel: () -> Void
    let onComplete: (Data) -> Void

    @State private var scale: CGFloat = 1.08
    @State private var lastScale: CGFloat = 1.08
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    private let minimumScale: CGFloat = 1.08
    private let maximumScale: CGFloat = 4
    private let outputSide: CGFloat = 1024

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                Spacer(minLength: 10)

                cropStage(side: cropSide)

                zoomControl(side: cropSide)

                Button {
                    resetCrop()
                } label: {
                    Label(L10n.tr("profile.photo.crop.reset"), systemImage: "arrow.counterclockwise")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .tint(.orange)

                Spacer(minLength: 12)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 24)
            .background(Color(uiColor: .systemBackground))
            .navigationTitle(L10n.tr("profile.photo.crop.title"))
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.tr("common.cancel")) {
                        onCancel()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("common.done")) {
                        guard let data = croppedAvatarData(side: cropSide) else { return }
                        onComplete(data)
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private var cropSide: CGFloat {
        let screenWidth = UIScreen.main.bounds.width
        guard screenWidth.isFinite, screenWidth > 0 else { return 320 }
        return min(max(screenWidth - 48, 240), 360)
    }

    private func cropStage(side: CGFloat) -> some View {
        let displayedSize = displayedImageSize(side: side, scale: scale)

        return ZStack {
            Color.black

            Image(uiImage: image)
                .resizable()
                .frame(width: displayedSize.width, height: displayedSize.height)
                .offset(offset)
                .accessibilityHidden(true)

            Circle()
                .stroke(.white, lineWidth: 2)
                .shadow(color: .black.opacity(0.28), radius: 8, y: 2)

            Circle()
                .stroke(.black.opacity(0.18), lineWidth: 1)
                .padding(2)
        }
        .frame(width: side, height: side)
        .clipShape(Rectangle())
        .overlay {
            Rectangle()
                .stroke(Color.primary.opacity(0.10), lineWidth: 1)
        }
        .contentShape(Rectangle())
        .highPriorityGesture(dragGesture(side: side))
        .simultaneousGesture(magnificationGesture(side: side))
        .onAppear {
            scale = clampedScale(scale)
            lastScale = scale
            offset = clampedOffset(offset, side: side, scale: scale)
            lastOffset = offset
        }
    }

    private func zoomControl(side: CGFloat) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "minus.magnifyingglass")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)

            Slider(
                value: Binding(
                    get: { Double(scale) },
                    set: { newValue in
                        let nextScale = clampedScale(CGFloat(newValue))
                        scale = nextScale
                        offset = clampedOffset(offset, side: side, scale: nextScale)
                        lastScale = nextScale
                        lastOffset = offset
                    }
                ),
                in: Double(minimumScale)...Double(maximumScale)
            )
            .tint(.orange)
            .accessibilityLabel(L10n.tr("profile.photo.crop.zoom"))

            Image(systemName: "plus.magnifyingglass")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 6)
    }

    private func dragGesture(side: CGFloat) -> some Gesture {
        DragGesture()
            .onChanged { value in
                let proposed = CGSize(
                    width: lastOffset.width + value.translation.width,
                    height: lastOffset.height + value.translation.height
                )
                offset = clampedOffset(proposed, side: side, scale: scale)
            }
            .onEnded { _ in
                offset = clampedOffset(offset, side: side, scale: scale)
                lastOffset = offset
            }
    }

    private func magnificationGesture(side: CGFloat) -> some Gesture {
        MagnificationGesture()
            .onChanged { value in
                scale = clampedScale(lastScale * value)
                offset = clampedOffset(offset, side: side, scale: scale)
            }
            .onEnded { _ in
                scale = clampedScale(scale)
                offset = clampedOffset(offset, side: side, scale: scale)
                lastScale = scale
                lastOffset = offset
            }
    }

    private func resetCrop() {
        withAnimation(.spring(response: 0.26, dampingFraction: 0.86)) {
            scale = minimumScale
            lastScale = minimumScale
            offset = .zero
            lastOffset = .zero
        }
    }

    private func displayedImageSize(side: CGFloat, scale: CGFloat) -> CGSize {
        let resolvedScale = imageBaseScale(side: side) * clampedScale(scale)
        return CGSize(
            width: max(1, image.size.width * resolvedScale),
            height: max(1, image.size.height * resolvedScale)
        )
    }

    private func imageBaseScale(side: CGFloat) -> CGFloat {
        guard image.size.width.isFinite,
              image.size.height.isFinite,
              image.size.width > 0,
              image.size.height > 0,
              side.isFinite,
              side > 0
        else {
            return 1
        }

        return max(side / image.size.width, side / image.size.height)
    }

    private func clampedScale(_ value: CGFloat) -> CGFloat {
        guard value.isFinite else { return minimumScale }
        return min(max(value, minimumScale), maximumScale)
    }

    private func clampedOffset(_ value: CGSize, side: CGFloat, scale: CGFloat) -> CGSize {
        let displayedSize = displayedImageSize(side: side, scale: scale)
        let maxX = max(0, (displayedSize.width - side) / 2)
        let maxY = max(0, (displayedSize.height - side) / 2)

        return CGSize(
            width: min(max(safeFinite(value.width), -maxX), maxX),
            height: min(max(safeFinite(value.height), -maxY), maxY)
        )
    }

    private func croppedAvatarData(side: CGFloat) -> Data? {
        guard let cgImage = image.cgImage,
              image.size.width.isFinite,
              image.size.height.isFinite,
              image.size.width > 0,
              image.size.height > 0,
              side.isFinite,
              side > 0
        else {
            return nil
        }

        let effectiveScale = imageBaseScale(side: side) * clampedScale(scale)
        guard effectiveScale.isFinite, effectiveScale > 0 else { return nil }

        let displayedSize = displayedImageSize(side: side, scale: scale)
        let imageOriginX = ((side - displayedSize.width) / 2) + offset.width
        let imageOriginY = ((side - displayedSize.height) / 2) + offset.height
        let cropRectInImagePoints = CGRect(
            x: -imageOriginX / effectiveScale,
            y: -imageOriginY / effectiveScale,
            width: side / effectiveScale,
            height: side / effectiveScale
        )

        let pixelScaleX = CGFloat(cgImage.width) / image.size.width
        let pixelScaleY = CGFloat(cgImage.height) / image.size.height
        var cropRect = CGRect(
            x: cropRectInImagePoints.origin.x * pixelScaleX,
            y: cropRectInImagePoints.origin.y * pixelScaleY,
            width: cropRectInImagePoints.width * pixelScaleX,
            height: cropRectInImagePoints.height * pixelScaleY
        ).integral

        let imageBounds = CGRect(
            x: 0,
            y: 0,
            width: CGFloat(cgImage.width),
            height: CGFloat(cgImage.height)
        )
        cropRect = cropRect.intersection(imageBounds)
        guard cropRect.width > 1,
              cropRect.height > 1,
              let croppedImage = cgImage.cropping(to: cropRect)
        else {
            return nil
        }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true

        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: outputSide, height: outputSide),
            format: format
        )
        let renderedImage = renderer.image { _ in
            UIImage(cgImage: croppedImage, scale: 1, orientation: .up)
                .draw(in: CGRect(x: 0, y: 0, width: outputSide, height: outputSide))
        }
        return renderedImage.jpegData(compressionQuality: 0.92)
    }

    private func safeFinite(_ value: CGFloat) -> CGFloat {
        value.isFinite ? value : 0
    }
}

private extension UIImage {
    func normalizedForProfileAvatarCrop() -> UIImage? {
        guard size.width.isFinite,
              size.height.isFinite,
              size.width > 0,
              size.height > 0
        else {
            return nil
        }

        if imageOrientation == .up, cgImage != nil {
            return self
        }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
