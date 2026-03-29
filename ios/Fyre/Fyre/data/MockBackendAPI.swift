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
        // Mock discover cards intentionally omit remote ids so the UI does not fake real matches/chats.
        [
            ProfileDTO(id: UUID(), remoteUserId: nil, name: "Giulia", age: 24, gender: .female, bio: "Loves concerts and coffee."),
            ProfileDTO(id: UUID(), remoteUserId: nil, name: "Marco", age: 27, gender: .male, bio: "Sports and weekend trips."),
            ProfileDTO(id: UUID(), remoteUserId: nil, name: "Elena", age: 25, gender: .female, bio: "Movies, books and walks."),
            ProfileDTO(id: UUID(), remoteUserId: nil, name: "Luca", age: 29, gender: .male, bio: "Vinyls, aperitivo and last-minute road trips."),
            ProfileDTO(id: UUID(), remoteUserId: nil, name: "Sam", age: 26, gender: .nonBinary, bio: "Art nights, playlists and honest conversations.")
        ]
    }

    func fetchThreads() async throws -> [ThreadDTO] {
        [
            ThreadDTO(
                id: UUID(),
                remoteId: UUID().uuidString,
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
                remoteId: UUID().uuidString,
                name: "Marco",
                avatar: "person.crop.circle",
                isOnline: false,
                messages: [
                    MessageDTO(id: UUID(), text: "Training tomorrow?", isMe: false, time: "19:02")
                ]
            )
        ]
    }

    func sendMessage(threadId: String, text: String) async throws -> MessageDTO {
        _ = threadId

        return MessageDTO(
            id: UUID(),
            text: text,
            isMe: true,
            time: Self.timeFormatter.string(from: Date())
        )
    }

    func createOrGetThread(otherUserId: String) async throws -> ThreadDTO {
        let name = profileName(for: otherUserId)
        return ThreadDTO(
            id: UUID(),
            remoteId: otherUserId,
            name: name,
            avatar: "",
            isOnline: false,
            messages: []
        )
    }

    func submitSwipe(otherUserId: String, decision: SwipeDecisionDTO) async throws -> ThreadDTO? {
        // Keep the mock swipe flow simple: only likes fabricate a thread, passes do nothing.
        guard decision == .liked else { return nil }
        return try await createOrGetThread(otherUserId: otherUserId)
    }

    private func profileName(for userId: String) -> String {
        switch userId {
        case "mock-giulia":
            return "Giulia"
        case "mock-marco":
            return "Marco"
        case "mock-elena":
            return "Elena"
        case "mock-luca":
            return "Luca"
        case "mock-sam":
            return "Sam"
        default:
            return "Match"
        }
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "it_IT")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}
