//
//  EventsView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 20/03/26.
//

import SwiftUI

struct EventsView: View {
    @Environment(UserStore.self) private var store

    // Reuse the same formatter for the event preview card so date styling stays consistent.
    private static let previewDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        formatter.timeStyle = .short
        return formatter
    }()

    // Keep the deadline display localized while still using a compact template.
    private static let previewDeadlineFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("EEE d MMM HH:mm")
        return formatter
    }()

    var body: some View {
        let snapshot = store.mainEventSnapshot

        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    NavigationLink {
                        EventDetailView()
                    } label: {
                        EventPreviewCard(
                            snapshot: snapshot,
                            dateText: Self.previewDateFormatter.string(from: snapshot.date),
                            deadlineText: String(
                                format: L10n.tr("events.preview.deadline"),
                                Self.previewDeadlineFormatter.string(
                                    from: snapshot.effectiveRegistrationClosesAt
                                )
                            ),
                            venueText: L10n.tr("events.info.club"),
                            registrationText: registrationBadgeText
                        )
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
                .padding(.top, 12)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .background(EventScreenBackground().ignoresSafeArea())
            .navigationTitle(L10n.tr("tab.events"))
        }
        .task {
            await store.refreshRemoteMainEventState()
        }
    }

    private var registrationBadgeText: String? {
        // Show only the state that matters to the current user on the preview card.
        if store.isCurrentUserRegisteredForMainEvent {
            return L10n.tr("events.badge.confirmed")
        }

        if store.isCurrentUserWaitingForMainEvent {
            return L10n.tr("events.badge.waitlisted")
        }

        return nil
    }
}

struct EventDetailView: View {
    @Environment(UserStore.self) private var store
    @State private var feedbackMessage: String?
    @State private var feedbackIsError = false
    @State private var isSubmitting = false
    @State private var adminTitle = ""
    @State private var adminStartsAt = Date()
    @State private var adminMaxParticipants = 48
    @State private var adminMaleLimit = 24
    @State private var adminFemaleLimit = 24
    @State private var adminRegistrationClosesAt = Date().addingTimeInterval(24 * 60 * 60)
    @State private var adminCancellationClosesAt = Date().addingTimeInterval(48 * 60 * 60)
    @State private var adminUsesRegistrationClose = false
    @State private var adminUsesCancellationClose = false
    @State private var adminScopedUserIds = ""
    @State private var adminScopedEmails = ""
    @State private var adminLookup = ""
    @State private var adminAddStatus: EventHistoryStatus = .confirmed

