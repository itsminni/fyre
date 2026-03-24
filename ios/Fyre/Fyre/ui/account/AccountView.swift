//
//  AccountView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI
import PhotosUI

struct AccountView: View {
    private struct EditableProfileDraft: Equatable {
        let orientation: UserOrientation
        let showMe: UserShowMe
        let smokes: Bool
        let drinks: Bool
        let hobbies: String
        let passions: String
        let lookingFor: String
        let favoriteSong: String
        let favoriteMovie: String
    }

    private enum AccountSection: String, CaseIterable, Identifiable {
        case profile
        case security
        case events
        case settings

        var id: String { rawValue }

        var titleKey: String {
            switch self {
            case .profile: return "account.segment.profile"
            case .security: return "account.segment.security"
            case .events: return "account.segment.events"
            case .settings: return "account.segment.settings"
            }
        }
    }

    @Environment(UserStore.self) private var store
    @Environment(\.openURL) private var openURL
    @AppStorage("settings_theme_mode") private var themeMode = "system"
    @AppStorage("settings_notifications_enabled") private var notificationsEnabled = true
    @AppStorage("settings_show_age") private var showAge = true
    @AppStorage("settings_show_distance") private var showDistance = true

    @State private var selectedSection: AccountSection = .profile
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var birthDate = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    @State private var orientation: UserOrientation = .straight
    @State private var showMe: UserShowMe = .everyone
    @State private var smokes = false
    @State private var drinks = false
    @State private var hobbies = ""
    @State private var passions = ""
    @State private var lookingFor = ""
    @State private var favoriteSong = ""
    @State private var favoriteMovie = ""
    @State private var profileMessage: String?
    @State private var profileMessageIsError = false
    @State private var securityMessage: String?
    @State private var pickedPhotoItem: PhotosPickerItem?
    @State private var showEventRemovalAlert = false
    @State private var pendingDangerousOrientation: UserOrientation?
    @State private var isHydratingProfileForm = false
    @State private var hasLoadedProfileForm = false

    private let supportEmail = "support@example.com"

