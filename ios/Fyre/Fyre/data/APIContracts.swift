//
//  APIContracts.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Foundation

// Data transfer objects (DTOs) used by the BackendAPI
// These types are intentionally simple and `Sendable` to work with async APIs
struct ProfileDTO: Identifiable, Sendable {
    let id: UUID
    // Keep the backend account id separate from the stable SwiftUI id used locally in lists.
    let remoteUserId: String?
    let name: String
    let age: Int
    let gender: UserGender
    let bio: String
}

struct ThreadDTO: Identifiable, Sendable {
    let id: UUID
    let remoteId: String
    let name: String
    let avatar: String
    let isOnline: Bool
    let messages: [MessageDTO]
}

struct MessageDTO: Identifiable, Sendable {
    let id: UUID
    let text: String
    let isMe: Bool
    let time: String
}

enum SwipeDecisionDTO: String, Sendable {
    case liked
    case passed
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
    func fetchDiscoverProfiles() async throws -> [ProfileDTO]
    func fetchThreads() async throws -> [ThreadDTO]
    func fetchThread(threadId: String) async throws -> ThreadDTO?
    func createOrGetThread(otherUserId: String) async throws -> ThreadDTO
    func sendMessage(threadId: String, text: String) async throws -> MessageDTO
    func submitSwipe(otherUserId: String, otherUserName: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO?
}

extension Notification.Name {
    // Thread list and chat detail use this loose signal to refresh after sends, matches, and new threads.
    static let fyreThreadsDidChange = Notification.Name("fyreThreadsDidChange")
}
