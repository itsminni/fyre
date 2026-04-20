//
//  AppServices.swift
//  Fyre
//
//  Created by Gabriele Mininni on 11/02/26.
//

import Foundation
import Observation

// Central registry for app-wide services
// - Exposes a `backend` implementation that can be swapped for testing
// - Marked `@Observable` so views or test harnesses can react if services change
@Observable
final class AppServices {
    static let shared = AppServices()

    // Backend API used by the UI
    var backend: BackendAPI

    init(backend: BackendAPI? = nil) {
        if let backend {
            self.backend = backend
            return
        }

        do {
            // Prefer the real Appwrite backend, but fall back to an explicit unavailable backend
            // so the app can surface configuration issues without crashing during startup.
            let configuration = try AppwriteConfiguration.load()
            self.backend = AppwriteBackendAPI(configuration: configuration)
        } catch {
#if DEBUG
            debugPrint("AppServices initialization failed: \(error.localizedDescription)")
#endif
            self.backend = UnavailableBackendAPI(reason: error.localizedDescription)
        }
    }
}

private struct UnavailableBackendAPI: BackendAPI {
    let reason: String

    func fetchDiscoverProfiles() async throws -> [DiscoverProfileDTO] {
        throw APIError.configuration(reason)
    }

    func fetchThreads() async throws -> [ThreadDTO] {
        throw APIError.configuration(reason)
    }

    func fetchThread(threadId: String) async throws -> ThreadDTO? {
        _ = threadId
        throw APIError.configuration(reason)
    }

    func createOrGetThread(otherUserId: String) async throws -> ThreadDTO {
        _ = otherUserId
        throw APIError.configuration(reason)
    }

    func sendMessage(threadId: String, text: String, replyToMessageId: String?, attachment: OutgoingAttachmentDTO?) async throws -> MessageDTO {
        _ = threadId
        _ = text
        _ = replyToMessageId
        _ = attachment
        throw APIError.configuration(reason)
    }

    func submitSwipe(otherUserId: String, otherUserName: String?, decision: SwipeDecisionDTO) async throws -> ThreadDTO? {
        _ = otherUserId
        _ = otherUserName
        _ = decision
        throw APIError.configuration(reason)
    }

    func updateRelationship(threadId: String, action: RelationshipActionDTO) async throws {
        _ = threadId
        _ = action
        throw APIError.configuration(reason)
    }

    func markCurrentUserPresence(isOnline: Bool) async {
        _ = isOnline
    }

    func markThreadRead(threadId: String) async {
        _ = threadId
    }

    func fetchAttachmentData(fileId: String) async throws -> Data? {
        _ = fileId
        throw APIError.configuration(reason)
    }
}
