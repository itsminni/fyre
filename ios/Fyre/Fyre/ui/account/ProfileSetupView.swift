//
//  ProfileSetupView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 20/03/26.
//

import SwiftUI
import PhotosUI

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
                if let data = try? await pickedPhotoItem.loadTransferable(type: Data.self) {
                    errorMessage = await store.updateProfileImage(data)
                }
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
