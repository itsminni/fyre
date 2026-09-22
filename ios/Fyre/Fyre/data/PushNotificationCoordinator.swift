import Foundation

@MainActor
final class PushNotificationCoordinator {
    static let shared = PushNotificationCoordinator()

    private static let targetIdKey = "push.target-id.v1"

    private var deviceToken: Data?
    private var registeredSignature: String?
    private var appwriteService: AppwriteService?

    private init() {}

    func updateDeviceToken(_ token: Data) {
        deviceToken = token
        registeredSignature = nil
    }

    func recordRegistrationFailure(_ error: Error) {
#if DEBUG
        debugPrint("APNs registration failed: \(error.localizedDescription)")
#endif
    }

    func sync(currentUserId: String?) async {
        guard currentUserId != nil,
              let deviceToken,
              let configuration = try? AppwriteConfiguration.load(),
              let providerId = configuration.pushProviderId,
              !providerId.isEmpty else {
            return
        }

        let identifier = deviceToken.map { String(format: "%02x", $0) }.joined()
        let targetId = loadOrCreateTargetId()
        let signature = "\(targetId):\(identifier):\(providerId)"
        guard signature != registeredSignature else { return }

        let service = ensureAppwriteService(configuration: configuration)
        do {
            try await service.upsertPushTarget(
                targetId: targetId,
                identifier: identifier,
                providerId: providerId
            )
            registeredSignature = signature
        } catch {
#if DEBUG
            debugPrint("Appwrite push target registration failed: \(error.localizedDescription)")
#endif
        }
    }

    func unregister() async {
        guard let data = try? SecurePersistenceStore.data(forKey: Self.targetIdKey),
              let targetId = String(data: data, encoding: .utf8),
              let service = appwriteService else {
            return
        }

        try? await service.deletePushTarget(targetId: targetId)
        registeredSignature = nil
    }

    private func ensureAppwriteService(configuration: AppwriteConfiguration) -> AppwriteService {
        if let appwriteService {
            return appwriteService
        }

        let service = AppwriteService(configuration: configuration)
        appwriteService = service
        return service
    }

    private func loadOrCreateTargetId() -> String {
        if let data = try? SecurePersistenceStore.data(forKey: Self.targetIdKey),
           let targetId = String(data: data, encoding: .utf8),
           !targetId.isEmpty {
            return targetId
        }

        let targetId = UUID().uuidString.lowercased()
        try? SecurePersistenceStore.setData(Data(targetId.utf8), forKey: Self.targetIdKey)
        return targetId
    }
}
