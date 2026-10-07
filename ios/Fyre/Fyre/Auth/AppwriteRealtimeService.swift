//
//  AppwriteRealtimeService.swift
//  Fyre
//
//  Created by Gabriele Mininni on 03/04/26.
//

import Foundation

struct AppwriteRealtimeEvent {
    let events: [String]
    let channels: [String]
    let timestamp: Date?
    let payload: [String: Any]
    let raw: [String: Any]

    func stringValue(forKey key: String) -> String? {
        guard let rawValue = payload[key] as? String else {
            return nil
        }

        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    func dateValue(forKey key: String) -> Date? {
        guard let rawValue = payload[key] as? String else {
            return nil
        }
        return Self.dateFormatter.date(from: rawValue)
            ?? Self.fallbackDateFormatter.date(from: rawValue)
    }

    func boolValue(forKey key: String) -> Bool? {
        if let value = payload[key] as? Bool {
            return value
        }

        if let value = payload[key] as? NSNumber {
            return value.boolValue
        }

        if let value = payload[key] as? String {
            switch value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "true", "1", "yes":
                return true
            case "false", "0", "no":
                return false
            default:
                return nil
            }
        }

        return nil
    }

    func intValue(forKey key: String) -> Int? {
        if let value = payload[key] as? Int {
            return value
        }

        if let value = payload[key] as? NSNumber {
            return value.intValue
        }

        if let value = payload[key] as? String {
            return Int(value.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        return nil
    }

    var isMutation: Bool {
        events.contains { event in
            event.contains(".create") || event.contains(".update") || event.contains(".delete")
        }
    }

    var isCreate: Bool {
        events.contains { $0.contains(".create") }
    }

    var isUpdate: Bool {
        events.contains { $0.contains(".update") }
    }

    var isDelete: Bool {
        events.contains { $0.contains(".delete") }
    }

    private static let dateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let fallbackDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

@MainActor
protocol RealtimeConnection: AnyObject {
    func start()
    func cancel()
}

@MainActor
private final class AppwriteRealtimeConnection: RealtimeConnection {
    private let configuration: AppwriteConfiguration
    private let channels: [String]
    private let onEvent: (AppwriteRealtimeEvent) -> Void
    private let onError: (Error) -> Void
    private let onConnected: () -> Void
    private let session: URLSession

    private var socketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var isCancelled = false
    private var reconnectAttempt = 0

    init(
        configuration: AppwriteConfiguration,
        channels: [String],
        onEvent: @escaping (AppwriteRealtimeEvent) -> Void,
        onError: @escaping (Error) -> Void,
        onConnected: @escaping () -> Void
    ) {
        self.configuration = configuration
        self.channels = Array(Set(channels)).sorted()
        self.onEvent = onEvent
        self.onError = onError
        self.onConnected = onConnected

        let sessionConfiguration = URLSessionConfiguration.default
        sessionConfiguration.httpCookieStorage = HTTPCookieStorage.shared
        sessionConfiguration.httpCookieAcceptPolicy = .always
        sessionConfiguration.httpShouldSetCookies = true
        session = URLSession(configuration: sessionConfiguration)
    }

    deinit {
        socketTask?.cancel(with: .goingAway, reason: nil)
        receiveTask?.cancel()
        reconnectTask?.cancel()
    }

    func start() {
        guard socketTask == nil else { return }
        isCancelled = false
        connect()
    }

    func cancel() {
        isCancelled = true
        receiveTask?.cancel()
        reconnectTask?.cancel()
        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
        session.invalidateAndCancel()
    }

    private func connect() {
        guard !isCancelled, let request = makeRequest() else { return }

        let task = session.webSocketTask(with: request)
        socketTask = task
        task.resume()

        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            await self?.receiveLoop(for: task)
        }
    }

    private func receiveLoop(for task: URLSessionWebSocketTask) async {
        while !Task.isCancelled && !isCancelled {
            do {
                let message = try await task.receive()
                guard socketTask === task else { return }
                guard let event = parse(message: message) else {
                    continue
                }
                onEvent(event)
            } catch {
                guard !isCancelled, socketTask === task else { return }
                socketTask = nil
                onError(error)
                scheduleReconnect()
                return
            }
        }
    }

    private func scheduleReconnect() {
        let delayNanoseconds = UInt64(min(30, 1 << min(reconnectAttempt, 5))) * 1_000_000_000
        reconnectAttempt += 1
        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delayNanoseconds)
            guard let self, !Task.isCancelled, !self.isCancelled else { return }
            self.connect()
        }
    }

