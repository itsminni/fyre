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
    @State private var preferredGenders = Set(UserStore.defaultPreferredGenders)
    @State private var minPreferredAge = 20
    @State private var maxPreferredAge = 32
    @State private var maxDistanceKm = 50
    @State private var smokes = false
    @State private var drinks = false
    @State private var pickedPhotoItem: PhotosPickerItem?
    @State private var errorMessage: String?
    @State private var isSaving = false
    @State private var showEventRemovalAlert = false
    @State private var hasHydratedFromUser = false

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

                Section(L10n.tr("profile.section.required")) {
                    labeledField(L10n.tr("profile.firstName"), text: $firstName, isRequired: true)
                    labeledField(L10n.tr("profile.lastName"), text: $lastName)
                    labeledField(L10n.tr("profile.city"), text: $city, isRequired: true)

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
                        fieldLabel(L10n.tr("profile.preferredGenders"), isRequired: true)

                        ForEach(UserGender.allCases) { option in
                            Toggle(isOn: preferredGenderBinding(for: option)) {
                                Text(L10n.tr(option.localizationKey))
                            }
                        }
                    }
                    .padding(.vertical, 4)

                    Stepper(
                        "\(L10n.tr("profile.ageRange.min")): \(minPreferredAge)",
                        value: $minPreferredAge,
                        in: 18...80
                    )
                    .onChange(of: minPreferredAge) { _, newValue in
                        if maxPreferredAge < newValue {
                            maxPreferredAge = newValue
                        }
                    }

                    Stepper(
                        "\(L10n.tr("profile.ageRange.max")): \(maxPreferredAge)",
                        value: $maxPreferredAge,
                        in: minPreferredAge...80
                    )

                    Stepper(
                        "\(L10n.tr("profile.maxDistanceKm")): \(maxDistanceKm) km",
                        value: $maxDistanceKm,
                        in: 5...300,
                        step: 5
                    )
                    multilineField(L10n.tr("profile.interests"), text: $interests)
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
            .onAppear {
                hydrateFromCurrentUserIfNeeded()
            }
        }
    }

    @ViewBuilder
    private var profileAvatar: some View {
        if let data = store.currentUser?.profileImageData,
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

    private func labeledField(_ label: String, text: Binding<String>, isRequired: Bool = false) -> some View {
        LabeledContent {
            TextField(label, text: text)
                .multilineTextAlignment(.trailing)
        } label: {
            fieldLabel(label, isRequired: isRequired)
        }
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
        preferredGenders = Set(user.resolvedPreferredGenders)
        minPreferredAge = user.resolvedMinPreferredAge
        maxPreferredAge = user.resolvedMaxPreferredAge
        maxDistanceKm = user.resolvedMaxDistanceKm
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

    private var hasRequiredFields: Bool {
        [
            firstName,
            city,
            bio
        ].allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        && !orderedPreferredGenders.isEmpty
    }
}