    // The detail screen uses its own formatter because it lives in a different layout context.
    private static let detailDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        formatter.timeStyle = .short
        return formatter
    }()

    // Refresh the countdown text periodically without rebuilding the whole view tree.
    private static let countdownFormatter: DateComponentsFormatter = {
        let formatter = DateComponentsFormatter()
        formatter.unitsStyle = .abbreviated
        formatter.allowedUnits = [.day, .hour, .minute]
        formatter.maximumUnitCount = 2
        return formatter
    }()

    var body: some View {
        let snapshot = store.mainEventSnapshot
        let adminState = store.mainEventAdminState

        ScrollView {
            VStack(spacing: 20) {
                EventPosterHero(
                    snapshot: snapshot,
                    dateText: Self.detailDateFormatter.string(from: snapshot.date),
                    venueText: L10n.tr("events.info.club"),
                    registrationText: registrationBadgeText
                )

                EventSurface(title: L10n.tr("events.section.mainEvent"), icon: "sparkles") {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(snapshot.title)
                            .font(.title2.weight(.bold))
                            .fixedSize(horizontal: false, vertical: true)

                        Text(L10n.tr("events.info.exclusive"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        ViewThatFits(in: .horizontal) {
                            HStack(alignment: .top, spacing: 10) {
                                EventFeatureBadge(text: L10n.tr("events.info.buffet"), icon: "fork.knife")
                                EventFeatureBadge(text: L10n.tr("events.info.welcomeDrink"), icon: "sparkles")
                            }

                            VStack(alignment: .leading, spacing: 10) {
                                EventFeatureBadge(text: L10n.tr("events.info.buffet"), icon: "fork.knife")
                                EventFeatureBadge(text: L10n.tr("events.info.welcomeDrink"), icon: "sparkles")
                            }
                        }

                        EventInfoLine(icon: "tshirt.fill", text: L10n.tr("events.info.dressCode"))
                    }
                }

                EventSurface(title: L10n.tr("events.section.info"), icon: "mappin.and.ellipse") {
                    VStack(alignment: .leading, spacing: 14) {
                        EventInfoLine(icon: "building.2.fill", text: L10n.tr("events.info.club"))
                        EventInfoLine(icon: "location.fill", text: L10n.tr("events.info.address"))
                        EventInfoLine(icon: "clock.fill", text: L10n.tr("events.info.time"))
                        EventInfoLine(icon: "eurosign.circle.fill", text: L10n.tr("events.info.contribution"))
                        EventInfoLine(icon: "phone.fill", text: L10n.tr("events.info.contact"))
                        EventInfoLine(icon: "person.2.fill", text: L10n.tr("events.rule.staff"))
                    }
                }

                EventSurface(title: L10n.tr("events.section.rules"), icon: "checklist") {
                    VStack(alignment: .leading, spacing: 12) {
                        EventInfoLine(icon: "door.left.hand.open", text: L10n.tr("events.rule.maxParticipants"))
                        EventInfoLine(icon: "equal.circle.fill", text: L10n.tr("events.rule.balance"))
                        EventInfoLine(icon: "calendar.badge.minus", text: L10n.tr("events.rule.cancel48h"))
                        EventInfoLine(icon: "lock.circle.fill", text: L10n.tr("events.rule.lock24h"))
                    }
                }

                EventSurface(title: L10n.tr("events.section.live"), icon: "waveform.path.ecg") {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(String(format: L10n.tr("events.capacity"), snapshot.totalCount, snapshot.maxParticipants))
                                    .font(.headline)
                                Spacer()
                                Text(String(format: L10n.tr("events.waitingCount"), snapshot.waitingListCount))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }

                            ProgressView(
                                value: Double(snapshot.totalCount),
                                total: Double(snapshot.maxParticipants)
                            )
                            .tint(.orange)
                        }

                        HStack(spacing: 12) {
                            EventMetricTile(
                                title: L10n.tr("events.label.male"),
                                value: String(format: L10n.tr("events.maleCount"), snapshot.maleCount),
                                accent: .blue
                            )
                            EventMetricTile(
                                title: L10n.tr("events.label.female"),
                                value: String(format: L10n.tr("events.femaleCount"), snapshot.femaleCount),
                                accent: .pink
                            )
                        }

                        HStack(spacing: 12) {
                            EventMetricTile(
                                title: "M",
                                value: String(snapshot.remainingMaleSlots),
                                caption: String(format: L10n.tr("events.preview.remaining"), snapshot.remainingMaleSlots, snapshot.remainingFemaleSlots),
                                accent: .orange
                            )
                            EventMetricTile(
                                title: "F",
                                value: String(snapshot.remainingFemaleSlots),
                                caption: String(format: L10n.tr("events.waitingCount"), snapshot.waitingListCount),
                                accent: .purple
                            )
                        }

                        TimelineView(.periodic(from: .now, by: 60)) { context in
                            VStack(alignment: .leading, spacing: 8) {
                                EventInfoLine(
                                    icon: "clock.arrow.2.circlepath",
                                    text: String(
                                        format: L10n.tr("events.countdown.cancel"),
                                        countdownText(
                                            until: snapshot.effectiveCancellationClosesAt,
                                            now: context.date
                                        )
                                    )
                                )

                                EventInfoLine(
                                    icon: "lock.fill",
                                    text: String(
                                        format: L10n.tr("events.countdown.lock"),
                                        countdownText(
                                            until: snapshot.effectiveRegistrationClosesAt,
                                            now: context.date
                                        )
                                    )
                                )
                            }
                        }
                    }
                }

                if let adminState {
                    EventSurface(title: L10n.tr("events.admin.section"), icon: "person.badge.key.fill") {
                        VStack(alignment: .leading, spacing: 16) {
                            Text(L10n.tr("events.admin.subtitle"))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            Divider().overlay(.white.opacity(0.08))

                            VStack(alignment: .leading, spacing: 12) {
                                Text(L10n.tr("events.admin.editEvent"))
                                    .font(.headline)

                                adminInputField(L10n.tr("events.admin.field.title"), text: $adminTitle, capitalization: .words)

                                DatePicker(
                                    L10n.tr("events.admin.field.startsAt"),
                                    selection: $adminStartsAt,
                                    displayedComponents: [.date, .hourAndMinute]
                                )

                                Stepper(
                                    String(format: L10n.tr("events.admin.field.maxParticipants.value"), adminMaxParticipants),
                                    value: $adminMaxParticipants,
                                    in: 2...200,
                                    step: 2
                                )

                                Stepper(
                                    String(format: L10n.tr("events.admin.field.maleLimit.value"), adminMaleLimit),
                                    value: $adminMaleLimit,
                                    in: 0...200
                                )

                                Stepper(
                                    String(format: L10n.tr("events.admin.field.femaleLimit.value"), adminFemaleLimit),
                                    value: $adminFemaleLimit,
                                    in: 0...200
                                )

                                Toggle(L10n.tr("events.admin.field.registrationClosesAt"), isOn: $adminUsesRegistrationClose)
                                if adminUsesRegistrationClose {
                                    DatePicker(
                                        "",
                                        selection: $adminRegistrationClosesAt,
                                        displayedComponents: [.date, .hourAndMinute]
                                    )
                                    .labelsHidden()
                                }

                                Toggle(L10n.tr("events.admin.field.cancellationClosesAt"), isOn: $adminUsesCancellationClose)
                                if adminUsesCancellationClose {
                                    DatePicker(
                                        "",
                                        selection: $adminCancellationClosesAt,
                                        displayedComponents: [.date, .hourAndMinute]
                                    )
                                    .labelsHidden()
                                }

                                Text(L10n.tr("events.admin.access"))
                                    .font(.headline)
                                    .padding(.top, 8)

                                Text(L10n.tr("events.admin.access.subtitle"))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)

                                adminInputField(L10n.tr("events.admin.field.adminEmails"), text: $adminScopedEmails, capitalization: .never, axis: .vertical)
                                adminInputField(L10n.tr("events.admin.field.adminUserIds"), text: $adminScopedUserIds, capitalization: .never, axis: .vertical)

                                Button {
                                    saveAdminChanges()
                                } label: {
                                    Label(L10n.tr("events.admin.save"), systemImage: "square.and.arrow.down")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(.orange)
                                .disabled(isSubmitting)
                            }

                            Divider().overlay(.white.opacity(0.08))

                            VStack(alignment: .leading, spacing: 12) {
                                Text(L10n.tr("events.admin.participants"))
                                    .font(.headline)

                                TextField(L10n.tr("events.admin.userLookup"), text: $adminLookup)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .padding(12)
                                    .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                                Picker(L10n.tr("events.admin.status"), selection: $adminAddStatus) {
                                    Text(L10n.tr("events.badge.confirmed")).tag(EventHistoryStatus.confirmed)
                                    Text(L10n.tr("events.badge.waitlisted")).tag(EventHistoryStatus.waitlisted)
                                }
                                .pickerStyle(.segmented)

                                Button {
                                    addParticipant()
                                } label: {
                                    Label(L10n.tr("events.admin.add"), systemImage: "person.badge.plus")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                .disabled(isSubmitting || adminLookup.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                                if adminState.participants.isEmpty {
                                    Text(L10n.tr("events.admin.emptyParticipants"))
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                } else {
                                    VStack(spacing: 10) {
                                        ForEach(adminState.participants) { participant in
                                            adminParticipantRow(participant)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.top, 12)
            .padding(.bottom, 120)
        }
        .scrollIndicators(.hidden)
        .background(EventScreenBackground().ignoresSafeArea())
        .navigationTitle(L10n.tr("events.detail.title"))
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            EventActionBar(
                title: actionTitle,
                role: actionRole,
                message: feedbackMessage,
                isError: feedbackIsError,
                isLoading: isSubmitting,
                action: performPrimaryAction
            )
        }
        .task(id: adminSyncKey(adminState)) {
            syncAdminDraft(from: adminState)
        }
    }

    private var registrationBadgeText: String? {
        if store.isCurrentUserRegisteredForMainEvent {
            return L10n.tr("events.badge.confirmed")
        }

        if store.isCurrentUserWaitingForMainEvent {
            return L10n.tr("events.badge.waitlisted")
        }

        return nil
    }

    private var actionTitle: String {
        // Use a single primary action area and adapt the label to the registration state.
        if store.isCurrentUserRegisteredForMainEvent {
            return L10n.tr("events.action.cancel")
        }

        if store.isCurrentUserWaitingForMainEvent {
            return L10n.tr("events.action.leaveWaiting")
        }

        return L10n.tr("events.action.join")
    }

    private var actionRole: ButtonRole? {
        store.isCurrentUserRegisteredForMainEvent || store.isCurrentUserWaitingForMainEvent ? .destructive : nil
    }

    private func performPrimaryAction() {
        guard !isSubmitting else { return }
        isSubmitting = true

        Task {
            // Keep join/leave in one branch so the action bar always mirrors the latest registration state.
            if store.isCurrentUserRegisteredForMainEvent {
                let error = await store.cancelMainEventRegistration()
                await MainActor.run {
                    feedbackMessage = error ?? L10n.tr("events.success.cancelled")
                    feedbackIsError = error != nil
                    isSubmitting = false
                }
                return
            }

            if store.isCurrentUserWaitingForMainEvent {
                let error = await store.cancelMainEventRegistration()
                await MainActor.run {
                    feedbackMessage = error ?? L10n.tr("events.success.waitingLeft")
                    feedbackIsError = error != nil
                    isSubmitting = false
                }
                return
            }

            let message = await store.registerForMainEvent()
            await MainActor.run {
                feedbackMessage = message ?? L10n.tr("events.success.joined")
                feedbackIsError = message != nil && message != L10n.tr("events.success.waitlisted")
                isSubmitting = false
            }
        }
    }

    private func countdownText(until date: Date, now: Date) -> String {
        guard date > now else { return L10n.tr("events.countdown.closed") }
        return Self.countdownFormatter.string(from: now, to: date) ?? L10n.tr("events.countdown.soon")
    }

    private func syncAdminDraft(from adminState: EventAdminState?) {
        guard let adminState else {
            return
        }

        adminTitle = adminState.title
        adminStartsAt = adminState.startsAt
        adminMaxParticipants = adminState.maxParticipants
        adminMaleLimit = adminState.maleLimit
        adminFemaleLimit = adminState.femaleLimit
        adminUsesRegistrationClose = adminState.registrationClosesAt != nil
        adminRegistrationClosesAt = adminState.registrationClosesAt ?? adminState.startsAt.addingTimeInterval(-(24 * 60 * 60))
        adminUsesCancellationClose = adminState.cancellationClosesAt != nil
        adminCancellationClosesAt = adminState.cancellationClosesAt ?? adminState.startsAt.addingTimeInterval(-(48 * 60 * 60))
        adminScopedUserIds = adminState.adminUserIds
        adminScopedEmails = adminState.adminEmails
    }

    private func saveAdminChanges() {
        guard !isSubmitting else { return }
        isSubmitting = true

        let draft = EventAdminDraft(
            title: adminTitle.trimmingCharacters(in: .whitespacesAndNewlines),
            startsAt: adminStartsAt,
            maxParticipants: max(2, adminMaxParticipants),
            maleLimit: max(0, adminMaleLimit),
            femaleLimit: max(0, adminFemaleLimit),
            registrationClosesAt: adminUsesRegistrationClose ? adminRegistrationClosesAt : nil,
            cancellationClosesAt: adminUsesCancellationClose ? adminCancellationClosesAt : nil,
            adminUserIds: adminScopedUserIds.trimmingCharacters(in: .whitespacesAndNewlines),
            adminEmails: adminScopedEmails.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        Task {
            let error = await store.updateMainEventAsAdmin(draft)
            await MainActor.run {
                feedbackMessage = error ?? L10n.tr("events.admin.success.updated")
                feedbackIsError = error != nil
                isSubmitting = false
            }
        }
    }

    private func addParticipant() {
        let trimmedLookup = adminLookup.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedLookup.isEmpty, !isSubmitting else { return }
        isSubmitting = true

        Task {
            let error = await store.addMainEventParticipantAsAdmin(lookup: trimmedLookup, status: adminAddStatus)
            await MainActor.run {
                feedbackMessage = error ?? L10n.tr("events.admin.success.participantAdded")
                feedbackIsError = error != nil
                if error == nil {
                    adminLookup = ""
                }
                isSubmitting = false
            }
        }
    }

    @ViewBuilder
    private func adminParticipantRow(_ participant: EventAdminParticipant) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(participant.displayName)
                    .font(.subheadline.weight(.semibold))
                Text(participant.email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Text(statusLabel(for: participant.status))
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(statusColor(for: participant.status).opacity(0.18), in: Capsule())
                        .foregroundStyle(statusColor(for: participant.status))

                    if let gender = participant.gender {
                        Text(gender.rawValue.capitalized)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            Button(role: .destructive) {
                removeParticipant(participant)
            } label: {
                Image(systemName: "trash")
            }
            .buttonStyle(.borderless)
            .foregroundStyle(.red)
            .disabled(isSubmitting)
        }
        .padding(12)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func removeParticipant(_ participant: EventAdminParticipant) {
        guard !isSubmitting else { return }
        isSubmitting = true

        Task {
            let error = await store.removeMainEventParticipantAsAdmin(registrationId: participant.id)
            await MainActor.run {
                feedbackMessage = error ?? L10n.tr("events.admin.success.participantRemoved")
                feedbackIsError = error != nil
                isSubmitting = false
            }
        }
    }

    private func statusLabel(for status: EventHistoryStatus) -> String {
        switch status {
        case .confirmed:
            return L10n.tr("events.badge.confirmed")
        case .waitlisted:
            return L10n.tr("events.badge.waitlisted")
        case .cancelled:
            return L10n.tr("events.admin.participant.cancelled")
        case .promoted:
            return L10n.tr("events.admin.participant.promoted")
        }
    }

    private func statusColor(for status: EventHistoryStatus) -> Color {
        switch status {
        case .confirmed:
            return .green
        case .waitlisted:
            return .orange
        case .cancelled:
            return .red
        case .promoted:
            return .blue
        }
    }

    private func adminSyncKey(_ adminState: EventAdminState?) -> String {
        guard let adminState else { return "none" }
        return [
            adminState.eventId,
            adminState.title,
            String(adminState.startsAt.timeIntervalSince1970),
            String(adminState.maxParticipants),
            String(adminState.maleLimit),
            String(adminState.femaleLimit),
            adminState.registrationClosesAt.map { String($0.timeIntervalSince1970) } ?? "nil",
            adminState.cancellationClosesAt.map { String($0.timeIntervalSince1970) } ?? "nil",
            adminState.adminUserIds,
            adminState.adminEmails
        ].joined(separator: "|")
    }

    @ViewBuilder
    private func adminInputField(
        _ title: String,
        text: Binding<String>,
        capitalization: TextInputAutocapitalization = .sentences,
        axis: Axis = .horizontal
    ) -> some View {
        TextField(title, text: text, axis: axis)
            .textInputAutocapitalization(capitalization)
            .autocorrectionDisabled(capitalization == .never)
            .lineLimit(axis == .vertical ? 4 : 1)
            .padding(12)
            .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct EventPreviewCard: View {
    @Environment(\.colorScheme) private var colorScheme
    let snapshot: MainEventSnapshot
    let dateText: String
    let deadlineText: String
    let venueText: String
    let registrationText: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            EventPosterSection(
                height: 280,
                gradientColors: [.clear, .black.opacity(0.18), .black.opacity(0.85)],
                contentPadding: 20
            ) {
                VStack(alignment: .leading, spacing: 12) {
                    if let registrationText {
                        Text(registrationText)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(.orange.opacity(0.9), in: Capsule())
                    }

                    Text(snapshot.title)
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(dateText)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.92))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 16) {
                EventInfoLine(icon: "building.2.fill", text: venueText)
                EventDeadlineBanner(text: deadlineText)

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 86), spacing: 12)],
                    alignment: .leading,
                    spacing: 12
                ) {
                    EventMiniBadge(
                        text: "M \(snapshot.maleCount)/\(max(1, snapshot.maleLimit))",
                        icon: "figure.stand"
                    )
                    EventMiniBadge(
                        text: "F \(snapshot.femaleCount)/\(max(1, snapshot.femaleLimit))",
                        icon: "figure.dress.line.vertical.figure"
                    )
                    EventMiniBadge(
                        text: "\(snapshot.totalCount)/\(snapshot.maxParticipants)",
                        icon: "person.2.fill"
                    )
                }

                Text(L10n.tr("events.info.exclusive"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(eventCardFill(for: colorScheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(eventCardStroke(for: colorScheme), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: eventCardShadow(for: colorScheme), radius: colorScheme == .dark ? 24 : 14, y: colorScheme == .dark ? 12 : 6)
    }
}

private struct EventPosterHero: View {
    @Environment(\.colorScheme) private var colorScheme
    let snapshot: MainEventSnapshot
    let dateText: String
    let venueText: String
    let registrationText: String?

    var body: some View {
        EventPosterSection(
            height: 320,
            gradientColors: [.clear, .black.opacity(0.18), .black.opacity(0.88)],
            contentPadding: 22
        ) {
            VStack(alignment: .leading, spacing: 12) {
                if let registrationText {
                    Text(registrationText)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.orange.opacity(0.92), in: Capsule())
                }

                EventPosterOverlayBadge(text: venueText, icon: "building.2.fill")

                Text(snapshot.title)
                    .font(.system(.largeTitle, design: .rounded).weight(.bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                Text(dateText)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(eventCardStroke(for: colorScheme), lineWidth: 1)
        )
        .shadow(color: eventCardShadow(for: colorScheme), radius: colorScheme == .dark ? 24 : 14, y: colorScheme == .dark ? 12 : 6)
    }
}

private struct EventPosterSection<Overlay: View>: View {
    let height: CGFloat
    let gradientColors: [Color]
    let contentPadding: CGFloat
    @ViewBuilder var overlay: Overlay

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                Image("PartyPoster")
                    .resizable()
                    .scaledToFill()
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()

                LinearGradient(
                    colors: gradientColors,
                    startPoint: .top,
                    endPoint: .bottom
                )

                overlay
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(contentPadding)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipped()
    }
}

private struct EventSurface<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let icon: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .foregroundStyle(.orange)
                    .font(.headline)
                    .frame(width: 30, height: 30)
                    .background(eventIconBadgeFill(for: colorScheme), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                Text(title)
                    .font(.title3.weight(.semibold))
            }

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(eventCardFill(for: colorScheme))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(eventCardStroke(for: colorScheme), lineWidth: 1)
        )
        .shadow(color: eventCardShadow(for: colorScheme), radius: colorScheme == .dark ? 20 : 12, y: colorScheme == .dark ? 10 : 5)
    }
}

private struct EventInfoLine: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.orange)
                .frame(width: 18, alignment: .center)

            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct EventFeatureBadge: View {
    @Environment(\.colorScheme) private var colorScheme
    let text: String
    let icon: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(.orange)
                .font(.caption.weight(.semibold))

            Text(text)
                .font(.caption.weight(.semibold))
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(eventBadgeFill(for: colorScheme), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(eventBadgeStroke(for: colorScheme), lineWidth: 1)
        )
    }
}

private struct EventDeadlineBanner: View {
    @Environment(\.colorScheme) private var colorScheme
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "hourglass")
                .foregroundStyle(.orange)
                .font(.subheadline.weight(.semibold))

            Text(text)
                .font(.caption.weight(.semibold))
                .multilineTextAlignment(.leading)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(eventDeadlineFill(for: colorScheme), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(eventDeadlineStroke(for: colorScheme), lineWidth: 1)
        )
    }
}

private struct EventMiniBadge: View {
    @Environment(\.colorScheme) private var colorScheme
    let text: String
    let icon: String

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.primary)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(eventBadgeFill(for: colorScheme), in: Capsule())
            .overlay(
                Capsule()
                    .stroke(eventBadgeStroke(for: colorScheme), lineWidth: 1)
            )
    }
}

