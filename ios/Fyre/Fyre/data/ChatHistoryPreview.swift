#if DEBUG
import SwiftUI

/// Offline fixture for exercising the real chat scroll view in UI tests.
enum ChatHistoryPreview {
    static var isEnabled: Bool { ProcessInfo.processInfo.arguments.contains("-uitest-chat-history") }
    static let backend = PreviewBackend()
    static let services = AppServices(backend: backend)
    static let thread = ChatThread(
        id: UUID(), remoteId: "preview-thread", name: "History preview", avatar: "", isOnline: false,
        lastSeenAt: nil, currentUserReadAt: Date(), otherParticipantReadAt: nil,
        participantUserIds: [], notificationsEnabled: false, relationshipState: .matched,
        messages: (51...100).map { ChatMessage(dto: message($0)) }, olderMessagesCursor: "51"
    )

    static func message(_ number: Int) -> MessageDTO {
        MessageDTO(id: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", number))!,
                   remoteId: "\(number)", text: "History message \(number)", messageType: .text,
                   attachment: nil, isMe: false, time: "12:00", sentAt: Date(timeIntervalSince1970: Double(number)),
                   replyToRemoteId: nil, replyPreviewText: nil)
    }

    actor PreviewBackend: BackendAPI {
        private var hasFailed = false
        func fetchMessagePage(threadId: String, before cursor: String) async throws -> MessagePageDTO {
            // Keep the old page visible long enough for the UI test to stop
            // scrolling before verifying restoration after automatic pagination.
            let delay: Duration = ProcessInfo.processInfo.arguments.contains("-uitest-history-delayed")
                ? .seconds(3) : .milliseconds(400)
            try await Task.sleep(for: delay)
            if !hasFailed, ProcessInfo.processInfo.arguments.contains("-uitest-history-error") {
                hasFailed = true
                throw URLError(.notConnectedToInternet)
            }
            return await MainActor.run {
                MessagePageDTO(messages: (1...50).map { ChatHistoryPreview.message($0) }, nextCursor: nil)
            }
        }
        func fetchThread(threadId: String) async throws -> ThreadDTO? { nil }
        func fetchThreads() async throws -> [ThreadDTO] { [] }
        func fetchDiscoverProfiles() async throws -> [DiscoverProfileDTO] { [] }
        func createOrGetThread(otherUserId: String) async throws -> ThreadDTO { throw URLError(.unsupportedURL) }
        func sendMessage(threadId: String, attempt: OutgoingMessageAttempt) async throws -> MessageDTO { throw URLError(.unsupportedURL) }
        func submitSwipe(otherUserId: String, otherUserName: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO? { nil }
        func updateRelationship(threadId: String, action: RelationshipActionDTO) async throws {}
        func updateThreadNotifications(threadId: String, enabled: Bool) async throws {}
        func markCurrentUserPresence(isOnline: Bool) async {}
        func markThreadRead(threadId: String) async {}
        func fetchAttachmentData(fileId: String) async throws -> Data? { nil }
    }
}
#endif
