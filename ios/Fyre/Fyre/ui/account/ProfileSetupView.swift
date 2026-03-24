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
    @State private var birthDate = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    @State private var gender: UserGender = .male
    @State private var orientation: UserOrientation = .straight
    @State private var showMe: UserShowMe = .everyone
    @State private var smokes = false
    @State private var drinks = false
    @State private var hobbies = ""
    @State private var passions = ""
    @State private var lookingFor = ""
    @State private var favoriteSong = ""
    @State private var favoriteMovie = ""
    @State private var pickedPhotoItem: PhotosPickerItem?
    @State private var errorMessage: String?
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
                    labeledField(L10n.tr("profile.lastName"), text: $lastName, isRequired: true)

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

                    Picker(L10n.tr("profile.showMe"), selection: $showMe) {
                        ForEach(UserShowMe.allCases) { option in
                            Text(L10n.tr(option.localizationKey)).tag(option)
                        }
                    }
                }

                Section(L10n.tr("profile.section.preferences")) {
                    Toggle(L10n.tr("profile.smokes"), isOn: $smokes)
                    Toggle(L10n.tr("profile.drinks"), isOn: $drinks)
                    labeledField(L10n.tr("profile.hobbies"), text: $hobbies, isRequired: true)
                    labeledField(L10n.tr("profile.passions"), text: $passions, isRequired: true)
                    labeledField(L10n.tr("profile.lookingFor"), text: $lookingFor, isRequired: true)
                    labeledField(L10n.tr("profile.favoriteSong"), text: $favoriteSong, isRequired: true)
                    labeledField(L10n.tr("profile.favoriteMovie"), text: $favoriteMovie, isRequired: true)
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
                }
            }
            .navigationTitle(L10n.tr("profile.setup.title"))
            .alert(
                L10n.tr("profile.eventsRemoval.warning.title"),
                isPresented: $showEventRemovalAlert
            ) {
                Button(L10n.tr("profile.eventsRemoval.warning.confirm"), role: .destructive) {
                    completeProfile()
                }
                Button(L10n.tr("common.cancel"), role: .cancel) {}
            } message: {
                Text(L10n.tr("profile.eventsRemoval.warning.message"))
            }
            .task(id: pickedPhotoItem) {
                guard let pickedPhotoItem else { return }
                if let data = try? await pickedPhotoItem.loadTransferable(type: Data.self) {
                    _ = store.updateProfileImage(data)
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

    private func hydrateFromCurrentUserIfNeeded() {
        // Load the current profile once so the setup form starts from saved values.
        guard !hasHydratedFromUser else { return }
        hasHydratedFromUser = true

        guard let user = store.currentUser else { return }

        firstName = user.firstName ?? firstName
        lastName = user.lastName ?? lastName
        birthDate = user.birthDate ?? birthDate
        gender = user.gender ?? gender
        orientation = user.orientation ?? orientation
        showMe = user.showMe
        smokes = user.smokes ?? smokes
        drinks = user.drinks ?? drinks
        hobbies = user.hobbies ?? hobbies
        passions = user.passions ?? passions
        lookingFor = user.lookingFor ?? lookingFor
        favoriteSong = user.favoriteSong ?? favoriteSong
        favoriteMovie = user.favoriteMovie ?? favoriteMovie
    }

    private func handleCompleteProfile() {
        errorMessage = nil

        // Ask for confirmation only when the new profile would drop existing registrations.
        if store.willCurrentUserLoseMainEventRegistrations(
            changingGenderTo: gender,
            orientation: orientation
        ) {
            showEventRemovalAlert = true
            return
        }

        completeProfile()
    }

    private func completeProfile() {
        errorMessage = nil

        guard hasAllRequiredTextFields else {
            errorMessage = L10n.tr("profile.error.completeRequiredFields")
            return
        }

        if let err = store.setProfileGender(gender) {
            errorMessage = err
            return
        }

        if let err = store.updateProfile(
            firstName: firstName,
            lastName: lastName,
            birthDate: birthDate,
            orientation: orientation,
            showMe: showMe,
            smokes: smokes,
            drinks: drinks,
            hobbies: hobbies,
            passions: passions,
            lookingFor: lookingFor,
            favoriteSong: favoriteSong,
            favoriteMovie: favoriteMovie
        ) {
            errorMessage = err
        }
    }

    private var hasAllRequiredTextFields: Bool {
        [
            firstName,
            lastName,
            hobbies,
            passions,
            lookingFor,
            favoriteSong,
            favoriteMovie
        ].allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
}
