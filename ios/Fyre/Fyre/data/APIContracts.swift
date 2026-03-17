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
    let name: String
    let age: Int
    let bio: String
}

struct ThreadDTO: Identifiable, Sendable {
    let id: UUID
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

// Generic API error cases for the mock/real implementations
enum APIError: Error, Sendable {
    case notImplemented
    case network
    case decoding
}

// Protocol that the app uses to fetch backend data. Implementations
// can be swapped (mock for testing, real network client for production).
protocol BackendAPI: Sendable {
    func fetchDiscoverProfiles() async throws -> [ProfileDTO]
    func fetchThreads() async throws -> [ThreadDTO]
}
