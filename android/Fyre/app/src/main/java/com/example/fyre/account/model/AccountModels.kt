package com.example.fyre.account.model

enum class AccountSection(val title: String) {
    EditProfile("Modifica profilo"),
    DiscoveryPreferences("Preferenze discovery"),
    Notifications("Notifiche"),
    Security("Sicurezza"),
    Appearance("Aspetto"),
    EventHistory("Cronologia eventi")
}

data class ProfileDraft(
    val firstName: String = "",
    val lastName: String = "",
    val username: String = "",
    val city: String = "",
    val bio: String = ""
)

data class DiscoveryPreferences(
    val minAge: Int = 18,
    val maxAge: Int = 35,
    val maxDistanceKm: Int = 30,
    val showOnlyVerified: Boolean = false,
    val intent: String = "Tutti"
)

data class NotificationSettings(
    val pushEnabled: Boolean = true,
    val messageNotifications: Boolean = true,
    val eventReminders: Boolean = true,
    val marketingUpdates: Boolean = false
)

data class SecuritySettings(
    val biometricUnlock: Boolean = false,
    val twoFactorEnabled: Boolean = false,
    val hideOnlineStatus: Boolean = false,
    val sessionPinEnabled: Boolean = false
)

enum class ThemeMode {
    System,
    Light,
    Dark
}

data class AppearanceSettings(
    val themeMode: ThemeMode = ThemeMode.System,
    val dynamicColor: Boolean = true,
    val compactMode: Boolean = false
)

enum class EventHistoryStatus {
    Attended,
    Cancelled,
    Waitlisted
}

data class EventHistoryItem(
    val id: String,
    val title: String,
    val dateText: String,
    val place: String,
    val status: EventHistoryStatus
)

data class AccountUiState(
    val email: String = "",
    val displayName: String = "",
    val selectedSection: AccountSection? = null,
    val profileDraft: ProfileDraft = ProfileDraft(),
    val discoveryPreferences: DiscoveryPreferences = DiscoveryPreferences(),
    val notificationSettings: NotificationSettings = NotificationSettings(),
    val securitySettings: SecuritySettings = SecuritySettings(),
    val appearanceSettings: AppearanceSettings = AppearanceSettings(),
    val eventHistory: List<EventHistoryItem> = emptyList(),
    val localStatusMessage: String? = null
)

