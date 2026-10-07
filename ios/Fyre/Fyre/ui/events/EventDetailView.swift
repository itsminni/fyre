import SwiftUI

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
    @State private var adminLookup = ""
    @State private var adminAddStatus: EventHistoryStatus = .confirmed


    // Refresh the countdown text periodically without rebuilding the whole view tree.
    private static let countdownFormatter: DateComponentsFormatter = {
        let formatter = DateComponentsFormatter()
        formatter.unitsStyle = .abbreviated
        formatter.allowedUnits = [.day, .hour, .minute]
        formatter.maximumUnitCount = 2
        return formatter
    }()

    @ViewBuilder
    var body: some View {
        if store.hasLiveMainEvent {
            liveEventBody
        } else {
            ContentUnavailableView(
                L10n.tr("events.unavailable.title"),
                systemImage: "calendar.badge.exclamationmark",
                description: Text(L10n.tr("events.unavailable.description"))
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(EventScreenBackground().ignoresSafeArea())
            .navigationTitle(L10n.tr("events.detail.title"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var liveEventBody: some View {
        let snapshot = store.mainEventSnapshot
        let adminState = store.mainEventAdminState

        return ScrollView {
            VStack(spacing: 20) {
                EventPosterHero(
                    snapshot: snapshot,
                    dateText: EventDatePresentation.full( snapshot.date),
                    venueText: snapshot.place,
                    registrationText: registrationBadgeText
                )

                EventSurface(title: L10n.tr("events.section.mainEvent"), icon: "sparkles") {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(snapshot.title)
                            .font(.title2.weight(.bold))
                            .fixedSize(horizontal: false, vertical: true)

                        if let description = snapshot.eventDescription {
                            Text(description)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if let place = snapshot.place {
                    EventSurface(title: L10n.tr("events.section.info"), icon: "mappin.and.ellipse") {
                        EventInfoLine(icon: "building.2.fill", text: place)
                    }
                }

                if !snapshot.rules.isEmpty {
                    EventSurface(title: L10n.tr("events.section.rules"), icon: "checklist") {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(snapshot.rules, id: \.self) { rule in
                                EventInfoLine(icon: "checkmark.circle.fill", text: rule)
                            }
                        }
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

                        if snapshot.cancellationClosesAt != nil || snapshot.registrationClosesAt != nil {
                            TimelineView(.periodic(from: .now, by: 60)) { context in
                                VStack(alignment: .leading, spacing: 8) {
                                    if let cancellationClosesAt = snapshot.cancellationClosesAt {
                                        EventInfoLine(
                                            icon: "clock.arrow.2.circlepath",
                                            text: String(
                                                format: L10n.tr("events.countdown.cancel"),
                                                countdownText(
                                                    until: cancellationClosesAt,
                                                    now: context.date
                                                )
                                            )
                                        )
                                    }

                                    if let registrationClosesAt = snapshot.registrationClosesAt {
                                        EventInfoLine(
                                            icon: "lock.fill",
                                            text: String(
                                                format: L10n.tr("events.countdown.lock"),
                                                countdownText(
                                                    until: registrationClosesAt,
                                                    now: context.date
                                                )
                                            )
                                        )
                                    }
                                }
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
            cancellationClosesAt: adminUsesCancellationClose ? adminCancellationClosesAt : nil
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
            adminState.cancellationClosesAt.map { String($0.timeIntervalSince1970) } ?? "nil"
        ].joined(separator: "|")
    }

    @ViewBuilder
    private func adminInputField(
        _ title: String,
        text: Binding<String>,
        capitalization: TextInputAutocapitalization = .sentences,
        disableAutocorrection: Bool = false,
        axis: Axis = .horizontal
    ) -> some View {
        TextField(title, text: text, axis: axis)
            .textInputAutocapitalization(capitalization)
            .autocorrectionDisabled(disableAutocorrection)
            .lineLimit(axis == .vertical ? 4 : 1)
            .padding(12)
            .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
