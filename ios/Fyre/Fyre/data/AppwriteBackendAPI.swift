//
//  AppwriteBackendAPI.swift
//  Fyre
//
//  Created by Gabriele Mininni on 28/03/26.
//

import Foundation

struct AppwriteBackendAPI: BackendAPI {
    private let service: AppwriteService

    init(configuration: AppwriteConfiguration) {
        service = AppwriteService(configuration: configuration)
    }

    func fetchDiscoverProfiles() async throws -> [ProfileDTO] {
        // When Appwrite is selected, discover should only show real backend profiles.
        try await service.fetchDiscoverProfiles()
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