    private func makeRequest() -> URLRequest? {
        guard let url = realtimeURL() else { return nil }

        var request = URLRequest(url: url)
        request.setValue(configuration.projectId, forHTTPHeaderField: "X-Appwrite-Project")
        request.setValue("1.8.0", forHTTPHeaderField: "X-Appwrite-Response-Format")

        // Realtime relies on the existing Appwrite session cookie, so subscriptions keep following login/logout.
        if let cookies = HTTPCookieStorage.shared.cookies(for: configuration.endpointURL),
           !cookies.isEmpty {
            let headers = HTTPCookie.requestHeaderFields(with: cookies)
            for (header, value) in headers {
                request.setValue(value, forHTTPHeaderField: header)
            }
        }

        return request
    }

    private func realtimeURL() -> URL? {
        var components = URLComponents(url: configuration.endpointURL, resolvingAgainstBaseURL: false)
        components?.scheme = configuration.endpointURL.scheme == "http" ? "ws" : "wss"
        components?.path = configuration.endpointURL.path + "/realtime"

        // Channels are encoded directly in the initial URL so reconnects re-subscribe without extra round-trips.
        var queryItems = [URLQueryItem(name: "project", value: configuration.projectId)]
        queryItems.append(contentsOf: channels.map { URLQueryItem(name: "channels[]", value: $0) })
        components?.queryItems = queryItems
        return components?.url
    }

    private func parse(message: URLSessionWebSocketTask.Message) -> AppwriteRealtimeEvent? {
        let data: Data

        switch message {
        case let .string(text):
            data = Data(text.utf8)
        case let .data(payload):
            data = payload
        @unknown default:
            return nil
        }

        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        if object["type"] as? String == "connected" {
            reconnectAttempt = 0
            onConnected()
            return nil
        }
        return RealtimePayload.parse(object)
    }

    private static let dateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let fallbackDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

enum AppwriteRealtimeService {
    @MainActor
    static func makeChatSubscription(
        threadId: String,
        onEvent: @escaping @MainActor (AppwriteRealtimeEvent) -> Void,
        onError: @escaping @MainActor (Error) -> Void = { _ in }
    ) -> AppwriteRealtimeSubscription? {
        guard let configuration = try? AppwriteConfiguration.load() else {
            return nil
        }

        let subscription = SharedRealtimeHub.shared.subscribe(
            configuration: configuration,
            onEvent: { event in
                guard event.isMutation,
                      event.stringValue(forKey: "threadId") == threadId else {
                    return
                }
                onEvent(event)
            },
            onError: onError
        )
        return subscription
    }

    @MainActor
    static func makeInboxSubscription(
        onChange: @escaping @MainActor () -> Void,
        onEvent: @escaping @MainActor (AppwriteRealtimeEvent) -> Void = { _ in },
        onError: @escaping @MainActor (Error) -> Void = { _ in }
    ) -> AppwriteRealtimeSubscription? {
        guard let configuration = try? AppwriteConfiguration.load() else {
            return nil
        }

        let subscription = SharedRealtimeHub.shared.subscribe(
            configuration: configuration,
            onEvent: { event in
                guard event.isMutation else { return }
                onEvent(event)
                onChange()
            },
            onError: onError
        )
        return subscription
    }

    @MainActor
    static func makeNotificationSubscription(
        onEvent: @escaping @MainActor (AppwriteRealtimeEvent) -> Void,
        onError: @escaping @MainActor (Error) -> Void = { _ in }
    ) -> AppwriteRealtimeSubscription? {
        guard let configuration = try? AppwriteConfiguration.load() else {
            return nil
        }

        let subscription = SharedRealtimeHub.shared.subscribe(
            configuration: configuration,
            onEvent: { event in
                guard event.isMutation else { return }
                onEvent(event)
            },
            onError: onError
        )
        return subscription
    }
}

extension AppwriteConfiguration {
    var messagesRealtimeChannel: String {
        "tablesdb.\(databaseId).tables.\(messagesTableId).rows"
    }

    var threadsRealtimeChannel: String {
        "tablesdb.\(databaseId).tables.\(threadsTableId).rows"
    }

    var threadParticipantsRealtimeChannel: String {
        "tablesdb.\(databaseId).tables.\(threadParticipantsTableId).rows"
    }

