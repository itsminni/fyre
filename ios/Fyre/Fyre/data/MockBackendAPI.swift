//
//  MockBackendAPI.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Foundation

// Mock implementation of `BackendAPI` used for development and tests.
// Provides deterministic, in-memory data without networking.
struct MockBackendAPI: BackendAPI {
    func fetchDiscoverProfiles() async throws -> [ProfileDTO] {
        [
            ProfileDTO(id: UUID(), name: "Giulia", age: 24, bio: "Loves concerts and coffee."),
            ProfileDTO(id: UUID(), name: "Marco", age: 27, bio: "Sports and weekend trips."),
            ProfileDTO(id: UUID(), name: "Elena", age: 25, bio: "Movies, books and walks.")
        ]
    }

    func fetchThreads() async throws -> [ThreadDTO] {
        [
            ThreadDTO(
                id: UUID(),
                name: "Giulia",
                avatar: "person.crop.circle.fill",
                isOnline: true,
                messages: [
                    MessageDTO(id: UUID(), text: "See you after dinner?", isMe: false, time: "21:14"),
                    MessageDTO(id: UUID(), text: "Sounds great!", isMe: true, time: "21:15")
                ]
            ),
            ThreadDTO(
                id: UUID(),
                name: "Marco",
                avatar: "person.crop.circle",
                isOnline: false,
                messages: [
                    MessageDTO(id: UUID(), text: "Training tomorrow?", isMe: false, time: "19:02")
                ]
            )
        ]
    }
}
