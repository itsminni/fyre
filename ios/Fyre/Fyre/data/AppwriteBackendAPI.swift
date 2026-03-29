//
//  AppwriteBackendAPI.swift
//  Fyre
//
//  Created by Gabriele Mininni on 28/03/26.
//

import Foundation

struct AppwriteBackendAPI: BackendAPI {
    private let service: AppwriteService
    private let fallback = MockBackendAPI()

    init(configuration: AppwriteConfiguration) {
        service = AppwriteService(configuration: configuration)
    }

    func fetchDiscoverProfiles() async throws -> [ProfileDTO] {
        do {
            // Keep discover usable while the dedicated Appwrite discover function is still being deployed.
            let profiles = try await service.fetchDiscoverProfiles()
            return profiles.isEmpty ? try await fallback.fetchDiscoverProfiles() : profiles
        } catch {
            return try await fallback.fetchDiscoverProfiles()
        }
    }

    func fetchThreads() async throws -> [ThreadDTO] {
        try await service.fetchThreads()
    }

    func createOrGetThread(otherUserId: String) async throws -> ThreadDTO {
        // Thread creation stays strict so a real match never lands in a mock conversation by mistake.
        try await service.createOrGetThreadDTO(otherUserId: otherUserId)
    }

    func sendMessage(threadId: String, text: String) async throws -> MessageDTO {
        try await service.sendMessage(threadId: threadId, text: text)
    }

    func submitSwipe(otherUserId: String, decision: SwipeDecisionDTO) async throws -> ThreadDTO? {
        try await service.submitSwipe(otherUserId: otherUserId, decision: decision)
    }
}
