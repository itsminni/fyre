package com.example.fyre.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.example.fyre.account.model.ChatCustomizationSettings
import com.example.fyre.account.model.ChatBackgroundStyle
import com.example.fyre.account.model.ChatBubblePalette
import com.example.fyre.account.model.DiscoveryPreferences
import com.example.fyre.account.model.NotificationSettings
import com.example.fyre.account.model.SecuritySettings
import com.example.fyre.account.model.ThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.userSettingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "user_settings"
)

data class PersistedUserSettings(
    val themeMode: ThemeMode = ThemeMode.System,
    val dynamicColor: Boolean = true,
    val compactMode: Boolean = false,
    val discoveryPreferences: DiscoveryPreferences = DiscoveryPreferences(),
    val chatCustomizationSettings: ChatCustomizationSettings = ChatCustomizationSettings(),
    val notificationSettings: NotificationSettings = NotificationSettings(),
    val securitySettings: SecuritySettings = SecuritySettings()
)

class UserSettingsDataStore(private val context: Context) {

    private companion object {
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val DYNAMIC_COLOR = booleanPreferencesKey("dynamic_color")
        val COMPACT_MODE = booleanPreferencesKey("compact_mode")

        val DISCOVERY_MIN_AGE = intPreferencesKey("discovery_min_age")
        val DISCOVERY_MAX_AGE = intPreferencesKey("discovery_max_age")
        val DISCOVERY_MAX_DISTANCE = intPreferencesKey("discovery_max_distance_km")
        val DISCOVERY_VERIFIED_ONLY = booleanPreferencesKey("discovery_verified_only")
        val DISCOVERY_INTENT = stringPreferencesKey("discovery_intent")
        val DISCOVERY_SHOW_AGE = booleanPreferencesKey("discovery_show_age")
        val DISCOVERY_SHOW_DISTANCE = booleanPreferencesKey("discovery_show_distance")
        val DISCOVERY_SHOW_INTENT = booleanPreferencesKey("discovery_show_intent")
        val DISCOVERY_SHOW_INTERESTS = booleanPreferencesKey("discovery_show_interests")
        val DISCOVERY_SHOW_INSTAGRAM = booleanPreferencesKey("discovery_show_instagram")
        val DISCOVERY_SHOW_SPOTIFY = booleanPreferencesKey("discovery_show_spotify")

        val CHAT_COMPACT = booleanPreferencesKey("chat_compact")
        val CHAT_SHOW_TIMESTAMPS = booleanPreferencesKey("chat_show_timestamps")
        val CHAT_BACKGROUND_STYLE = stringPreferencesKey("chat_background_style")
        val CHAT_BACKGROUND_BRIGHTNESS = intPreferencesKey("chat_background_brightness")
        val CHAT_BACKGROUND_COLOR_1 = stringPreferencesKey("chat_background_color_1")
        val CHAT_BACKGROUND_COLOR_2 = stringPreferencesKey("chat_background_color_2")
        val CHAT_BACKGROUND_COLOR_3 = stringPreferencesKey("chat_background_color_3")
        val CHAT_OUTGOING_BUBBLE = stringPreferencesKey("chat_outgoing_bubble")
        val CHAT_INCOMING_BUBBLE = stringPreferencesKey("chat_incoming_bubble")
        val CHAT_SEND_COLOR_1 = stringPreferencesKey("chat_send_color_1")
        val CHAT_SEND_COLOR_2 = stringPreferencesKey("chat_send_color_2")
        val CHAT_SEND_COLOR_3 = stringPreferencesKey("chat_send_color_3")

        val NOTIF_PUSH_ENABLED = booleanPreferencesKey("notif_push_enabled")
        val NOTIF_MATCH_ENABLED = booleanPreferencesKey("notif_match_enabled")
        val NOTIF_MESSAGES_ENABLED = booleanPreferencesKey("notif_messages_enabled")
        val NOTIF_EVENTS_ENABLED = booleanPreferencesKey("notif_events_enabled")
        val NOTIF_MARKETING_ENABLED = booleanPreferencesKey("notif_marketing_enabled")

        val SECURITY_BIOMETRIC = booleanPreferencesKey("security_biometric")
        val SECURITY_TWO_FACTOR = booleanPreferencesKey("security_two_factor")
        val SECURITY_HIDE_ONLINE = booleanPreferencesKey("security_hide_online")
        val SECURITY_SESSION_PIN = booleanPreferencesKey("security_session_pin")
    }

