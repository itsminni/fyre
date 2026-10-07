import Foundation

/// Ordering matches the server's createdAt / $id cursor order, including equal timestamps.
enum ChatHistoryPagination {
    nonisolated static func precedes(_ lhs: ChatMessage, _ rhs: ChatMessage) -> Bool {
        lhs.sentAt == rhs.sentAt ? lhs.remoteId < rhs.remoteId : lhs.sentAt < rhs.sentAt
    }

    static func needsBridge(recent: [ChatMessage], previousNewest: ChatMessage?, cursor: String?) -> Bool {
        guard cursor != nil, let previousNewest, let oldest = recent.first else { return false }
        return precedes(previousNewest, oldest)
    }

    static func cursorAfterRefresh(current: [ChatMessage], currentCursor: String?,
                                   refreshed: [ChatMessage], refreshedCursor: String?) -> String? {
        guard let refreshedCursor else { return nil }
        guard let oldest = current.first(where: { !$0.remoteId.hasPrefix("local-") }) else { return refreshedCursor }
        // Opening an inbox preview expands a one-message window into a full history page.
        // If older pages were loaded meanwhile, retain their more advanced cursor instead.
        if let first = refreshed.first, !precedes(oldest, first) { return refreshedCursor }
        return currentCursor
    }

    static func mergeRecent(_ remote: [ChatMessage], into local: [ChatMessage], hasOlder: Bool,
                            userId: String?, threadId: String) -> [ChatMessage] {
        let ids = Set(remote.map(\.remoteId))
        let kept = local.filter { message in
            guard !ids.contains(ChatMessageReconciliation.confirmedID(for: message, userId: userId, threadId: threadId)) else { return false }
            if message.remoteId.hasPrefix("local-") { return true }
            // A recent-page refresh is authoritative only within its covered window.
            if hasOlder, let first = remote.first, precedes(message, first) { return true }
            if let last = remote.last, precedes(last, message) { return true }
            return false
        }
        return (remote + kept).sorted(by: precedes)
    }

    static func prepend(_ older: [ChatMessage], to current: [ChatMessage]) -> [ChatMessage] {
        let ids = Set(current.map(\.remoteId))
        return (older.filter { !ids.contains($0.remoteId) } + current).sorted(by: precedes)
    }
}
