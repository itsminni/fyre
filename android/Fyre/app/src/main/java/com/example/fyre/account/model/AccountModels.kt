package com.example.fyre.account.model

import androidx.annotation.StringRes
import com.example.fyre.R
import com.example.fyre.data.model.ProfileFieldValues

enum class AccountSection(@param:StringRes val titleRes: Int) {
    EditProfile(R.string.account_menu_account),
    DiscoveryPreferences(R.string.account_section_discovery_preferences),
    Notifications(R.string.account_section_notifications),
    Security(R.string.account_section_security),
    Appearance(R.string.account_section_appearance),
    EventHistory(R.string.account_section_event_history)
}

data class ProfileDraft(
    val firstName: String = "",
    val lastName: String = "",
    val city: String = "",
    val birthDate: String = "",
    val gender: String = ProfileFieldValues.GenderMale,
    val orientation: String = ProfileFieldValues.OrientationStraight,
    val bio: String = "",
    val intent: String = ProfileFieldValues.IntentRelationship,
    val interests: String = "",
    val instagramTag: String = "",
    val spotifyTag: String = "",
    val preferredGenders: List<String> = ProfileFieldValues.DefaultPreferredGenders,
    val minPreferredAge: Int = 20,
    val maxPreferredAge: Int = 32,
    val maxDistanceKm: Int? = 50,
    val smokes: Boolean = false,
    val drinks: Boolean = false,
    val avatarUri: String? = null,
    val profilePhotoUris: List<String> = emptyList()
)

data class DiscoveryPreferences(
    val minAge: Int = 18,
    val maxAge: Int = 35,
    val maxDistanceKm: Int = 30,
    val showOnlyVerified: Boolean = false,
    val intent: String = "Tutti",
    val showAge: Boolean = true,
    val showDistance: Boolean = true,
    val showIntent: Boolean = true,
    val showInterests: Boolean = true,
    val showInstagramTag: Boolean = true,
    val showSpotifyTag: Boolean = true
)

data class NotificationSettings(
    val pushEnabled: Boolean = true,
    val matchNotifications: Boolean = true,
    val messageNotifications: Boolean = true,
    val eventReminders: Boolean = true,
    val marketingUpdates: Boolean = false
)

enum class ChatBackgroundStyle {
    DefaultDark,
    Graphite,
    Ember,
    Ocean,
    Forest,
    CustomGradient
}

enum class ChatBubblePalette {
    Default,
    Coral,
    Ocean,
    Violet,
    Emerald,
    Graphite
}

data class ChatCustomizationSettings(
    val compactBubbles: Boolean = false,
    val showTimestamps: Boolean = true,
    val backgroundStyle: ChatBackgroundStyle = ChatBackgroundStyle.DefaultDark,
    val backgroundBrightness: Float = 0f,
    val backgroundColor1Hex: String = "#3F4755",
    val backgroundColor2Hex: String = "#8B7A74",
    val backgroundColor3Hex: String = "#B9A89B",
    val outgoingBubblePalette: ChatBubblePalette = ChatBubblePalette.Default,
    val incomingBubblePalette: ChatBubblePalette = ChatBubblePalette.Default,
    val sendButtonColor1Hex: String = "#FF9A00",
    val sendButtonColor2Hex: String = "#FF8A1F",
    val sendButtonColor3Hex: String = "#E14D33"
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
    Registered,
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
    val chatCustomizationSettings: ChatCustomizationSettings = ChatCustomizationSettings(),
    val notificationSettings: NotificationSettings = NotificationSettings(),
    val securitySettings: SecuritySettings = SecuritySettings(),
    val appearanceSettings: AppearanceSettings = AppearanceSettings(),
    val eventHistory: List<EventHistoryItem> = emptyList(),
    val statusMessage: String? = null,
    val isSavingProfile: Boolean = false
)

