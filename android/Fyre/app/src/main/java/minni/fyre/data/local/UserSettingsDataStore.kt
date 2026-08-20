package minni.fyre.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import minni.fyre.account.model.AppLanguage
import minni.fyre.account.model.AppIconVariant
import minni.fyre.account.model.ChatCustomizationSettings
import minni.fyre.account.model.ChatBackgroundStyle
import minni.fyre.account.model.ChatBubblePalette
import minni.fyre.account.model.DiscoveryPreferences
import minni.fyre.account.model.NotificationSettings
import minni.fyre.account.model.ThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import java.io.IOException

private val Context.userSettingsDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "user_settings"
)

data class PersistedUserSettings(
    val themeMode: ThemeMode = ThemeMode.System,
    val appLanguage: AppLanguage = AppLanguage.System,
    val appIconVariant: AppIconVariant = AppIconVariant.Fyre1,
    val discoveryPreferences: DiscoveryPreferences = DiscoveryPreferences(),
    val chatCustomizationSettings: ChatCustomizationSettings = ChatCustomizationSettings(),
    val notificationSettings: NotificationSettings = NotificationSettings()
)

class UserSettingsDataStore(private val context: Context) {

    private companion object {
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val APP_LANGUAGE = stringPreferencesKey("app_language")
        val APP_ICON_VARIANT = stringPreferencesKey("app_icon_variant")

        val DISCOVERY_SHOW_AGE = booleanPreferencesKey("discovery_show_age")
        val DISCOVERY_SHOW_DISTANCE = booleanPreferencesKey("discovery_show_distance")
        val DISCOVERY_SHOW_INTENT = booleanPreferencesKey("discovery_show_intent")
        val DISCOVERY_SHOW_INTERESTS = booleanPreferencesKey("discovery_show_interests")
        val DISCOVERY_SHOW_INSTAGRAM = booleanPreferencesKey("discovery_show_instagram")
        val DISCOVERY_SHOW_SPOTIFY = booleanPreferencesKey("discovery_show_spotify")

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
    }

    val settings: Flow<PersistedUserSettings> = context.userSettingsDataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { prefs ->
            PersistedUserSettings(
                themeMode = ThemeMode.entries.firstOrNull { it.name == prefs[THEME_MODE] } ?: ThemeMode.System,
                appLanguage = AppLanguage.entries.firstOrNull { it.name == prefs[APP_LANGUAGE] }
                    ?: AppLanguage.System,
                appIconVariant = AppIconVariant.entries.firstOrNull { it.name == prefs[APP_ICON_VARIANT] }
                    ?: AppIconVariant.Fyre1,
                discoveryPreferences = DiscoveryPreferences(
                    showAge = prefs[DISCOVERY_SHOW_AGE] ?: true,
                    showDistance = prefs[DISCOVERY_SHOW_DISTANCE] ?: true,
                    showIntent = prefs[DISCOVERY_SHOW_INTENT] ?: true,
                    showInterests = prefs[DISCOVERY_SHOW_INTERESTS] ?: true,
                    showInstagramTag = prefs[DISCOVERY_SHOW_INSTAGRAM] ?: true,
                    showSpotifyTag = prefs[DISCOVERY_SHOW_SPOTIFY] ?: true
                ),
                chatCustomizationSettings = ChatCustomizationSettings(
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
                    eventReminders = prefs[NOTIF_EVENTS_ENABLED] ?: true
                )
            )
        }

    suspend fun updateTheme(mode: ThemeMode) {
        context.userSettingsDataStore.edit { prefs ->
            prefs[THEME_MODE] = mode.name
        }
    }

    suspend fun updateAppearance(
        themeMode: ThemeMode,
        appLanguage: AppLanguage,
        appIconVariant: AppIconVariant
    ) {
        context.userSettingsDataStore.edit { prefs ->
            prefs[THEME_MODE] = themeMode.name
            prefs[APP_LANGUAGE] = appLanguage.name
            prefs[APP_ICON_VARIANT] = appIconVariant.name
        }
    }

    suspend fun updateAppLanguage(language: AppLanguage) {
        context.userSettingsDataStore.edit { prefs ->
            prefs[APP_LANGUAGE] = language.name
        }
    }

    suspend fun updateAppIconVariant(variant: AppIconVariant) {
        context.userSettingsDataStore.edit { prefs ->
            prefs[APP_ICON_VARIANT] = variant.name
        }
    }

    suspend fun updateDiscoveryPreferences(preferences: DiscoveryPreferences) {
        context.userSettingsDataStore.edit { prefs ->
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
        }
    }

    suspend fun currentNotificationSettingsOrNull(): NotificationSettings? {
        return runCatching {
            val prefs = context.userSettingsDataStore.data.first()
            NotificationSettings(
                pushEnabled = prefs[NOTIF_PUSH_ENABLED] ?: true,
                matchNotifications = prefs[NOTIF_MATCH_ENABLED] ?: true,
                messageNotifications = prefs[NOTIF_MESSAGES_ENABLED] ?: true,
                eventReminders = prefs[NOTIF_EVENTS_ENABLED] ?: true
            )
        }.getOrNull()
    }
}
