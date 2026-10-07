import CryptoKit
import Foundation

nonisolated protocol PushTargetService: Sendable {
    func upsertPushTarget(targetId: String, identifier: String, providerId: String) async throws
    func deletePushTarget(targetId: String) async throws
}

extension AppwriteService: PushTargetService {}

@MainActor
final class PushNotificationCoordinator {
    static let shared = PushNotificationCoordinator()

    private var targetIds: [String: String] = [:]
    private var deviceToken: Data?
    private var currentUserId: String?
    private var enabled = true
    private var registeredSignature: String?
    private var registeredTargetId: String?
    private var revision: UInt = 0
    private var syncTask: Task<Void, Never>?
    private let service: (any PushTargetService)?
    private let providerId: String?
    private let retryDelay: @Sendable (Int) async throws -> Void

    init(
        service: (any PushTargetService)? = nil,
        providerId: String? = nil,
        retryDelay: @escaping @Sendable (Int) async throws -> Void = { attempt in
            try await Task.sleep(nanoseconds: UInt64(1 << attempt) * 1_000_000_000)
        }
    ) {
        let configuration = try? AppwriteConfiguration.load()
        self.service = service ?? configuration.map { AppwriteService(configuration: $0) }
        self.providerId = providerId ?? configuration?.pushProviderId
        self.retryDelay = retryDelay
    }

    func updateDeviceToken(_ token: Data) {
        guard token != deviceToken else { return }
        deviceToken = token
        revision &+= 1
        startSyncIfNeeded()
    }

    func recordRegistrationFailure(_ error: Error) {
#if DEBUG
        debugPrint("APNs registration failed: \(error.localizedDescription)")
#endif
    }

    func sync(currentUserId: String?, enabled: Bool = true) async {
        if self.currentUserId != currentUserId || self.enabled != enabled {
            if currentUserId == nil, let previousUserId = self.currentUserId {
                registeredTargetId = registeredTargetId ?? storedTargetId(userId: previousUserId)
            }
            self.currentUserId = currentUserId
            self.enabled = enabled
            revision &+= 1
        }
        startSyncIfNeeded()
        await syncTask?.value
    }

    /// Call before deleting the authenticated Appwrite session.
    func unregister() async {
        if let currentUserId {
            registeredTargetId = registeredTargetId ?? storedTargetId(userId: currentUserId)
        }
        currentUserId = nil
        revision &+= 1
        startSyncIfNeeded()
        await syncTask?.value
        registeredSignature = nil
    }

    private func startSyncIfNeeded() {
        guard syncTask == nil else { return }
        syncTask = Task { [weak self] in
            await self?.reconcile()
            self?.syncTask = nil
        }
    }

    private func reconcile() async {
        guard let service, let providerId, !providerId.isEmpty else { return }
        var attempts = 0
        while !Task.isCancelled {
            let operationRevision = revision
            do {
                if let currentUserId, enabled, let deviceToken {
                    let identifier = deviceToken.map { String(format: "%02x", $0) }.joined()
                    let targetId = loadOrCreateTargetId(userId: currentUserId)
                    let signature = "\(currentUserId):\(targetId):\(identifier):\(providerId)"
                    if registeredSignature != signature {
                        try await service.upsertPushTarget(targetId: targetId, identifier: identifier, providerId: providerId)
                        // Keep the target even if preferences changed during the request;
                        // the next iteration must remove it before reporting completion.
                        registeredTargetId = targetId
                        registeredSignature = signature
                    }
                } else if !enabled || currentUserId == nil {
                    let targetId = registeredTargetId ?? currentUserId.flatMap { storedTargetId(userId: $0) }
                    if let targetId {
                        try await service.deletePushTarget(targetId: targetId)
                    }
                    registeredTargetId = nil
                    registeredSignature = nil
                }
                if operationRevision == revision { return }
                attempts = 0
            } catch {
                if operationRevision != revision {
                    attempts = 0
                    continue
                }
                guard attempts < 3 else { return }
                do { try await retryDelay(attempts) } catch { return }
                attempts += 1
            }
        }
    }

    private func targetKey(userId: String) -> String {
        let digest = SHA256.hash(data: Data(userId.utf8)).map { String(format: "%02x", $0) }.joined()
        return "push.target-id.v2.\(digest)"
    }

    private func storedTargetId(userId: String) -> String? {
        if let targetId = targetIds[userId] { return targetId }
        guard let data = try? SecurePersistenceStore.data(forKey: targetKey(userId: userId)),
              let targetId = String(data: data, encoding: .utf8), !targetId.isEmpty else { return nil }
        targetIds[userId] = targetId
        return targetId
    }

    private func loadOrCreateTargetId(userId: String) -> String {
        if let targetId = storedTargetId(userId: userId) { return targetId }
        // Migrate the installation-scoped target without leaving a duplicate.
        let legacyData = try? SecurePersistenceStore.data(forKey: "push.target-id.v1")
        let legacyId = legacyData.flatMap { String(data: $0, encoding: .utf8) }
        let targetId = legacyId ?? UUID().uuidString.lowercased()
        targetIds[userId] = targetId
        do {
            try SecurePersistenceStore.setData(Data(targetId.utf8), forKey: targetKey(userId: userId))
            try? SecurePersistenceStore.removeData(forKey: "push.target-id.v1")
        } catch {}
        return targetId
    }
}
