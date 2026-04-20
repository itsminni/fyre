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

    func fetchDiscoverProfiles() async throws -> [DiscoverProfileDTO] {
        // When Appwrite is selected, discover should only show real backend profiles.
        try await service.fetchDiscoverProfiles()
    }

    func fetchThreads() async throws -> [ThreadDTO] {
        try await service.fetchThreads()
    }

    func fetchThread(threadId: String) async throws -> ThreadDTO? {
        try await service.fetchThreadDTO(threadId: threadId)
    }

    func createOrGetThread(otherUserId: String) async throws -> ThreadDTO {
        // Thread creation stays strict so a real match never lands in a mock conversation by mistake.
        try await service.createOrGetThreadDTO(otherUserId: otherUserId)
    }

    func sendMessage(threadId: String, text: String, replyToMessageId: String?, attachment: OutgoingAttachmentDTO?) async throws -> MessageDTO {
        try await service.sendMessage(threadId: threadId, text: text, replyToMessageId: replyToMessageId, attachment: attachment)
    }

    func submitSwipe(otherUserId: String, otherUserName: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO? {
        try await service.submitSwipe(otherUserId: otherUserId, otherUserName: otherUserName, decision: decision)
    }

    func updateRelationship(threadId: String, action: RelationshipActionDTO) async throws {
        try await service.updateRelationship(threadId: threadId, action: action)
    }

    func markCurrentUserPresence(isOnline: Bool) async {
        await service.markCurrentUserPresence(isOnline: isOnline)
    }

    func markThreadRead(threadId: String) async {
        await service.markThreadRead(threadId: threadId)
    }

    func fetchAttachmentData(fileId: String) async throws -> Data? {
        try await service.fetchAttachmentData(fileId: fileId)
    }
}