    var matchesRealtimeChannel: String? {
        guard let matchesTableId, !matchesTableId.isEmpty else { return nil }
        return "tablesdb.\(databaseId).tables.\(matchesTableId).rows"
    }
}


// The token owns only its listener; cancelling one screen never tears down other listeners.
@MainActor
final class AppwriteRealtimeSubscription {
    private var onCancel: (() -> Void)?
    init(onCancel: @escaping () -> Void) { self.onCancel = onCancel }
    func cancel() { onCancel?(); onCancel = nil }
}

@MainActor
final class SharedRealtimeHub {
    static let shared = SharedRealtimeHub()
    private struct Listener {
        let accountId: String?
        let event: (AppwriteRealtimeEvent) -> Void
        let error: (Error) -> Void
    }
    private var listeners: [UUID: Listener] = [:]
    typealias ConnectionFactory = @MainActor (AppwriteConfiguration, [String], @escaping (AppwriteRealtimeEvent) -> Void, @escaping (Error) -> Void, @escaping () -> Void) -> any RealtimeConnection
    private let connectionFactory: ConnectionFactory
    private var connection: (any RealtimeConnection)?

    init(connectionFactory: @escaping ConnectionFactory = { configuration, channels, event, error, connected in
        AppwriteRealtimeConnection(configuration: configuration, channels: channels, onEvent: event, onError: error, onConnected: connected)
    }) {
        self.connectionFactory = connectionFactory
    }
    private var configuration: AppwriteConfiguration?
    private var accountId: String?
    private var isActive = false
    private var generation: UInt = 0

    private var sessionRevision: UInt = 0

    func configure(accountId: String?, isActive: Bool, sessionRevision: UInt) {
        guard self.accountId != accountId || self.isActive != isActive || self.sessionRevision != sessionRevision else { return }
        self.sessionRevision = sessionRevision
        self.accountId = accountId
        listeners = listeners.filter { $0.value.accountId == accountId }
        self.isActive = isActive
        stopConnection()
        connectIfNeeded()
    }

    func subscribe(configuration: AppwriteConfiguration, accountId: String? = nil, onEvent: @escaping (AppwriteRealtimeEvent) -> Void,
                   onError: @escaping (Error) -> Void) -> AppwriteRealtimeSubscription {
        self.configuration = configuration
        let id = UUID()
        listeners[id] = Listener(accountId: accountId ?? UserStore.shared.currentUser?.appwriteUserId, event: onEvent, error: onError)
        connectIfNeeded()
        return AppwriteRealtimeSubscription { [weak self] in
            guard let self else { return }
            self.listeners.removeValue(forKey: id)
            if self.listeners.isEmpty { self.stopConnection() }
        }
    }

    private func stopConnection() {
        generation &+= 1
        connection?.cancel()
        connection = nil
    }

    private func connectIfNeeded() {
        guard isActive, let accountId, connection == nil, let configuration,
              listeners.values.contains(where: { $0.accountId == accountId }) else { return }
        let currentGeneration = generation
        var channels = [configuration.messagesRealtimeChannel, configuration.threadParticipantsRealtimeChannel,
                        configuration.threadsRealtimeChannel]
        if let matches = configuration.matchesRealtimeChannel { channels.append(matches) }
        connection = connectionFactory(configuration, channels, { [weak self] event in
            guard let self, self.generation == currentGeneration else { return }
            for listener in Array(self.listeners.values) where listener.accountId == self.accountId { listener.event(event) }
        }, { [weak self] error in
            guard let self, self.generation == currentGeneration else { return }
            for listener in Array(self.listeners.values) where listener.accountId == self.accountId { listener.error(error) }
        }, { [weak self] in
            guard let self, self.generation == currentGeneration else { return }
            NotificationCenter.default.post(name: .fyreRealtimeDidReconnect, object: nil)
        })
        connection?.start()
    }
}

extension Notification.Name {
    static let fyreRealtimeDidReconnect = Notification.Name("fyreRealtimeDidReconnect")
}

enum RealtimePayload {
    static func parse(_ object: [String: Any]) -> AppwriteRealtimeEvent? {
        let envelope = object["data"] as? [String: Any] ?? object
        guard let events = envelope["events"] as? [String], !events.isEmpty,
              let payload = envelope["payload"] as? [String: Any] else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let rawTimestamp = envelope["timestamp"] as? String
        var timestamp = rawTimestamp.flatMap { formatter.date(from: $0) }
        if timestamp == nil {
            formatter.formatOptions = [.withInternetDateTime]
            timestamp = rawTimestamp.flatMap { formatter.date(from: $0) }
        }
        return AppwriteRealtimeEvent(events: events, channels: envelope["channels"] as? [String] ?? [],
                                     timestamp: timestamp, payload: payload, raw: object)
    }
}
