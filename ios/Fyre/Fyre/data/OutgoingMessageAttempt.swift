import CryptoKit
import Foundation

nonisolated struct OutgoingMessageDraft: Equatable, Sendable {
    let text: String
    let replyToMessageId: String?
    let attachment: OutgoingAttachmentDTO?
}

/// A failed, unchanged draft keeps its identity. A new send always gets a new ID,
/// even when its text happens to match a previously delivered message.
struct OutgoingMessageAttempt: Sendable {
    let uploadControl: UploadControl?
    let operationId: UUID
    let draft: OutgoingMessageDraft

    init(draft: OutgoingMessageDraft, retrying previous: OutgoingMessageAttempt? = nil, uploadControl: UploadControl? = nil) {
        if let previous, previous.draft == draft {
            operationId = previous.operationId
        } else {
            operationId = UUID()
        }
        self.draft = draft
        self.uploadControl = uploadControl
    }

    nonisolated static func remoteMessageId(userId: String, threadId: String, operationId: UUID) -> String {
        let key = "\(userId)\n\(threadId)\n\(operationId.uuidString.lowercased())"
        let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return "m_" + digest.prefix(32)
    }
}

struct PendingMessageUpload: Sendable {
    let attachment: UploadedAttachment
    var mayBeReferenced = false
}

struct InFlightMessageSend: Sendable {
    let draft: OutgoingMessageDraft
    let task: Task<MessageDTO, Error>
}