    val settings: Flow<PersistedUserSettings> = context.userSettingsDataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { prefs ->
            val discoveryMinAge = (prefs[DISCOVERY_MIN_AGE] ?: 18).coerceIn(18, 98)
            val discoveryMaxAge = (prefs[DISCOVERY_MAX_AGE] ?: 35)
                .coerceIn(maxOf(discoveryMinAge + 1, 19), 99)

            PersistedUserSettings(
                themeMode = ThemeMode.entries.firstOrNull { it.name == prefs[THEME_MODE] } ?: ThemeMode.System,
                dynamicColor = prefs[DYNAMIC_COLOR] ?: true,
                compactMode = prefs[COMPACT_MODE] ?: false,
                discoveryPreferences = DiscoveryPreferences(
                    minAge = discoveryMinAge,
                    maxAge = discoveryMaxAge,
                    maxDistanceKm = (prefs[DISCOVERY_MAX_DISTANCE] ?: 30).coerceIn(1, 999),
                    showOnlyVerified = prefs[DISCOVERY_VERIFIED_ONLY] ?: false,
                    intent = prefs[DISCOVERY_INTENT] ?: "Tutti",
                    showAge = prefs[DISCOVERY_SHOW_AGE] ?: true,
                    showDistance = prefs[DISCOVERY_SHOW_DISTANCE] ?: true,
                    showIntent = prefs[DISCOVERY_SHOW_INTENT] ?: true,
                    showInterests = prefs[DISCOVERY_SHOW_INTERESTS] ?: true,
                    showInstagramTag = prefs[DISCOVERY_SHOW_INSTAGRAM] ?: true,
                    showSpotifyTag = prefs[DISCOVERY_SHOW_SPOTIFY] ?: true
                ),
                chatCustomizationSettings = ChatCustomizationSettings(
                    compactBubbles = prefs[CHAT_COMPACT] ?: false,
                    showTimestamps = prefs[CHAT_SHOW_TIMESTAMPS] ?: true,
                    backgroundStyle = prefs[CHAT_BACKGROUND_STYLE]
                        ?.let { stored -> ChatBackgroundStyle.entries.firstOrNull { it.name == stored } }
                        ?: ChatBackgroundStyle.DefaultDark,
                    backgroundBrightness = ((prefs[CHAT_BACKGROUND_BRIGHTNESS] ?: 0).coerceIn(-100, 100)) / 100f,
                    backgroundColor1Hex = prefs[CHAT_BACKGROUND_COLOR_1] ?: "#3F4755",
                    backgroundColor2Hex = prefs[CHAT_BACKGROUND_COLOR_2] ?: "#8B7A74",
                    backgroundColor3Hex = prefs[CHAT_BACKGROUND_COLOR_3] ?: "#B9A89B",
                    outgoingBubblePalette = prefs[CHAT_OUTGOING_BUBBLE]
                        ?.let { stored -> ChatBubblePalette.entries.firstOrNull { it.name == stored } }
                        ?: ChatBubblePalette.Default,
                    incomingBubblePalette = prefs[CHAT_INCOMING_BUBBLE]
                        ?.let { stored -> ChatBubblePalette.entries.firstOrNull { it.name == stored } }
                        ?: ChatBubblePalette.Default,
                    sendButtonColor1Hex = prefs[CHAT_SEND_COLOR_1] ?: "#FF9A00",
                    sendButtonColor2Hex = prefs[CHAT_SEND_COLOR_2] ?: "#FF8A1F",
                    sendButtonColor3Hex = prefs[CHAT_SEND_COLOR_3] ?: "#E14D33"
                ),
                notificationSettings = NotificationSettings(
                    pushEnabled = prefs[NOTIF_PUSH_ENABLED] ?: true,
                    matchNotifications = prefs[NOTIF_MATCH_ENABLED] ?: true,
                    messageNotifications = prefs[NOTIF_MESSAGES_ENABLED] ?: true,
                    eventReminders = prefs[NOTIF_EVENTS_ENABLED] ?: true,
                    marketingUpdates = prefs[NOTIF_MARKETING_ENABLED] ?: false
                ),
                securitySettings = SecuritySettings(
                    biometricUnlock = prefs[SECURITY_BIOMETRIC] ?: false,
                    twoFactorEnabled = prefs[SECURITY_TWO_FACTOR] ?: false,
                    hideOnlineStatus = prefs[SECURITY_HIDE_ONLINE] ?: false,
                    sessionPinEnabled = prefs[SECURITY_SESSION_PIN] ?: false
                )
            )
        }

