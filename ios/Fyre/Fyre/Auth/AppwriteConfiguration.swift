import Foundation

struct AppwriteConfiguration: Sendable {
    let projectId: String
    let databaseId: String
    let profilesTableId: String
    let avatarsBucketId: String
    let chatAttachmentsBucketId: String?
    let eventsTableId: String
    let eventRegistrationsTableId: String
    let threadsTableId: String
    let threadParticipantsTableId: String
    let messagesTableId: String
    let swipesTableId: String?
    let matchesTableId: String?
    let relationshipsTableId: String?
    let registerForEventFunctionId: String
    let cancelEventRegistrationFunctionId: String
    let manageProfileFunctionId: String
    let eventAdminFunctionId: String?
    let createOrGetThreadFunctionId: String
    let sendMessageFunctionId: String
    let recordSwipeFunctionId: String?
    let manageRelationshipFunctionId: String?
    let discoverProfilesFunctionId: String?
    let createOrGetThreadFunctionDomain: URL?
    let sendMessageFunctionDomain: URL?
    let recordSwipeFunctionDomain: URL?
    let discoverProfilesFunctionDomain: URL?
    let eventAdminFunctionDomain: URL?
    let pushProviderId: String?
    let endpointURL: URL

    static func load(bundle: Bundle = .main) throws -> AppwriteConfiguration {
        guard let url = bundle.url(forResource: "Config", withExtension: "plist") else {
            throw AppwriteConfigurationError.missingFile
        }

        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil)

        guard let dictionary = plist as? [String: Any] else {
            throw AppwriteConfigurationError.invalidFormat
        }

