package com.example.fyre.account.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.fyre.account.model.AccountSection
import com.example.fyre.account.model.AccountUiState
import com.example.fyre.account.model.AppearanceSettings
import com.example.fyre.account.model.DiscoveryPreferences
import com.example.fyre.account.model.EventHistoryItem
import com.example.fyre.account.model.EventHistoryStatus
import com.example.fyre.account.model.NotificationSettings
import com.example.fyre.account.model.ProfileDraft
import com.example.fyre.account.model.SecuritySettings
import com.example.fyre.account.model.ThemeMode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AccountViewModel(
    initialEmail: String?,
    initialDisplayName: String?
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

    fun openSection(section: AccountSection) {
        _uiState.value = _uiState.value.copy(selectedSection = section, localStatusMessage = null)
    }

    fun backToHub() {
        _uiState.value = _uiState.value.copy(selectedSection = null, localStatusMessage = null)
    }

    fun updateProfile(update: ProfileDraft) {
        _uiState.value = _uiState.value.copy(
            profileDraft = update,
            localStatusMessage = "Profilo aggiornato localmente"
        )
    }

    fun updateDiscoveryPreferences(update: DiscoveryPreferences) {
        _uiState.value = _uiState.value.copy(
            discoveryPreferences = update,
            localStatusMessage = "Preferenze discovery salvate in locale"
        )
    }

    fun updateNotificationSettings(update: NotificationSettings) {
        _uiState.value = _uiState.value.copy(
            notificationSettings = update,
            localStatusMessage = "Notifiche aggiornate in locale"
        )
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
    private val initialDisplayName: String?
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AccountViewModel::class.java)) {
            return AccountViewModel(
                initialEmail = initialEmail,
                initialDisplayName = initialDisplayName
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

