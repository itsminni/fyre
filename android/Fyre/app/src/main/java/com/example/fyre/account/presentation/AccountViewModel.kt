package com.example.fyre.account.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.fyre.account.model.AccountSection
import com.example.fyre.account.model.AccountUiState
import com.example.fyre.account.model.AppearanceSettings
import com.example.fyre.account.model.ChatCustomizationSettings
import com.example.fyre.account.model.DiscoveryPreferences
import com.example.fyre.account.model.EventHistoryItem
import com.example.fyre.account.model.EventHistoryStatus
import com.example.fyre.account.model.NotificationSettings
import com.example.fyre.account.model.ProfileDraft
import com.example.fyre.account.model.SecuritySettings
import com.example.fyre.account.model.ThemeMode
import com.example.fyre.data.local.UserSettingsDataStore
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AccountViewModel(
    initialEmail: String?,
    initialDisplayName: String?,
    private val userSettingsDataStore: UserSettingsDataStore? = null
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        AccountUiState(
            email = initialEmail.orEmpty(),
            displayName = initialDisplayName.orEmpty(),
            profileDraft = profileDraftFromDisplayName(initialDisplayName),
            eventHistory = localEventHistorySeed()
        )
    )
    val uiState: StateFlow<AccountUiState> = _uiState.asStateFlow()

    init {
        userSettingsDataStore?.let { dataStore ->
            viewModelScope.launch {
                dataStore.settings.collect { persisted ->
                    val current = _uiState.value
                    _uiState.value = current.copy(
                        discoveryPreferences = persisted.discoveryPreferences,
                        chatCustomizationSettings = persisted.chatCustomizationSettings,
                        notificationSettings = persisted.notificationSettings,
                        appearanceSettings = current.appearanceSettings.copy(
                            themeMode = persisted.themeMode,
                            dynamicColor = persisted.dynamicColor
                        )
                    )
                }
            }
        }
    }

    fun openSection(section: AccountSection) {
        _uiState.value = _uiState.value.copy(selectedSection = section, localStatusMessage = null)
    }

    fun backToHub() {
        _uiState.value = _uiState.value.copy(selectedSection = null, localStatusMessage = null)
    }

    fun updateProfile(update: ProfileDraft) {
        val computedDisplayName = listOf(update.firstName.trim(), update.lastName.trim())
            .filter { it.isNotBlank() }
            .joinToString(" ")

        _uiState.value = _uiState.value.copy(
            displayName = computedDisplayName.ifBlank { _uiState.value.displayName },
            profileDraft = update,
            localStatusMessage = "Profilo aggiornato localmente"
        )
    }

    fun updateDiscoveryPreferences(update: DiscoveryPreferences) {
        _uiState.value = _uiState.value.copy(
            discoveryPreferences = update,
            localStatusMessage = "Preferenze discovery salvate in locale"
        )
        userSettingsDataStore?.let { dataStore ->
            viewModelScope.launch {
                dataStore.updateDiscoveryPreferences(update)
            }
        }
    }

    fun updateNotificationSettings(update: NotificationSettings) {
        _uiState.value = _uiState.value.copy(
            notificationSettings = update,
            localStatusMessage = "Notifiche aggiornate in locale"
        )
        userSettingsDataStore?.let { dataStore ->
            viewModelScope.launch {
                dataStore.updateNotificationSettings(update)
            }
        }
    }

    fun updateChatCustomizationSettings(update: ChatCustomizationSettings) {
        _uiState.value = _uiState.value.copy(
            chatCustomizationSettings = update,
            localStatusMessage = "Personalizzazione chat salvata in locale"
        )
        userSettingsDataStore?.let { dataStore ->
            viewModelScope.launch {
                dataStore.updateChatCustomization(update)
            }
        }
    }

    fun updateSecuritySettings(update: SecuritySettings) {
        _uiState.value = _uiState.value.copy(
            securitySettings = update,
            localStatusMessage = "Impostazioni sicurezza aggiornate in locale"
        )
    }

    fun updateAppearanceSettings(update: AppearanceSettings) {
        _uiState.value = _uiState.value.copy(
            appearanceSettings = update,
            localStatusMessage = "Aspetto aggiornato in locale"
        )
        userSettingsDataStore?.let { dataStore ->
            viewModelScope.launch {
                dataStore.updateTheme(
                    mode = update.themeMode,
                    dynamicColor = update.dynamicColor
                )
            }
        }
    }

    fun setThemeMode(mode: ThemeMode) {
        val current = _uiState.value.appearanceSettings
        updateAppearanceSettings(current.copy(themeMode = mode))
    }

    private fun profileDraftFromDisplayName(displayName: String?): ProfileDraft {
        val safeName = displayName.orEmpty().trim()
        if (safeName.isBlank()) return ProfileDraft()

        val parts = safeName.split(" ").filter { it.isNotBlank() }
        val firstName = parts.firstOrNull().orEmpty()
        val lastName = parts.drop(1).joinToString(" ")
        val username = safeName.lowercase().replace(" ", "")

        return ProfileDraft(
            firstName = firstName,
            lastName = lastName,
            username = username
        )
    }

    private fun localEventHistorySeed(): List<EventHistoryItem> {
        return listOf(
            EventHistoryItem(
                id = "h1",
                title = "Aperitivo Tech Milano",
                dateText = "24/04/2026 19:30",
                place = "Navigli, Milano",
                status = EventHistoryStatus.Attended
            ),
            EventHistoryItem(
                id = "h2",
                title = "Sunset Rooftop Party",
                dateText = "27/04/2026 18:00",
                place = "Porta Nuova, Milano",
                status = EventHistoryStatus.Cancelled
            ),
            EventHistoryItem(
                id = "h3",
                title = "Hiking Day Lago di Como",
                dateText = "01/05/2026 08:30",
                place = "Como",
                status = EventHistoryStatus.Waitlisted
            )
        )
    }
}

class AccountViewModelFactory(
    private val initialEmail: String?,
    private val initialDisplayName: String?,
    private val userSettingsDataStore: UserSettingsDataStore? = null
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AccountViewModel::class.java)) {
            return AccountViewModel(
                initialEmail = initialEmail,
                initialDisplayName = initialDisplayName,
                userSettingsDataStore = userSettingsDataStore
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

