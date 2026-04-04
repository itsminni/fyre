//
//  AccountView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 10/03/26.
//

import SwiftUI
import PhotosUI

private struct PendingChatBackgroundPreview: Identifiable {
    let id = UUID()
    let style: ChatBackgroundStyle
}

struct AccountView: View {
    private struct EditableProfileDraft: Equatable {
        let city: String
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

    private enum SettingsDestination: String, CaseIterable, Identifiable, Hashable {
        case account
        case preferences
        case notifications
        case security
        case appearance
        case events

        var id: String { rawValue }

        var titleKey: String {
            switch self {
            case .account: return "account.menu.account"
            case .preferences: return "account.section.preferences"
            case .notifications: return "account.notifications"
            case .security: return "profile.section.security"
            case .appearance: return "account.section.appearance"
            case .events: return "account.section.events"
            }
        }

        var iconName: String {
            switch self {
            case .account: return "key.fill"
            case .preferences: return "slider.horizontal.3"
            case .notifications: return "bell.fill"
            case .security: return "lock.fill"
            case .appearance: return "paintpalette.fill"
            case .events: return "calendar.badge.clock"
            }
        }
    }

    @Environment(UserStore.self) private var store
    @Environment(\.openURL) private var openURL
    @AppStorage("settings_theme_mode") private var themeMode = "system"
    @AppStorage("settings_notifications_enabled") private var notificationsEnabled = true
    @AppStorage("settings_show_age") private var showAge = true
    @AppStorage("settings_show_distance") private var showDistance = true
    @AppStorage("settings_chat_background_style") private var chatBackgroundStyle = ChatBackgroundStyle.defaultDark.rawValue
    @AppStorage("settings_chat_background_brightness") private var chatBackgroundBrightness = 0.0
    @AppStorage("settings_chat_background_color_1") private var chatBackgroundColor1Hex = "#3F4755"
    @AppStorage("settings_chat_background_color_2") private var chatBackgroundColor2Hex = "#8B7A74"
    @AppStorage("settings_chat_background_color_3") private var chatBackgroundColor3Hex = "#B9A89B"
    @AppStorage("settings_chat_outgoing_bubble_palette") private var outgoingBubblePalette = ChatBubblePalette.default.rawValue
    @AppStorage("settings_chat_incoming_bubble_palette") private var incomingBubblePalette = ChatBubblePalette.default.rawValue
    @AppStorage("settings_send_button_color_1") private var sendButtonColor1Hex = "#FF9A00"
    @AppStorage("settings_send_button_color_2") private var sendButtonColor2Hex = "#FF8A1F"
    @AppStorage("settings_send_button_color_3") private var sendButtonColor3Hex = "#E14D33"

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var city = ""
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
    @State private var pendingChatBackgroundPreview: PendingChatBackgroundPreview?
    @State private var chatBackgroundStyleSelection = ChatBackgroundStyle.defaultDark.rawValue
    @State private var chatBackgroundSettingsMessage: String?
    @State private var chatBackgroundSettingsMessageIsError = false
    @State private var showEventRemovalAlert = false
    @State private var pendingDangerousOrientation: UserOrientation?
    @State private var isHydratingProfileForm = false
    @State private var hasLoadedProfileForm = false
    @State private var isSavingProfile = false
    @State private var isLoggingOut = false

    private let supportEmail = "support@example.com"

