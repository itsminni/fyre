//
//  APIContracts.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Foundation

// Data transfer objects (DTOs) used by the BackendAPI
// These types are intentionally simple and `Sendable` to work with async APIs
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
    let orientation: String?
    let intent: String?
    let smokes: Bool?
    let drinks: Bool?
    let instagramTag: String?
    let spotifyTag: String?
    let relationshipState: RelationshipStateDTO
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

struct OutgoingAttachmentDTO: Sendable {
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

// Generic API error cases for the mock/real implementations
enum APIError: Error, Sendable {
    case notImplemented
    case network
    case decoding
    case configuration(String)
}

extension APIError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .notImplemented:
            return "Backend API not implemented."
        case .network:
            return "Network request failed."
        case .decoding:
            return "Failed to decode backend payload."
        case let .configuration(message):
            return message
        }
    }
}

// Protocol that the app uses to fetch backend data. Implementations
// can be swapped (mock for testing, real network client for production).
protocol BackendAPI: Sendable {
    func fetchDiscoverProfiles() async throws -> [DiscoverProfileDTO]
    func fetchThreads() async throws -> [ThreadDTO]
    func fetchThread(threadId: String) async throws -> ThreadDTO?
    func createOrGetThread(otherUserId: String) async throws -> ThreadDTO
    func sendMessage(threadId: String, text: String, replyToMessageId: String?, attachment: OutgoingAttachmentDTO?) async throws -> MessageDTO
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
