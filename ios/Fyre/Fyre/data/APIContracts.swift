//
//  APIContracts.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Foundation

enum RelationshipStateDTO: String, Sendable, Codable {
    case none
    case liked
    case matched
    case archived
    case blocked
}

struct DiscoverProfileDTO: Identifiable, Sendable {
    let id: String
    let name: String
    let age: Int
    let photos: [URL]
    let compatibilityScore: Int
    let distance: Int?
    let commonInterests: [String]
    let bio: String
    let city: String?
    let gender: String?
    let intent: String?
    let instagramTag: String?
    let spotifyTag: String?
    let relationshipState: RelationshipStateDTO
}

struct DiscoverPageDTO: Sendable {
    let profiles: [DiscoverProfileDTO]
    let nextCursor: String?
}

struct ThreadDTO: Identifiable, Sendable {
    let id: UUID
    let remoteId: String
    let name: String
    let avatar: String
    let isOnline: Bool
    let lastSeenAt: Date?
    let currentUserReadAt: Date?
    let otherParticipantReadAt: Date?
    let participantUserIds: [String]
    let notificationsEnabled: Bool
    let relationshipState: RelationshipStateDTO
    let messages: [MessageDTO]
    var olderMessagesCursor: String? = nil
    var remoteUnreadCount: Int? = nil
}

struct MessagePageDTO: Sendable {
    let messages: [MessageDTO]
    let nextCursor: String?
}

enum MessageTypeDTO: String, Sendable, Codable {
    case text
    case image
    case video
    case audio
    case file
}

struct MessageAttachmentDTO: Sendable, Hashable, Codable {
    let fileId: String
    let name: String?
    let mimeType: String?
    let size: Int?
    let width: Int?
    let height: Int?
    let duration: Int?
}

nonisolated struct OutgoingAttachmentDTO: Sendable, Equatable {
    let data: Data
    let fileName: String
    let mimeType: String
    let type: MessageTypeDTO
    let size: Int
    let width: Int?
    let height: Int?
    let duration: Int?
}

struct MessageDTO: Identifiable, Sendable {
    let id: UUID
    let remoteId: String
    let text: String
    let messageType: MessageTypeDTO
    let attachment: MessageAttachmentDTO?
    let isMe: Bool
    let time: String
    let sentAt: Date
    let replyToRemoteId: String?
    let replyPreviewText: String?
}

enum SwipeDecisionDTO: String, Sendable {
    case liked
    case passed
}

enum RelationshipActionDTO: String, Sendable {
    case archive
    case unmatch
    case block
}

enum APIError: Error, Sendable {
    case configuration(String)
}

extension APIError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case let .configuration(message):
            return message
        }
    }
}

// Protocol used by the live Appwrite adapter and by focused test doubles.
protocol BackendAPI: Sendable {
    func fetchDiscoverProfiles() async throws -> [DiscoverProfileDTO]
    func fetchDiscoverPage(after cursor: String?) async throws -> DiscoverPageDTO
    func fetchThreads() async throws -> [ThreadDTO]
    func fetchThread(threadId: String) async throws -> ThreadDTO?
    func fetchMessagePage(threadId: String, before cursor: String) async throws -> MessagePageDTO
    func createOrGetThread(otherUserId: String) async throws -> ThreadDTO
    func sendMessage(threadId: String, attempt: OutgoingMessageAttempt) async throws -> MessageDTO
    func submitSwipe(otherUserId: String, otherUserName: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO?
    func updateRelationship(threadId: String, action: RelationshipActionDTO) async throws
    func updateThreadNotifications(threadId: String, enabled: Bool) async throws
    func markCurrentUserPresence(isOnline: Bool) async
    func markThreadRead(threadId: String) async
    func fetchAttachmentData(fileId: String) async throws -> Data?
}

extension Notification.Name {
    // Thread list and chat detail use this loose signal to refresh after sends, matches, and new threads.
    static let fyreThreadsDidChange = Notification.Name("fyreThreadsDidChange")
    static let fyreThreadRemoved = Notification.Name("fyreThreadRemoved")
}

extension BackendAPI {
    func fetchDiscoverPage(after cursor: String?) async throws -> DiscoverPageDTO {
        DiscoverPageDTO(profiles: try await fetchDiscoverProfiles(), nextCursor: nil)
    }
}