    private static let birthDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    var body: some View {
        NavigationStack {
            settingsHome
            .onAppear {
                fillFromUser()
                chatBackgroundStyleSelection = chatBackgroundStyle
            }
            .onChange(of: orientation) { oldValue, newValue in
                handleOrientationChange(from: oldValue, to: newValue)
            }
            .task(id: pickedPhotoItem) {
                guard let pickedPhotoItem else { return }
                if let data = try? await pickedPhotoItem.loadTransferable(type: Data.self) {
                    // Avatar uploads are handled separately so autosaving text fields never reuploads the image.
                    let result = await store.updateProfileImage(data)
                    if let result {
                        profileMessage = result
                        profileMessageIsError = true
                    } else {
                        profileMessage = nil
                        profileMessageIsError = false
                        fillFromUser()
                    }
                }
            }
            .onChange(of: chatBackgroundStyleSelection) { _, newValue in
                guard newValue != chatBackgroundStyle else { return }
                let style = ChatBackgroundStyle(rawValue: newValue) ?? .defaultDark
                pendingChatBackgroundPreview = PendingChatBackgroundPreview(
                    style: style
                )
            }
            .task(id: editableProfileDraft) {
                // Only editable profile fields participate in autosave; identity fields stay read-only above.
                await autosaveProfileIfNeeded()
            }
            .alert(
                L10n.tr("profile.eventsRemoval.warning.title"),
                isPresented: $showEventRemovalAlert
            ) {
                Button(L10n.tr("profile.eventsRemoval.warning.confirm"), role: .destructive) {
                    Task {
                        await performProfileSave(
                            orientationOverride: pendingDangerousOrientation,
                            notifyEventRemoval: true,
                            showSuccessMessage: true
                        )
                        pendingDangerousOrientation = nil
                    }
                }
                Button(L10n.tr("common.cancel"), role: .cancel) {
                    pendingDangerousOrientation = nil
                }
            } message: {
                Text(L10n.tr("profile.eventsRemoval.warning.message"))
            }
            .fullScreenCover(item: $pendingChatBackgroundPreview) { preview in
                ChatBackgroundConfirmationView(
                    preview: preview,
                    brightness: $chatBackgroundBrightness,
                    backgroundGradientColors: chatBackgroundGradientColors,
                    outgoingPalette: ChatBubblePalette(rawValue: outgoingBubblePalette) ?? .default,
                    incomingPalette: ChatBubblePalette(rawValue: incomingBubblePalette) ?? .default,
                    onCancel: {
                        chatBackgroundStyleSelection = chatBackgroundStyle
                        pendingChatBackgroundPreview = nil
                    },
                    onApply: {
                        applyChatBackgroundStyle(preview.style)
                        pendingChatBackgroundPreview = nil
                    }
                )
            }
            .navigationDestination(for: SettingsDestination.self) { destination in
                settingsDestinationView(destination)
                    .navigationTitle(L10n.tr(destination.titleKey))
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }

    private var settingsHome: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                profileHubHeader

                VStack(alignment: .leading, spacing: 12) {
                    sectionEyebrow(L10n.tr("account.segment.settings"))
                    settingsNavigationList
                }

                eventsHubCard
            }
            .padding(.horizontal)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(accountBackground.ignoresSafeArea())
    }