        return try load(dictionary: dictionary)
    }

    static func load(dictionary: [String: Any]) throws -> AppwriteConfiguration {
        let projectId = try stringValue(forKey: "APPWRITE_PROJECT_ID", in: dictionary)
        let publicEndpoint = try stringValue(forKey: "APPWRITE_PUBLIC_ENDPOINT", in: dictionary)
        let databaseId = try stringValue(forKey: "APPWRITE_DATABASE_ID", in: dictionary)
        let profilesTableId = try stringValue(forKey: "APPWRITE_PROFILES_TABLE_ID", in: dictionary)
        let avatarsBucketId = try stringValue(forKey: "APPWRITE_AVATARS_BUCKET_ID", in: dictionary)
        let chatAttachmentsBucketId = optionalStringValue(forKey: "APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID", in: dictionary)
        let eventsTableId = try stringValue(forKey: "APPWRITE_EVENTS_TABLE_ID", in: dictionary)
        let eventRegistrationsTableId = try stringValue(forKey: "APPWRITE_EVENT_REGISTRATIONS_TABLE_ID", in: dictionary)
        let threadsTableId = try stringValue(forKey: "APPWRITE_THREADS_TABLE_ID", in: dictionary)
        let threadParticipantsTableId = try stringValue(forKey: "APPWRITE_THREAD_PARTICIPANTS_TABLE_ID", in: dictionary)
        let messagesTableId = try stringValue(forKey: "APPWRITE_MESSAGES_TABLE_ID", in: dictionary)
        let swipesTableId = try stringValue(forKey: "APPWRITE_SWIPES_TABLE_ID", in: dictionary)
        let matchesTableId = try stringValue(forKey: "APPWRITE_MATCHES_TABLE_ID", in: dictionary)
        let relationshipsTableId = try stringValue(forKey: "APPWRITE_RELATIONSHIPS_TABLE_ID", in: dictionary)
        let registerForEventFunctionId = try stringValue(forKey: "APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID", in: dictionary)
        let cancelEventRegistrationFunctionId = try stringValue(forKey: "APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID", in: dictionary)
        let manageProfileFunctionId = try stringValue(forKey: "APPWRITE_MANAGE_PROFILE_FUNCTION_ID", in: dictionary)
        let eventAdminFunctionId = optionalStringValue(forKey: "APPWRITE_EVENT_ADMIN_FUNCTION_ID", in: dictionary)
        let createOrGetThreadFunctionId = try stringValue(forKey: "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID", in: dictionary)
        let sendMessageFunctionId = try stringValue(forKey: "APPWRITE_SEND_MESSAGE_FUNCTION_ID", in: dictionary)
        let recordSwipeFunctionId = try stringValue(forKey: "APPWRITE_RECORD_SWIPE_FUNCTION_ID", in: dictionary)
        let manageRelationshipFunctionId = try stringValue(forKey: "APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID", in: dictionary)
        let discoverProfilesFunctionId = try stringValue(forKey: "APPWRITE_DISCOVER_PROFILES_FUNCTION_ID", in: dictionary)
        let createOrGetThreadFunctionDomain = try optionalURLValue(forKey: "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN", in: dictionary)
        let sendMessageFunctionDomain = try optionalURLValue(forKey: "APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN", in: dictionary)
        let recordSwipeFunctionDomain = try optionalURLValue(forKey: "APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN", in: dictionary)
        let discoverProfilesFunctionDomain = try optionalURLValue(forKey: "APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN", in: dictionary)
        let eventAdminFunctionDomain = try optionalURLValue(forKey: "APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN", in: dictionary)
        let pushProviderId = optionalStringValue(forKey: "APPWRITE_PUSH_PROVIDER_ID", in: dictionary)

        guard let endpointURL = secureURL(from: publicEndpoint, allowMissingScheme: false) else {
            throw AppwriteConfigurationError.invalidEndpoint(publicEndpoint)
        }

        return AppwriteConfiguration(
            projectId: projectId,
            databaseId: databaseId,
            profilesTableId: profilesTableId,
            avatarsBucketId: avatarsBucketId,
            chatAttachmentsBucketId: chatAttachmentsBucketId,
            eventsTableId: eventsTableId,
            eventRegistrationsTableId: eventRegistrationsTableId,
            threadsTableId: threadsTableId,
            threadParticipantsTableId: threadParticipantsTableId,
            messagesTableId: messagesTableId,
            swipesTableId: swipesTableId,
            matchesTableId: matchesTableId,
            relationshipsTableId: relationshipsTableId,
            registerForEventFunctionId: registerForEventFunctionId,
            cancelEventRegistrationFunctionId: cancelEventRegistrationFunctionId,
            manageProfileFunctionId: manageProfileFunctionId,
            eventAdminFunctionId: eventAdminFunctionId,
            createOrGetThreadFunctionId: createOrGetThreadFunctionId,
            sendMessageFunctionId: sendMessageFunctionId,
            recordSwipeFunctionId: recordSwipeFunctionId,
            manageRelationshipFunctionId: manageRelationshipFunctionId,
            discoverProfilesFunctionId: discoverProfilesFunctionId,
            createOrGetThreadFunctionDomain: createOrGetThreadFunctionDomain,
            sendMessageFunctionDomain: sendMessageFunctionDomain,
            recordSwipeFunctionDomain: recordSwipeFunctionDomain,
            discoverProfilesFunctionDomain: discoverProfilesFunctionDomain,
            eventAdminFunctionDomain: eventAdminFunctionDomain,
            pushProviderId: pushProviderId,
            endpointURL: endpointURL
        )
    }

    private static func stringValue(forKey key: String, in dictionary: [String: Any]) throws -> String {
        guard let rawValue = dictionary[key] as? String else {
            throw AppwriteConfigurationError.missingValue(key)
        }

        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !isPlaceholder(value) else {
            throw AppwriteConfigurationError.missingValue(key)
        }

        return value
    }

    private static func optionalStringValue(forKey key: String, in dictionary: [String: Any]) -> String? {
        guard let rawValue = dictionary[key] as? String else {
            return nil
        }

        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty || isPlaceholder(value) ? nil : value
    }

    private static func optionalURLValue(forKey key: String, in dictionary: [String: Any]) throws -> URL? {
        guard let value = optionalStringValue(forKey: key, in: dictionary) else {
            return nil
        }

        guard let url = secureURL(from: value, allowMissingScheme: true) else {
            throw AppwriteConfigurationError.invalidEndpoint(value)
        }

        return url
    }

    private static func secureURL(from value: String, allowMissingScheme: Bool) -> URL? {
        let normalizedValue = allowMissingScheme && !value.contains("://") ? "https://\(value)" : value
        guard let components = URLComponents(string: normalizedValue),
              let scheme = components.scheme?.lowercased(),
              let host = components.host,
              !host.isEmpty,
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil,
              scheme == "https" || (scheme == "http" && isLoopbackHost(host)),
              let url = components.url else {
            return nil
        }
        return url
    }

    private static func isLoopbackHost(_ host: String) -> Bool {
        let normalized = host.lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        if normalized == "localhost" || normalized == "::1" {
            return true
        }

        let octets = normalized.split(separator: ".", omittingEmptySubsequences: false)
        return octets.count == 4
            && octets.first == "127"
            && octets.allSatisfy { octet in
                guard !octet.isEmpty, octet.count <= 3, octet.allSatisfy(\.isNumber),
                      let value = Int(octet) else { return false }
                return value <= 255
            }
    }

    private static func isPlaceholder(_ value: String) -> Bool {
        let uppercased = value.uppercased()
        return (value.hasPrefix("<") && value.hasSuffix(">"))
            || uppercased.hasPrefix("YOUR_")
            || uppercased.hasPrefix("REPLACE_")
    }
}

enum AppwriteConfigurationError: LocalizedError {
    case missingFile
    case invalidFormat
    case missingValue(String)
    case invalidEndpoint(String)

    var errorDescription: String? {
        switch self {
        case .missingFile:
            return "Missing Config.plist in the app bundle."
        case .invalidFormat:
            return "Config.plist is not a valid plist dictionary."
        case let .missingValue(key):
            return "Missing value for \(key) in Config.plist."
        case let .invalidEndpoint(endpoint):
            return "Appwrite URLs must use HTTPS; HTTP is allowed only for localhost or a loopback IP: \(endpoint)"
        }
    }
}