    private static let birthDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Picker("", selection: $selectedSection) {
                    ForEach(AccountSection.allCases) { section in
                        Text(L10n.tr(section.titleKey)).tag(section)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 8)

                Group {
                    switch selectedSection {
                    case .profile:
                        profileSettings
                    case .security:
                        securitySettings
                    case .events:
                        eventsSettings
                    case .settings:
                        appSettings
                    }
                }
            }
            .navigationTitle(L10n.tr("tab.account"))
            .onAppear {
                fillFromUser()
            }
            .onChange(of: orientation) { oldValue, newValue in
                handleOrientationChange(from: oldValue, to: newValue)
            }
            .task(id: pickedPhotoItem) {
                guard let pickedPhotoItem else { return }
                if let data = try? await pickedPhotoItem.loadTransferable(type: Data.self) {
                    _ = store.updateProfileImage(data)
                }
            }
            .task(id: editableProfileDraft) {
                await autosaveProfileIfNeeded()
            }
            .alert(
                L10n.tr("profile.eventsRemoval.warning.title"),
                isPresented: $showEventRemovalAlert
            ) {
                Button(L10n.tr("profile.eventsRemoval.warning.confirm"), role: .destructive) {
                    performProfileSave(
                        orientationOverride: pendingDangerousOrientation,
                        notifyEventRemoval: true,
                        showSuccessMessage: true
                    )
                    pendingDangerousOrientation = nil
                }
                Button(L10n.tr("common.cancel"), role: .cancel) {
                    pendingDangerousOrientation = nil
                }
            } message: {
                Text(L10n.tr("profile.eventsRemoval.warning.message"))
            }
        }
    }

    private var profileSettings: some View {
        ScrollView {
            VStack(spacing: 18) {
                AccountCard(
                    title: L10n.tr("profile.section.information"),
                    subtitle: L10n.tr("profile.section.informationHint"),
                    icon: "person.text.rectangle.fill"
                ) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(spacing: 16) {
                            profileAvatar(size: 84)

                            VStack(alignment: .leading, spacing: 10) {
                                Text(store.currentUser?.displayName ?? "Fyre")
                                    .font(.title3.weight(.semibold))

                                Text(store.currentUser?.email ?? "")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)

                                PhotosPicker(selection: $pickedPhotoItem, matching: .images) {
                                    Label(L10n.tr("profile.photo.action"), systemImage: "camera.fill")
                                }
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.orange)
                            }

                            Spacer(minLength: 0)
                        }

                        VStack(spacing: 0) {
                            ProfileReadOnlyRow(title: L10n.tr("profile.firstName"), value: displayValue(firstName))
                            cardDivider
                            ProfileReadOnlyRow(title: L10n.tr("profile.lastName"), value: displayValue(lastName))
                            cardDivider
                            ProfileReadOnlyRow(title: L10n.tr("profile.email"), value: store.currentUser?.email ?? "-")
                            cardDivider
                            ProfileReadOnlyRow(title: L10n.tr("profile.birthDate"), value: birthDateLabel)
                            cardDivider
                            ProfileReadOnlyRow(title: L10n.tr("profile.gender"), value: genderLabel)
                        }
                    }
                }

                AccountCard(title: L10n.tr("profile.section.preferences"), icon: "slider.horizontal.3") {
                    VStack(spacing: 14) {
                        ProfilePickerField(
                            title: L10n.tr("profile.orientation"),
                            selection: $orientation,
                            options: UserOrientation.allCases
                        ) { option in
                            L10n.tr(option.localizationKey)
                        }

                        ProfilePickerField(
                            title: L10n.tr("profile.showMe"),
                            selection: $showMe,
                            options: UserShowMe.allCases
                        ) { option in
                            L10n.tr(option.localizationKey)
                        }

                        ProfileToggleField(title: L10n.tr("profile.smokes"), isOn: $smokes)
                        ProfileToggleField(title: L10n.tr("profile.drinks"), isOn: $drinks)
                        ProfileTextField(title: L10n.tr("profile.hobbies"), text: $hobbies)
                        ProfileTextField(title: L10n.tr("profile.passions"), text: $passions)
                        ProfileTextField(title: L10n.tr("profile.lookingFor"), text: $lookingFor)
                        ProfileTextField(title: L10n.tr("profile.favoriteSong"), text: $favoriteSong)
                        ProfileTextField(title: L10n.tr("profile.favoriteMovie"), text: $favoriteMovie)
                    }
                }

                if let profileMessage {
                    Text(profileMessage)
                        .font(.footnote)
                        .foregroundStyle(profileMessageIsError ? .red : .green)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                } else {
                    Text(L10n.tr("profile.autosave.hint"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }

                Button(L10n.tr("auth.logout.action")) {
                    store.logOut()
                }
                .buttonStyle(AccountPrimaryButtonStyle(tint: .red))
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(accountBackground.ignoresSafeArea())
    }

    private var appSettings: some View {
        Form {
            Section(L10n.tr("account.section.settings")) {
                Picker(L10n.tr("account.theme"), selection: $themeMode) {
                    Text(L10n.tr("account.theme.system")).tag("system")
                    Text(L10n.tr("account.theme.light")).tag("light")
                    Text(L10n.tr("account.theme.dark")).tag("dark")
                }
                Toggle(L10n.tr("account.notifications"), isOn: $notificationsEnabled)
                Toggle(L10n.tr("account.showAge"), isOn: $showAge)
                Toggle(L10n.tr("account.showDistance"), isOn: $showDistance)
            }
        }
    }

    private var securitySettings: some View {
        ScrollView {
            VStack(spacing: 18) {
                AccountCard(title: L10n.tr("profile.section.security"), icon: "lock.shield.fill") {
                    VStack(alignment: .leading, spacing: 14) {
                        Text(L10n.tr("profile.security.resetDescription"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        ProfileReadOnlyRow(
                            title: L10n.tr("profile.email"),
                            value: store.currentUser?.email ?? "-"
                        )

                        Button(action: openPasswordResetMail) {
                            Label(L10n.tr("profile.security.resetAction"), systemImage: "envelope.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(AccountPrimaryButtonStyle())

                        if let securityMessage {
                            Text(securityMessage)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(accountBackground.ignoresSafeArea())
    }

    private var eventsSettings: some View {
        Form {
            Section(L10n.tr("account.section.events")) {
                let recent = Array(store.currentUserUpcomingEventHistory.prefix(3))
                if recent.isEmpty {
                    Text(L10n.tr("account.events.empty"))
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(recent) { item in
                        EventHistoryRow(item: item)
                    }
                    NavigationLink(L10n.tr("account.events.openAll"), destination: AccountEventsHistoryView())
                }
            }
        }
    }

    private var genderLabel: String {
        guard let gender = store.currentUser?.gender else { return L10n.tr("profile.gender.unspecified") }
        return L10n.tr(gender.localizationKey)
    }

    private var birthDateLabel: String {
        guard store.currentUser?.birthDate != nil else { return "-" }
        return Self.birthDateFormatter.string(from: birthDate)
    }

    private var accountBackground: LinearGradient {
        LinearGradient(
            colors: [
                Color(uiColor: .systemGroupedBackground),
                Color(uiColor: .secondarySystemGroupedBackground)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var cardDivider: some View {
        Divider()
            .overlay(.white.opacity(0.08))
    }

    @ViewBuilder
    private func profileAvatar(size: CGFloat) -> some View {
        if let data = store.currentUser?.profileImageData,
           let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.08), lineWidth: 1)
                }
        } else {
            Circle()
                .fill(.white.opacity(0.06))
                .frame(width: size, height: size)
                .overlay {
                    Image(systemName: "person.crop.circle.fill")
                        .resizable()
                        .scaledToFit()
                        .foregroundStyle(.secondary)
                        .padding(14)
                }
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.08), lineWidth: 1)
                }
        }
    }

    private func displayValue(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "-" : trimmed
    }

    private func fillFromUser() {
        // Sync the editable fields from storage before autosave or validation kicks in.
        isHydratingProfileForm = true
        firstName = store.currentUser?.firstName ?? ""
        lastName = store.currentUser?.lastName ?? ""
        birthDate = store.currentUser?.birthDate ?? birthDate
        orientation = store.currentUser?.orientation ?? .straight
        showMe = store.currentUser?.showMe ?? .everyone
        smokes = store.currentUser?.smokes ?? false
        drinks = store.currentUser?.drinks ?? false
        hobbies = store.currentUser?.hobbies ?? ""
        passions = store.currentUser?.passions ?? ""
        lookingFor = store.currentUser?.lookingFor ?? ""
        favoriteSong = store.currentUser?.favoriteSong ?? ""
        favoriteMovie = store.currentUser?.favoriteMovie ?? ""
        isHydratingProfileForm = false
        hasLoadedProfileForm = true
    }

    private var editableProfileDraft: EditableProfileDraft {
        EditableProfileDraft(
            orientation: orientation,
            showMe: showMe,
            smokes: smokes,
            drinks: drinks,
            hobbies: hobbies,
            passions: passions,
            lookingFor: lookingFor,
            favoriteSong: favoriteSong,
            favoriteMovie: favoriteMovie
        )
    }

    private var storedEditableProfileDraft: EditableProfileDraft? {
        guard let user = store.currentUser else { return nil }

        return EditableProfileDraft(
            orientation: user.orientation ?? .straight,
            showMe: user.showMe,
            smokes: user.smokes ?? false,
            drinks: user.drinks ?? false,
            hobbies: user.hobbies ?? "",
            passions: user.passions ?? "",
            lookingFor: user.lookingFor ?? "",
            favoriteSong: user.favoriteSong ?? "",
            favoriteMovie: user.favoriteMovie ?? ""
        )
    }

    private func handleOrientationChange(from oldValue: UserOrientation, to newValue: UserOrientation) {
        guard hasLoadedProfileForm,
              !isHydratingProfileForm,
              oldValue != newValue else { return }

        guard store.willCurrentUserLoseMainEventRegistrations(orientation: newValue) else { return }

        pendingDangerousOrientation = newValue
        isHydratingProfileForm = true
        orientation = oldValue
        isHydratingProfileForm = false
        showEventRemovalAlert = true
    }

    private func autosaveProfileIfNeeded() async {
        // Debounce rapid edits so we only persist once the user pauses.
        guard hasLoadedProfileForm,
              !isHydratingProfileForm,
              pendingDangerousOrientation == nil,
              editableProfileDraft != storedEditableProfileDraft else { return }

        try? await Task.sleep(nanoseconds: 700_000_000)
        guard !Task.isCancelled,
              hasLoadedProfileForm,
              !isHydratingProfileForm,
              pendingDangerousOrientation == nil,
              editableProfileDraft != storedEditableProfileDraft else { return }

        performProfileSave(showSuccessMessage: false)
    }

    private func performProfileSave(
        orientationOverride: UserOrientation? = nil,
        notifyEventRemoval: Bool = false,
        showSuccessMessage: Bool = false
    ) {
        // Preserve the draft when the save fails so the form stays consistent.
        let previousDraft = editableProfileDraft

        if notifyEventRemoval,
           let orientationOverride {
            isHydratingProfileForm = true
            orientation = orientationOverride
            isHydratingProfileForm = false
        }

        let targetOrientation = orientationOverride ?? orientation
        let shouldShowEventRemovalMessage = notifyEventRemoval
            || store.willCurrentUserLoseMainEventRegistrations(orientation: targetOrientation)

        if shouldShowEventRemovalMessage && pendingDangerousOrientation == nil && !notifyEventRemoval {
            pendingDangerousOrientation = targetOrientation
            showEventRemovalAlert = true
            return
        }

        let result = store.updateProfile(
            firstName: firstName,
            lastName: lastName,
            birthDate: birthDate,
            orientation: targetOrientation,
            showMe: showMe,
            smokes: smokes,
            drinks: drinks,
            hobbies: hobbies,
            passions: passions,
            lookingFor: lookingFor,
            favoriteSong: favoriteSong,
            favoriteMovie: favoriteMovie
        )

        if let result {
            profileMessage = result
            profileMessageIsError = true
            if orientationOverride != nil {
                isHydratingProfileForm = true
                orientation = previousDraft.orientation
                isHydratingProfileForm = false
            }
        } else {
            if showSuccessMessage {
                profileMessage = shouldShowEventRemovalMessage
                ? L10n.tr("profile.saved.eventsRemoved")
                : L10n.tr("profile.saved")
                profileMessageIsError = false
            } else {
                profileMessage = nil
                profileMessageIsError = false
            }
            fillFromUser()
        }
    }

    private func openPasswordResetMail() {
        guard let email = store.currentUser?.email else {
            securityMessage = L10n.tr("profile.error.noCurrentUser")
            return
        }

        var components = URLComponents()
        components.scheme = "mailto"
        components.path = supportEmail
        components.queryItems = [
            URLQueryItem(name: "subject", value: "Password reset request"),
            URLQueryItem(name: "body", value: "Profile email: \(email)")
        ]

        guard let url = components.url else {
            securityMessage = L10n.tr("profile.security.mailFailed")
            return
        }

        openURL(url) { accepted in
            securityMessage = accepted
            ? L10n.tr("profile.security.mailOpened")
            : L10n.tr("profile.security.mailFailed")
        }
    }
}

private struct AccountCard<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    var icon: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.orange)
                    .frame(width: 28, height: 28)
                    .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.title3.weight(.semibold))

                    if let subtitle {
                        Text(subtitle)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            content
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(.white.opacity(0.05), lineWidth: 1)
        )
    }
}

private struct ProfileReadOnlyRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(title)
                .foregroundStyle(.secondary)

            Spacer()

            Text(value)
                .multilineTextAlignment(.trailing)
        }
        .font(.subheadline)
        .padding(.vertical, 12)
    }
}

private struct ProfileTextField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

            TextField(title, text: $text, axis: .vertical)
                .textFieldStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ProfileToggleField: View {
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            Text(title)
                .font(.subheadline)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ProfilePickerField<Option: Identifiable & Hashable>: View {
    let title: String
    @Binding var selection: Option
    let options: [Option]
    let titleForOption: (Option) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

            Picker(title, selection: $selection) {
                ForEach(options) { option in
                    Text(titleForOption(option)).tag(option)
                }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct AccountPrimaryButtonStyle: ButtonStyle {
    var tint: Color = .orange

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.vertical, 16)
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [tint, tint.opacity(0.8)],
                    startPoint: .leading,
                    endPoint: .trailing
                ),
                in: RoundedRectangle(cornerRadius: 20, style: .continuous)
            )
            .shadow(color: tint.opacity(0.22), radius: 18, y: 10)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}