    private var profileHubHeader: some View {
        VStack(spacing: 12) {
            PhotosPicker(selection: $pickedPhotoItem, matching: .images) {
                profileAvatar(size: 95)
                    .overlay(alignment: .bottomTrailing) {
                        ZStack {
                            Circle()
                                .fill(.black.opacity(0.72))
                            Image(systemName: "camera.fill")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                        }
                        .frame(width: 30, height: 30)
                        .overlay {
                            Circle()
                                .stroke(.white.opacity(0.12), lineWidth: 1)
                        }
                        .offset(x: 2, y: 2)
                    }
            }
            .buttonStyle(.plain)

            Text(profileHeaderFirstName)
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private var profileHeaderFirstName: String {
        let candidates = [
            store.currentUser?.firstName,
            firstName
        ]

        for candidate in candidates {
            let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !trimmed.isEmpty {
                return trimmed
            }
        }

        return "Fyre"
    }

    private var settingsNavigationList: some View {
        VStack(spacing: 0) {
            ForEach(Array([
                SettingsDestination.account,
                .preferences,
                .notifications,
                .security,
                .appearance
            ].enumerated()), id: \.element) { index, destination in
                NavigationLink(value: destination) {
                    settingsNavigationRow(destination)
                }
                .buttonStyle(.plain)

                if index < 4 {
                    Divider()
                        .overlay(.white.opacity(0.08))
                        .padding(.leading, 64)
                }
            }
        }
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private var eventsHubCard: some View {
        AccountCard(
            title: L10n.tr("account.section.events"),
            icon: SettingsDestination.events.iconName
        ) {
            VStack(alignment: .leading, spacing: 12) {
                let recent = Array(store.currentUserUpcomingEventHistory.prefix(2))
                if recent.isEmpty {
                    Text(L10n.tr("account.events.empty"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(recent) { item in
                        EventHistoryRow(item: item)
                    }
                }

                NavigationLink(value: SettingsDestination.events) {
                    HStack(spacing: 10) {
                        Image(systemName: "arrow.up.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)

                        Text(L10n.tr("account.events.openAll"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)

                        Spacer(minLength: 0)

                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func settingsDestinationView(_ destination: SettingsDestination) -> some View {
        Group {
            switch destination {
            case .account:
                profileSettings
            case .preferences:
                preferencesSettings
            case .notifications:
                notificationSettings
            case .security:
                securitySettings
            case .appearance:
                appearanceSettings
            case .events:
                eventsSettings
            }
        }
    }

    private var profileSettings: some View {
        ScrollView {
            VStack(spacing: 18) {
                AccountCard(
                    title: L10n.tr("profile.section.information"),
                    subtitleText: informationHintText,
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
                        ProfileTextField(title: L10n.tr("profile.city"), text: $city)

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
                    Task {
                        await performLogout()
                    }
                }
                .buttonStyle(AccountPrimaryButtonStyle(tint: .red))
                .disabled(isLoggingOut)
            }
            .padding(.horizontal)
            .padding(.top, 2)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(accountBackground.ignoresSafeArea())
    }

    private var appearanceSettings: some View {
        ScrollView {
            VStack(spacing: 18) {
                AccountCard(
                    title: L10n.tr("account.section.appearance"),
                    icon: "paintpalette.fill"
                ) {
                    VStack(spacing: 14) {
                        SettingsPickerField(
                            title: L10n.tr("account.theme"),
                            selection: $themeMode,
                            options: ["system", "light", "dark"]
                        ) { option in
                            switch option {
                            case "light":
                                return L10n.tr("account.theme.light")
                            case "dark":
                                return L10n.tr("account.theme.dark")
                            default:
                                return L10n.tr("account.theme.system")
                            }
                        }

                        SettingsPickerField(
                            title: L10n.tr("account.chatBackground"),
                            selection: $chatBackgroundStyleSelection,
                            options: ChatBackgroundStyle.allCases.map(\.rawValue)
                        ) { option in
                            let style = ChatBackgroundStyle(rawValue: option) ?? .defaultDark
                            return L10n.tr(style.localizationKey)
                        }

                        ChatBackgroundGradientSettings(
                            colorOne: chatBackgroundColorOneBinding,
                            colorTwo: chatBackgroundColorTwoBinding,
                            colorThree: chatBackgroundColorThreeBinding,
                            onApply: applyCustomChatBackgroundGradient
                        )

                        SettingsPickerField(
                            title: L10n.tr("account.chatBubble.outgoing"),
                            selection: $outgoingBubblePalette,
                            options: ChatBubblePalette.allCases.map(\.rawValue)
                        ) { option in
                            let palette = ChatBubblePalette(rawValue: option) ?? .default
                            return L10n.tr(palette.localizationKey)
                        }

                        SettingsPickerField(
                            title: L10n.tr("account.chatBubble.incoming"),
                            selection: $incomingBubblePalette,
                            options: ChatBubblePalette.allCases.map(\.rawValue)
                        ) { option in
                            let palette = ChatBubblePalette(rawValue: option) ?? .default
                            return L10n.tr(palette.localizationKey)
                        }

                        SendButtonGradientSettings(
                            colorOne: sendButtonColorOneBinding,
                            colorTwo: sendButtonColorTwoBinding,
                            colorThree: sendButtonColorThreeBinding
                        )

                        if let chatBackgroundSettingsMessage {
                            Text(chatBackgroundSettingsMessage)
                                .font(.footnote)
                                .foregroundStyle(chatBackgroundSettingsMessageIsError ? .red : .secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 4)
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.top, 2)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(accountBackground.ignoresSafeArea())
    }

    private var preferencesSettings: some View {
        ScrollView {
            VStack(spacing: 18) {
                AccountCard(
                    title: L10n.tr("account.section.preferences"),
                    icon: "slider.horizontal.3"
                ) {
                    VStack(spacing: 14) {
                        SettingsToggleField(title: L10n.tr("account.showAge"), isOn: $showAge)
                        SettingsToggleField(title: L10n.tr("account.showDistance"), isOn: $showDistance)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.top, 2)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(accountBackground.ignoresSafeArea())
    }

    private var notificationSettings: some View {
        ScrollView {
            VStack(spacing: 18) {
                AccountCard(
                    title: L10n.tr("account.notifications"),
                    icon: "bell.fill"
                ) {
                    VStack(spacing: 14) {
                        SettingsToggleField(title: L10n.tr("account.notifications"), isOn: $notificationsEnabled)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.top, 2)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(accountBackground.ignoresSafeArea())
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
            .padding(.top, 2)
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

    private var sendButtonColorOneBinding: Binding<Color> {
        Binding(
            get: { Color(hex: sendButtonColor1Hex) ?? .orange },
            set: { sendButtonColor1Hex = $0.hexRGB ?? "#FF9A00" }
        )
    }

    private var chatBackgroundGradientColors: [Color] {
        [
            Color(hex: chatBackgroundColor1Hex),
            Color(hex: chatBackgroundColor2Hex),
            Color(hex: chatBackgroundColor3Hex)
        ]
        .compactMap { $0 }
    }

    private var chatBackgroundColorOneBinding: Binding<Color> {
        Binding(
            get: { Color(hex: chatBackgroundColor1Hex) ?? Color(red: 0.25, green: 0.28, blue: 0.33) },
            set: { chatBackgroundColor1Hex = $0.hexRGB ?? "#3F4755" }
        )
    }

    private var chatBackgroundColorTwoBinding: Binding<Color> {
        Binding(
            get: { Color(hex: chatBackgroundColor2Hex) ?? Color(red: 0.55, green: 0.48, blue: 0.46) },
            set: { chatBackgroundColor2Hex = $0.hexRGB ?? "#8B7A74" }
        )
    }

    private var chatBackgroundColorThreeBinding: Binding<Color> {
        Binding(
            get: { Color(hex: chatBackgroundColor3Hex) ?? Color(red: 0.73, green: 0.66, blue: 0.61) },
            set: { chatBackgroundColor3Hex = $0.hexRGB ?? "#B9A89B" }
        )
    }

    private var sendButtonColorTwoBinding: Binding<Color> {
        Binding(
            get: { Color(hex: sendButtonColor2Hex) ?? Color(red: 1.0, green: 0.54, blue: 0.12) },
            set: { sendButtonColor2Hex = $0.hexRGB ?? "#FF8A1F" }
        )
    }

    private var sendButtonColorThreeBinding: Binding<Color> {
        Binding(
            get: { Color(hex: sendButtonColor3Hex) ?? Color(red: 0.88, green: 0.30, blue: 0.20) },
            set: { sendButtonColor3Hex = $0.hexRGB ?? "#E14D33" }
        )
    }

    private var cardDivider: some View {
        Divider()
            .overlay(.white.opacity(0.08))
    }

    private var informationHintText: Text {
        let localized = L10n.tr("profile.section.informationHint")

        guard let emailRange = localized.range(of: supportEmail) else {
            return Text(localized)
        }

        let beforeEmail = String(localized[..<emailRange.lowerBound])
        let afterEmail = String(localized[emailRange.upperBound...])

        return Text(beforeEmail) + Text(supportEmail).bold() + Text(afterEmail)
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

    @ViewBuilder
    private func sectionEyebrow(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 19, weight: .bold, design: .default))
            .foregroundStyle(.primary)
            .padding(.horizontal, 4)
    }

    @ViewBuilder
    private func settingsNavigationRow(_ destination: SettingsDestination) -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.white.opacity(0.04))
                .frame(width: 30, height: 30)
                .overlay {
                    Image(systemName: destination.iconName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.orange)
                }

            Text(L10n.tr(destination.titleKey))
                .font(.body)
                .fontWeight(.bold)
                .foregroundStyle(.primary)

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func applyChatBackgroundStyle(_ style: ChatBackgroundStyle) {
        chatBackgroundStyle = style.rawValue
        chatBackgroundStyleSelection = style.rawValue
        chatBackgroundSettingsMessage = nil
        chatBackgroundSettingsMessageIsError = false
    }

    private func applyCustomChatBackgroundGradient() {
        chatBackgroundStyle = ChatBackgroundStyle.customGradient.rawValue
        chatBackgroundStyleSelection = ChatBackgroundStyle.customGradient.rawValue
        chatBackgroundSettingsMessage = L10n.tr("account.chatBackground.customApplied")
        chatBackgroundSettingsMessageIsError = false
    }

    private func fillFromUser() {
        // Sync the editable fields from storage before autosave or validation kicks in.
        isHydratingProfileForm = true
        firstName = store.currentUser?.firstName ?? ""
        lastName = store.currentUser?.lastName ?? ""
        city = store.currentUser?.city ?? ""
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
            city: city,
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
            city: user.city ?? "",
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
              !isSavingProfile,
              pendingDangerousOrientation == nil,
              editableProfileDraft != storedEditableProfileDraft else { return }

        try? await Task.sleep(nanoseconds: 700_000_000)
        guard !Task.isCancelled,
              hasLoadedProfileForm,
              !isHydratingProfileForm,
              !isSavingProfile,
              pendingDangerousOrientation == nil,
              editableProfileDraft != storedEditableProfileDraft else { return }

        await performProfileSave(showSuccessMessage: false)
    }

    @MainActor
    private func performProfileSave(
        orientationOverride: UserOrientation? = nil,
        notifyEventRemoval: Bool = false,
        showSuccessMessage: Bool = false
    ) async {
        guard !isSavingProfile else { return }

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

        isSavingProfile = true

        let result = await store.updateProfile(
            firstName: firstName,
            lastName: lastName,
            city: city,
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

        isSavingProfile = false
    }

    @MainActor
    private func performLogout() async {
        guard !isLoggingOut else { return }
        isLoggingOut = true
        await store.logOut()
        isLoggingOut = false
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
    var subtitleText: Text? = nil
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

                    if let subtitleText {
                        subtitleText
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else if let subtitle {
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

private struct SettingsToggleField: View {
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

private struct SettingsPickerField: View {
    let title: String
    @Binding var selection: String
    let options: [String]
    let titleForOption: (String) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

            Picker(title, selection: $selection) {
                ForEach(options, id: \.self) { option in
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

private struct SendButtonGradientSettings: View {
    @Binding var colorOne: Color
    @Binding var colorTwo: Color
    @Binding var colorThree: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.tr("account.sendButtonGradient"))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                SendButtonColorSwatch(title: L10n.tr("account.sendButtonGradient.color1"), color: $colorOne)
                SendButtonColorSwatch(title: L10n.tr("account.sendButtonGradient.color2"), color: $colorTwo)
                SendButtonColorSwatch(title: L10n.tr("account.sendButtonGradient.color3"), color: $colorThree)
            }

            Circle()
                .fill(
                    LinearGradient(
                        colors: [colorOne, colorTwo, colorThree],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 44, height: 44)
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.28), lineWidth: 1)
                }
                .overlay {
                    Image(systemName: "paperplane.fill")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ChatBackgroundGradientSettings: View {
    @Binding var colorOne: Color
    @Binding var colorTwo: Color
    @Binding var colorThree: Color
    let onApply: () -> Void

    @State private var draftColorOne: Color
    @State private var draftColorTwo: Color
    @State private var draftColorThree: Color

    init(
        colorOne: Binding<Color>,
        colorTwo: Binding<Color>,
        colorThree: Binding<Color>,
        onApply: @escaping () -> Void
    ) {
        self._colorOne = colorOne
        self._colorTwo = colorTwo
        self._colorThree = colorThree
        self.onApply = onApply
        _draftColorOne = State(initialValue: colorOne.wrappedValue)
        _draftColorTwo = State(initialValue: colorTwo.wrappedValue)
        _draftColorThree = State(initialValue: colorThree.wrappedValue)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L10n.tr("account.chatBackgroundGradient"))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                SendButtonColorSwatch(title: L10n.tr("account.sendButtonGradient.color1"), color: $draftColorOne)
                SendButtonColorSwatch(title: L10n.tr("account.sendButtonGradient.color2"), color: $draftColorTwo)
                SendButtonColorSwatch(title: L10n.tr("account.sendButtonGradient.color3"), color: $draftColorThree)
            }

            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [draftColorOne, draftColorTwo, draftColorThree],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(height: 88)
                .overlay {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                }
                .overlay(alignment: .bottomLeading) {
                    Text(L10n.tr("chat.message.placeholder"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.92))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                }

            Button(L10n.tr("common.apply")) {
                colorOne = draftColorOne
                colorTwo = draftColorTwo
                colorThree = draftColorThree
                onApply()
            }
            .buttonStyle(AccountPrimaryButtonStyle())
            .disabled(!hasPendingChanges)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var hasPendingChanges: Bool {
        draftColorOne.hexRGB != colorOne.hexRGB
            || draftColorTwo.hexRGB != colorTwo.hexRGB
            || draftColorThree.hexRGB != colorThree.hexRGB
    }
}

private struct SendButtonColorSwatch: View {
    let title: String
    @Binding var color: Color

    var body: some View {
        VStack(spacing: 8) {
            ColorPicker(title, selection: $color, supportsOpacity: false)
                .labelsHidden()

            Circle()
                .fill(color)
                .frame(width: 28, height: 28)
                .overlay {
                    Circle()
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                }

            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
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

private struct ChatBackgroundConfirmationView: View {
    let preview: PendingChatBackgroundPreview
    @Binding var brightness: Double
    let backgroundGradientColors: [Color]
    let outgoingPalette: ChatBubblePalette
    let incomingPalette: ChatBubblePalette
    let onCancel: () -> Void
    let onApply: () -> Void
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            previewBackground

            Rectangle()
                .fill(.black.opacity(colorScheme == .dark ? 0.10 : 0.04))
                .ignoresSafeArea()

            VStack {
                Spacer(minLength: 0)
                VStack(spacing: 16) {
                    previewBubble(
                        text: "Hey, this feels better.",
                        palette: incomingPalette,
                        isOutgoing: false,
                        alignment: .leading
                    )

                    previewBubble(
                        text: "Much closer to the real chat.",
                        palette: outgoingPalette,
                        isOutgoing: true,
                        alignment: .trailing
                    )
                }
                .padding(.horizontal, 18)
                Spacer(minLength: 0)
            }
        }
        .safeAreaInset(edge: .top) {
            previewTopBar
        }
        .safeAreaInset(edge: .bottom) {
            previewBottomBar
        }
    }

    @ViewBuilder
    private var previewBackground: some View {
        preview.style.backgroundView(
            colorScheme: colorScheme,
            customGradientColors: backgroundGradientColors
        )
        .brightness(brightness)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .ignoresSafeArea()
    }

    @ViewBuilder
    private var previewTopBar: some View {
        if #available(iOS 26.0, *) {
            HStack {
                Button(action: onCancel) {
                    Image(systemName: "chevron.left")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background {
                            Circle()
                                .fill(.clear)
                                .glassEffect(in: Circle())
                        }
                }
                .buttonStyle(.plain)

                Spacer(minLength: 16)

                Button(action: onApply) {
                    Text(L10n.tr("common.apply"))
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .frame(height: 44)
                        .background {
                            Capsule(style: .continuous)
                                .fill(.clear)
                                .glassEffect(in: Capsule(style: .continuous))
                                .overlay {
                                    Capsule(style: .continuous)
                                        .fill(topBarPrimaryBackground.opacity(0.78))
                                }
                        }
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 12)
            .background(
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(alignment: .bottom) {
                        Rectangle()
                            .fill(.white.opacity(0.08))
                            .frame(height: 1)
                    }
                    .ignoresSafeArea(edges: .top)
            )
        } else {
            HStack(spacing: 12) {
                Button(action: onCancel) {
                    Image(systemName: "chevron.left")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.orange)
                        .frame(width: 44, height: 44, alignment: .leading)
                }
                .buttonStyle(.plain)

                Spacer(minLength: 0)

                Button(action: onApply) {
                    Text(L10n.tr("common.apply"))
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.orange)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 10)
            .background(
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(alignment: .bottom) {
                        Rectangle()
                            .fill(.white.opacity(0.10))
                            .frame(height: 1)
                    }
                    .ignoresSafeArea(edges: .top)
            )
        }
    }

    private var topBarPrimaryBackground: LinearGradient {
        LinearGradient(
            colors: [.orange, .orange.opacity(0.82)],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    private var brightnessControl: some View {
        HStack(spacing: 10) {
            Image(systemName: "sun.min.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white.opacity(0.88))

            Slider(value: $brightness, in: -0.35...0.35)
                .tint(.orange)
                .frame(width: 132)

            Image(systemName: "sun.max.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white.opacity(0.88))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background {
            if #available(iOS 26.0, *) {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(.clear)
                    .glassEffect(in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            } else {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(.ultraThinMaterial)
            }
        }
    }

    private var previewBottomBar: some View {
        HStack(alignment: .center, spacing: 12) {
            brightnessControl

            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay {
                    HStack(spacing: 10) {
                        Image(systemName: "plus")
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.70))

                        Text(L10n.tr("chat.message.placeholder"))
                            .font(.body)
                            .foregroundStyle(.white.opacity(0.70))

                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 16)
                }
                .frame(height: 52)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(.white.opacity(0.08))
                        .frame(height: 1)
                }
                .ignoresSafeArea(edges: .bottom)
        )
    }

    @ViewBuilder
    private func previewBubble(
        text: String,
        palette: ChatBubblePalette,
        isOutgoing: Bool,
        alignment: HorizontalAlignment
    ) -> some View {
        HStack {
            if isOutgoing { Spacer(minLength: 48) }

            Text(text)
                .font(.body)
                .foregroundStyle(palette.textColor(colorScheme: colorScheme, isOutgoing: isOutgoing))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(palette.fillStyle(colorScheme: colorScheme, isOutgoing: isOutgoing))
                        .overlay {
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(palette.strokeColor(colorScheme: colorScheme, isOutgoing: isOutgoing), lineWidth: 1)
                        }
                )
                .frame(maxWidth: UIScreen.main.bounds.width * 0.72, alignment: isOutgoing ? .trailing : .leading)

            if !isOutgoing { Spacer(minLength: 48) }
        }
        .frame(maxWidth: .infinity, alignment: isOutgoing ? .trailing : .leading)
    }
}
