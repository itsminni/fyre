import Foundation

enum ChatMessageReconciliation {
    static func confirmedID(for message: ChatMessage, userId: String?, threadId: String) -> String {
        guard message.isMe, let userId, message.remoteId.hasPrefix("local-"),
              let operationId = UUID(uuidString: String(message.remoteId.dropFirst(6))) else { return message.remoteId }
        return OutgoingMessageAttempt.remoteMessageId(userId: userId, threadId: threadId, operationId: operationId)
    }

    static func merge(remote: [ChatMessage], local: [ChatMessage], userId: String?, threadId: String) -> [ChatMessage] {
        let remoteIds = Set(remote.map(\.remoteId))
        let pending = local.filter {
            $0.isMe && !remoteIds.contains(confirmedID(for: $0, userId: userId, threadId: threadId))
        }
        return (remote + pending).sorted(by: ChatHistoryPagination.precedes)
    }

    static func confirm(_ confirmed: ChatMessage, optimisticId: UUID, in messages: [ChatMessage]) -> [ChatMessage] {
        let remaining = messages.filter { $0.id != optimisticId && $0.remoteId != confirmed.remoteId }
        return (remaining + [confirmed]).sorted(by: ChatHistoryPagination.precedes)
    }
}