private struct EventPosterOverlayBadge: View {
    let text: String
    let icon: String

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                .black.opacity(0.48),
                in: Capsule()
            )
            .overlay(
                Capsule()
                    .stroke(.white.opacity(0.14), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.22), radius: 10, y: 5)
    }
}

private struct EventMetricTile: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let value: String
    var caption: String? = nil
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Text(value)
                .font(.title3.weight(.bold))

            if let caption {
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(accent.opacity(colorScheme == .dark ? 0.12 : 0.16), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(accent.opacity(colorScheme == .dark ? 0.16 : 0.28), lineWidth: 1)
        )
    }
}

private struct EventActionBar: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let role: ButtonRole?
    let message: String?
    let isError: Bool
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        if #available(iOS 26.0, *) {
            VStack(spacing: 10) {
                if let message {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(isError ? Color.red : Color.secondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 9)
                        .glassEffect(in: Capsule(style: .continuous))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button(role: role, action: action) {
                    Text(title)
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .padding(.horizontal, 16)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.regular)
                .tint(role == .destructive ? .red : .orange)
                .disabled(isLoading)
                .opacity(isLoading ? 0.72 : 1)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 6)
        } else {
            VStack(spacing: 10) {
                Button(title, role: role, action: action)
                    .buttonStyle(EventPrimaryActionStyle(isDestructive: role == .destructive))
                    .disabled(isLoading)
                    .opacity(isLoading ? 0.72 : 1)

                if let message {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(isError ? .red : .secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 10)
            .background(
                Group {
                    if colorScheme == .dark {
                        Rectangle().fill(.ultraThinMaterial)
                    } else {
                        Rectangle().fill(Color(uiColor: .systemBackground).opacity(0.96))
                    }
                }
                .ignoresSafeArea(edges: .bottom)
            )
            .overlay(alignment: .top) {
                Rectangle()
                    .fill(colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.08))
                    .frame(height: 1)
            }
        }
    }
}

