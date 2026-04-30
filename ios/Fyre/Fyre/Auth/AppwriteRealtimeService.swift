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
final class AppwriteRealtimeSubscription {
    private let configuration: AppwriteConfiguration
    private let channels: [String]
    private let onEvent: (AppwriteRealtimeEvent) -> Void
    private let onError: (Error) -> Void
    private let session: URLSession

    private var socketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var isCancelled = false

    init(
        configuration: AppwriteConfiguration,
        channels: [String],
        onEvent: @escaping (AppwriteRealtimeEvent) -> Void,
        onError: @escaping (Error) -> Void
    ) {
        self.configuration = configuration
        self.channels = Array(Set(channels)).sorted()
        self.onEvent = onEvent
        self.onError = onError

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
                guard let event = parse(message: message) else {
                    continue
                }
                onEvent(event)
            } catch {
                guard !isCancelled else { return }
                socketTask = nil
                onError(error)
                scheduleReconnect()
                return
            }
        }
    }

    private func scheduleReconnect(after delayNanoseconds: UInt64 = 1_000_000_000) {
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

        let payload = object["payload"] as? [String: Any]
            ?? object["data"] as? [String: Any]
            ?? [:]

        let timestamp = Self.dateFormatter.date(from: object["timestamp"] as? String ?? "")
            ?? Self.fallbackDateFormatter.date(from: object["timestamp"] as? String ?? "")
        return AppwriteRealtimeEvent(
            events: object["events"] as? [String] ?? [],
            channels: object["channels"] as? [String] ?? [],
            timestamp: timestamp,
            payload: payload,
            raw: object
        )
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

        let subscription = AppwriteRealtimeSubscription(
            configuration: configuration,
            channels: [
                configuration.messagesRealtimeChannel,
                configuration.threadParticipantsRealtimeChannel
            ],
            onEvent: { event in
                guard event.isMutation,
                      event.stringValue(forKey: "threadId") == threadId else {
                    return
                }
                onEvent(event)
            },
            onError: onError
        )
        subscription.start()
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

        var channels = [
            configuration.messagesRealtimeChannel,
            configuration.threadsRealtimeChannel,
            configuration.threadParticipantsRealtimeChannel
        ]
        if let matchesChannel = configuration.matchesRealtimeChannel {
            channels.append(matchesChannel)
        }

        let subscription = AppwriteRealtimeSubscription(
            configuration: configuration,
            channels: channels,
            onEvent: { event in
                guard event.isMutation else { return }
                onEvent(event)
                onChange()
            },
            onError: onError
        )
        subscription.start()
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

        var channels = [
            configuration.messagesRealtimeChannel,
            configuration.threadParticipantsRealtimeChannel
        ]
        if let matchesChannel = configuration.matchesRealtimeChannel {
            channels.append(matchesChannel)
        }

        let subscription = AppwriteRealtimeSubscription(
            configuration: configuration,
            channels: channels,
            onEvent: { event in
                guard event.isMutation else { return }
                onEvent(event)
            },
            onError: onError
        )
        subscription.start()
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
