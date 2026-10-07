import Foundation
import Observation

nonisolated enum NotificationDestination: Equatable, Sendable {
    case thread(String)
    case event(String)
}

nonisolated struct NotificationRoute: Equatable, Sendable {
    let destination: NotificationDestination
    let accountId: String?

    init?(userInfo: [AnyHashable: Any]) {
        let thread = userInfo["threadId"] as? String
        let event = userInfo["eventId"] as? String
        guard (userInfo["threadId"] == nil) != (userInfo["eventId"] == nil) else { return nil }
        guard let value = thread ?? event, Self.validID(value) else { return nil }
        if let account = userInfo["accountId"] {
            guard let account = account as? String, Self.validID(account) else { return nil }
            accountId = account
        } else { accountId = nil }
        destination = thread != nil ? .thread(value) : .event(value)
    }

    private static func validID(_ value: String) -> Bool {
        value.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$", options: .regularExpression) == value.startIndex..<value.endIndex
    }
}

@MainActor @Observable
final class NotificationRouter {
    static let shared = NotificationRouter()
    private(set) var pending: NotificationRoute?
    private(set) var revision = UUID()

    func receive(_ route: NotificationRoute) {
        pending = route
        revision = UUID()
    }

    func consume(revision: UUID) {
        guard revision == self.revision else { return }
        pending = nil
    }
}
