import CryptoKit
import Foundation

/// Account preferences are local to this device; appearance and OS permission stay device-wide.
enum AccountPreferenceScope {
    static let keys = ["settings_notifications_enabled", "settings_notifications_matches",
                       "settings_notifications_messages", "settings_notifications_event_reminders",
                       "settings_show_age", "settings_show_distance", "settings_show_intent",
                       "settings_show_interests", "settings_show_instagram_tag", "settings_show_spotify_tag"]
    static func activate(accountId: String?, defaults: UserDefaults = .standard) {
        let ownerKey = "settings_account_scope_v1"
        let next = accountId.map { SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined() } ?? "guest"
        let previous = defaults.string(forKey: ownerKey)
        guard previous != next else { return }
        // Migrate existing settings to the first authenticated account on this device.
        if previous == nil, accountId != nil {
            defaults.set(next, forKey: ownerKey)
            return
        }
        if let previous {
            for key in keys { defaults.set(defaults.object(forKey: key) as? Bool ?? true, forKey: "account.\(previous).\(key)") }
        }
        for key in keys { defaults.set(defaults.object(forKey: "account.\(next).\(key)") as? Bool ?? true, forKey: key) }
        defaults.set(next, forKey: ownerKey)
    }
}
