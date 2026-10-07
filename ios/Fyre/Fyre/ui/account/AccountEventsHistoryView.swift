//
//  AccountEventsHistoryView.swift
//  Fyre
//
//  Created by Gabriele Mininni on 20/03/26.
//

import SwiftUI

struct EventHistoryRow: View {
    let item: EventHistoryItem


    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(item.eventTitle)
                .font(.subheadline.weight(.semibold))
            Text(EventDatePresentation.full( item.eventDate))
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text(statusText(item.status))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private func statusText(_ status: EventHistoryStatus) -> String {
        // Keep the backend status codes decoupled from the localized labels shown here.
        switch status {
        case .confirmed:
            return L10n.tr("events.status.confirmed")
        case .waitlisted:
            return L10n.tr("events.status.waitlisted")
        case .cancelled:
            return L10n.tr("events.status.cancelled")
        case .promoted:
            return L10n.tr("events.status.promoted")
        }
    }
}

struct AccountEventsHistoryView: View {
    @Environment(UserStore.self) private var store

    var body: some View {
        List {
            if store.eventRefreshFailed { Text(L10n.tr("events.error.requestFailed")).foregroundStyle(.secondary) }
            if store.currentUserEventHistory.isEmpty {
                Text(L10n.tr("account.events.empty"))
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.currentUserEventHistory) { item in
                    EventHistoryRow(item: item)
                }
            }
        }
        .navigationTitle(L10n.tr("account.events.title"))
        .refreshable { await store.refreshRemoteMainEventState() }
        .task {
            // Refresh once on open so the history screen reflects server-side event changes.
            await store.refreshRemoteMainEventState()
        }
    }
}
