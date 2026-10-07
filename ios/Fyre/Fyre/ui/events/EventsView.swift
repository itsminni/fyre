import SwiftUI

struct EventsView: View {
    @Environment(UserStore.self) private var store
    @Binding var eventToOpen: String?
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVStack(spacing: 20) {
                    if store.eventRefreshFailed {
                        Text(L10n.tr("events.error.requestFailed")).foregroundStyle(.secondary)
                        Button(L10n.tr("startup.retry")) { Task { await store.refreshEventCatalog() } }
                    }
                    ForEach(store.availableEvents) { event in
                        NavigationLink(value: event.id) {
                            EventPreviewCard(
                                snapshot: event.snapshot,
                                dateText: EventDatePresentation.full(event.snapshot.date),
                                deadlineText: event.snapshot.registrationClosesAt.map { EventDatePresentation.full($0) },
                                venueText: event.snapshot.place,
                                registrationText: event.status.map { L10n.tr("events.status." + $0.rawValue) }
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("events.open.\(event.id)")
                    }
                    if store.availableEvents.isEmpty && !store.eventRefreshFailed {
                        ContentUnavailableView(L10n.tr("events.unavailable.title"), systemImage: "calendar",
                                               description: Text(L10n.tr("events.unavailable.description")))
                    }
                }
                .padding()
            }
            .refreshable { await store.refreshEventCatalog() }
            .background(EventScreenBackground().ignoresSafeArea())
            .navigationTitle(L10n.tr("tab.events"))
            .navigationDestination(for: String.self) { id in SelectedEventView(eventId: id) }
        }
        .task { await store.refreshEventCatalog(); consumeDestination() }
        .onChange(of: eventToOpen) { _, _ in consumeDestination() }
    }

    private func consumeDestination() {
        guard let id = eventToOpen else { return }
        path = [id]
        eventToOpen = nil
    }
}

struct SelectedEventView: View {
    let eventId: String
    @Environment(UserStore.self) private var store
    @State private var isLoading = true
    @State private var failed = false

    var body: some View {
        Group {
            if isLoading { ProgressView() }
            else if failed || store.loadedEventId != eventId {
                ContentUnavailableView {
                    Label(L10n.tr("events.unavailable.title"), systemImage: "calendar.badge.exclamationmark")
                } actions: {
                    Button(L10n.tr("startup.retry")) { Task { await load() } }
                }
            } else { EventDetailView() }
        }
        .task(id: eventId) { await load() }
    }

    private func load() async {
        isLoading = true
        failed = !(await store.selectEvent(id: eventId))
        isLoading = false
    }
}

// Server timestamps remain UTC instants; presentation follows the device locale and time zone.
enum EventDatePresentation {
    static func full(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.wide).day().month(.wide).year().hour().minute())
    }
}