    suspend fun updateTheme(mode: ThemeMode, dynamicColor: Boolean, compactMode: Boolean = false) {
        context.userSettingsDataStore.edit { prefs ->
            prefs[THEME_MODE] = mode.name
            prefs[DYNAMIC_COLOR] = dynamicColor
            prefs[COMPACT_MODE] = compactMode
        }
    }

    suspend fun updateDiscoveryPreferences(preferences: DiscoveryPreferences) {
        context.userSettingsDataStore.edit { prefs ->
            val minAge = preferences.minAge.coerceIn(18, 98)
            val maxAge = preferences.maxAge.coerceIn(maxOf(minAge + 1, 19), 99)
            prefs[DISCOVERY_MIN_AGE] = minAge
            prefs[DISCOVERY_MAX_AGE] = maxAge
            prefs[DISCOVERY_MAX_DISTANCE] = preferences.maxDistanceKm.coerceIn(1, 999)
            prefs[DISCOVERY_VERIFIED_ONLY] = preferences.showOnlyVerified
            prefs[DISCOVERY_INTENT] = preferences.intent
            prefs[DISCOVERY_SHOW_AGE] = preferences.showAge
            prefs[DISCOVERY_SHOW_DISTANCE] = preferences.showDistance
            prefs[DISCOVERY_SHOW_INTENT] = preferences.showIntent
            prefs[DISCOVERY_SHOW_INTERESTS] = preferences.showInterests
            prefs[DISCOVERY_SHOW_INSTAGRAM] = preferences.showInstagramTag
            prefs[DISCOVERY_SHOW_SPOTIFY] = preferences.showSpotifyTag
        }
    }

    suspend fun updateChatCustomization(settings: ChatCustomizationSettings) {
        context.userSettingsDataStore.edit { prefs ->
            prefs[CHAT_COMPACT] = settings.compactBubbles
            prefs[CHAT_SHOW_TIMESTAMPS] = settings.showTimestamps
            prefs[CHAT_BACKGROUND_STYLE] = settings.backgroundStyle.name
            prefs[CHAT_BACKGROUND_BRIGHTNESS] = (settings.backgroundBrightness.coerceIn(-1f, 1f) * 100).toInt()
            prefs[CHAT_BACKGROUND_COLOR_1] = settings.backgroundColor1Hex
            prefs[CHAT_BACKGROUND_COLOR_2] = settings.backgroundColor2Hex
            prefs[CHAT_BACKGROUND_COLOR_3] = settings.backgroundColor3Hex
            prefs[CHAT_OUTGOING_BUBBLE] = settings.outgoingBubblePalette.name
            prefs[CHAT_INCOMING_BUBBLE] = settings.incomingBubblePalette.name
            prefs[CHAT_SEND_COLOR_1] = settings.sendButtonColor1Hex
            prefs[CHAT_SEND_COLOR_2] = settings.sendButtonColor2Hex
            prefs[CHAT_SEND_COLOR_3] = settings.sendButtonColor3Hex
        }
    }

    suspend fun updateNotificationSettings(settings: NotificationSettings) {
        context.userSettingsDataStore.edit { prefs ->
            prefs[NOTIF_PUSH_ENABLED] = settings.pushEnabled
            prefs[NOTIF_MATCH_ENABLED] = settings.matchNotifications
            prefs[NOTIF_MESSAGES_ENABLED] = settings.messageNotifications
            prefs[NOTIF_EVENTS_ENABLED] = settings.eventReminders
            prefs[NOTIF_MARKETING_ENABLED] = settings.marketingUpdates
        }
    }

    suspend fun updateSecuritySettings(settings: SecuritySettings) {
        context.userSettingsDataStore.edit { prefs ->
            prefs[SECURITY_BIOMETRIC] = settings.biometricUnlock
            prefs[SECURITY_TWO_FACTOR] = settings.twoFactorEnabled
            prefs[SECURITY_HIDE_ONLINE] = settings.hideOnlineStatus
            prefs[SECURITY_SESSION_PIN] = settings.sessionPinEnabled
        }
    }
}

