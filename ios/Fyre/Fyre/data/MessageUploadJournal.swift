import CryptoKit
import Foundation

/// Store only IDs and attachment metadata, never message text or attachment bytes.
/// Missing rows are not proof that an asynchronous server execution failed.
@MainActor
enum MessageUploadJournal {
    struct Receipt: Codable, Sendable {
        let messageId: String
        let threadId: String
        let attachment: UploadedAttachment
        var recordedAt: Date? = nil
        var uploadCompleted: Bool? = nil
    }

    static func load(scope: String) throws -> [String: Receipt] {
        guard let data = try SecurePersistenceStore.data(forKey: key(scope)) else { return [:] }
        return try JSONDecoder().decode([String: Receipt].self, from: data)
    }

    static func record(_ receipt: Receipt, scope: String) throws {
        var receipts = try load(scope: scope)
        receipts[receipt.messageId] = receipt
        try SecurePersistenceStore.setData(try JSONEncoder().encode(receipts), forKey: key(scope))
    }

    static func remove(messageId: String, scope: String) throws {
        try remove(messageId: messageId, matchingFileId: nil, scope: scope)
    }

    static func remove(messageId: String, matchingFileId: String?, scope: String) throws {
        var receipts = try load(scope: scope)
        if let matchingFileId, receipts[messageId]?.attachment.fileId != matchingFileId { return }
        receipts.removeValue(forKey: messageId)
        if receipts.isEmpty { try SecurePersistenceStore.removeData(forKey: key(scope)) }
        else { try SecurePersistenceStore.setData(try JSONEncoder().encode(receipts), forKey: key(scope)) }
    }

    private static func key(_ scope: String) -> String {
        "upload.receipts.v1." + SHA256.hash(data: Data(scope.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

nonisolated enum ManagedAttachmentContract {
    static func isManaged(_ fileId: String) -> Bool {
        fileId.range(of: "^u_[a-f0-9]{32}$", options: .regularExpression) == fileId.startIndex..<fileId.endIndex
    }

    static func isManagedProfile(_ fileId: String) -> Bool {
        fileId.range(of: "^p_[a-f0-9]{32}$", options: .regularExpression) == fileId.startIndex..<fileId.endIndex
    }

    static func isReconciled(_ response: [String: Any], fileId: String, messageId: String) -> Bool {
        guard response["fileId"] as? String == fileId else { return false }
        switch response["status"] as? String {
        case "discarded": return true
        case "referenced": return response["messageId"] as? String == messageId
        default: return false
        }
    }
}