private struct EventPrimaryActionStyle: ButtonStyle {
    let isDestructive: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.vertical, 16)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: isDestructive
                    ? [Color.red, Color.red.opacity(0.82)]
                    : [Color.orange, Color.orange.opacity(0.82)],
                    startPoint: .leading,
                    endPoint: .trailing
                ),
                in: RoundedRectangle(cornerRadius: 20, style: .continuous)
            )
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

private struct EventScreenBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(uiColor: .systemGroupedBackground),
                Color(uiColor: .secondarySystemGroupedBackground)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

private func eventCardFill(for colorScheme: ColorScheme) -> Color {
    Color(uiColor: colorScheme == .dark ? .secondarySystemGroupedBackground : .systemBackground)
}

private func eventCardStroke(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .white.opacity(0.06) : .black.opacity(0.10)
}

private func eventCardShadow(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .black.opacity(0.18) : .black.opacity(0.10)
}

private func eventBadgeFill(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .white.opacity(0.08) : .orange.opacity(0.10)
}

private func eventBadgeStroke(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .white.opacity(0.08) : .orange.opacity(0.20)
}

private func eventDeadlineFill(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .orange.opacity(0.12) : .orange.opacity(0.16)
}

private func eventDeadlineStroke(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .orange.opacity(0.18) : .orange.opacity(0.30)
}

private func eventIconBadgeFill(for colorScheme: ColorScheme) -> Color {
    colorScheme == .dark ? .orange.opacity(0.12) : .orange.opacity(0.18)
}
