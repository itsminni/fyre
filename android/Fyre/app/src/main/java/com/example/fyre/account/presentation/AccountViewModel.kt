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
import com.example.fyre.data.model.ProfileFieldValues
import com.example.fyre.data.model.User
import com.example.fyre.data.model.UserProfile
import com.example.fyre.data.repository.AuthRepository
import com.example.fyre.events.data.EventsRepository
import com.example.fyre.events.model.EventUserState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AccountViewModel(
    initialUser: User?,
    private val authRepository: AuthRepository? = null,
    private val eventsRepository: EventsRepository? = null,
    private val userSettingsDataStore: UserSettingsDataStore? = null,
    private val onUserUpdated: (User) -> Unit = {}
) : ViewModel() {
    private var currentUser: User? = initialUser

    private val _uiState = MutableStateFlow(
        AccountUiState(
            email = initialUser?.email.orEmpty(),
            displayName = initialUser?.displayName.orEmpty(),
            profileDraft = profileDraftFromUser(initialUser)
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
        loadEventHistoryFromDatabase()
    }

    fun openSection(section: AccountSection) {
        _uiState.value = _uiState.value.copy(selectedSection = section, statusMessage = null)
    }

    fun backToHub() {
        _uiState.value = _uiState.value.copy(selectedSection = null, statusMessage = null)
    }

    fun updateProfileDraft(update: ProfileDraft) {
        _uiState.value = _uiState.value.copy(
            profileDraft = update,
            statusMessage = null
        )
    }

    fun saveProfile() {
        val repository = authRepository ?: run {
            _uiState.value = _uiState.value.copy(statusMessage = "Repository profilo Appwrite non configurato")
            return
        }
        val user = currentUser ?: run {
            _uiState.value = _uiState.value.copy(statusMessage = "Sessione utente non disponibile")
            return
        }
        val draft = _uiState.value.profileDraft
        val minPreferredAge = draft.minPreferredAge.coerceIn(18, 98)
        val maxPreferredAge = draft.maxPreferredAge.coerceIn(
            minimumValue = maxOf(minPreferredAge + 1, 19),
            maximumValue = 99
        )
        val profile = (user.profile ?: UserProfile()).copy(
            firstName = draft.firstName.trim(),
            lastName = draft.lastName.trim(),
            username = draft.username.trim(),
            city = draft.city.trim(),
            birthDate = draft.birthDate.trim(),
            gender = draft.gender.ifBlank { ProfileFieldValues.GenderMale },
            orientation = draft.orientation.ifBlank { ProfileFieldValues.OrientationStraight },
            bio = draft.bio.trim(),
            intent = draft.intent.ifBlank { ProfileFieldValues.IntentRelationship },
            interests = draft.interests.trim(),
            instagramTag = draft.instagramTag.trim().ifBlank { null },
            spotifyTag = draft.spotifyTag.trim().ifBlank { null },
            preferredGenders = normalizedPreferredGenders(draft.preferredGenders),
            minPreferredAge = minPreferredAge,
            maxPreferredAge = maxPreferredAge,
            maxDistanceKm = draft.maxDistanceKm?.coerceAtLeast(5),
            smokes = draft.smokes,
            drinks = draft.drinks,
            avatarUri = draft.avatarUri,
            profilePhotoUris = draft.profilePhotoUris.take(MaxProfilePhotoCount)
        )

        _uiState.value = _uiState.value.copy(isSavingProfile = true, statusMessage = null)
        viewModelScope.launch {
            val result = repository.updateUserProfile(user.email, profile)
            result.fold(
                onSuccess = { updatedUser ->
                    currentUser = updatedUser
                    onUserUpdated(updatedUser)
                    _uiState.value = _uiState.value.copy(
                        email = updatedUser.email,
                        displayName = updatedUser.displayName,
                        profileDraft = profileDraftFromUser(updatedUser),
                        isSavingProfile = false,
                        statusMessage = "Profilo aggiornato su database"
                    )
                    loadEventHistoryFromDatabase()
                },
                onFailure = { throwable ->
                    _uiState.value = _uiState.value.copy(
                        isSavingProfile = false,
                        statusMessage = throwable.message ?: "Aggiornamento profilo non riuscito"
                    )
                }
            )
        }
    }

    fun updateDiscoveryPreferences(update: DiscoveryPreferences) {
        _uiState.value = _uiState.value.copy(
            discoveryPreferences = update,
            statusMessage = "Preferenze discovery salvate sul dispositivo"
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
            statusMessage = "Notifiche aggiornate sul dispositivo"
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
            statusMessage = "Personalizzazione chat salvata sul dispositivo"
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
            statusMessage = "Impostazioni sicurezza aggiornate sul dispositivo"
        )
    }

    fun updateAppearanceSettings(update: AppearanceSettings) {
        _uiState.value = _uiState.value.copy(
            appearanceSettings = update,
            statusMessage = "Aspetto aggiornato sul dispositivo"
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

    private fun profileDraftFromUser(user: User?): ProfileDraft {
        val profile = user?.profile
        if (profile != null) {
            return ProfileDraft(
                firstName = profile.firstName,
                lastName = profile.lastName,
                username = profile.username,
                city = profile.city,
                birthDate = profile.birthDate,
                gender = normalizedProfileGender(profile.gender),
                orientation = profile.orientation,
                bio = profile.bio,
                intent = profile.intent,
                interests = profile.interests,
                instagramTag = profile.instagramTag.orEmpty(),
                spotifyTag = profile.spotifyTag.orEmpty(),
                preferredGenders = normalizedPreferredGenders(profile.preferredGenders),
                minPreferredAge = profile.minPreferredAge,
                maxPreferredAge = profile.maxPreferredAge,
                maxDistanceKm = profile.maxDistanceKm,
                smokes = profile.smokes,
                drinks = profile.drinks,
                avatarUri = profile.avatarUri,
                profilePhotoUris = profile.profilePhotoUris.take(MaxProfilePhotoCount)
            )
        }

        val safeName = user?.displayName.orEmpty().trim()
        if (safeName.isBlank()) return ProfileDraft()

        val parts = safeName.split(" ").filter { it.isNotBlank() }
        return ProfileDraft(
            firstName = parts.firstOrNull().orEmpty(),
            lastName = parts.drop(1).joinToString(" "),
            username = safeName.lowercase().replace(" ", "")
        )
    }

    private fun normalizedPreferredGenders(values: List<String>): List<String> {
        val normalized = values.map(::normalizedProfileGender)
        return ProfileFieldValues.DefaultPreferredGenders
            .filter { it in normalized }
            .ifEmpty { ProfileFieldValues.DefaultPreferredGenders }
    }

    private fun normalizedProfileGender(value: String): String {
        return if (value.equals("nonbinary", ignoreCase = true)) {
            ProfileFieldValues.GenderNonBinary
        } else {
            value
        }
    }

    private fun loadEventHistoryFromDatabase() {
        val repository = eventsRepository ?: return
        val user = currentUser ?: return

        viewModelScope.launch {
            val result = repository.getEventsForUser(
                userId = user.appwriteUserId ?: user.email,
                displayName = user.displayName,
                email = user.email
            )
            result.onSuccess { loadedEvents ->
                val history = loadedEvents.mapNotNull { event ->
                    val status = when (event.userState) {
                        EventUserState.Registered -> EventHistoryStatus.Registered
                        EventUserState.Waitlist -> EventHistoryStatus.Waitlisted
                        EventUserState.NotRegistered,
                        EventUserState.Closed -> return@mapNotNull null
                    }
                    EventHistoryItem(
                        id = event.id,
                        title = event.title,
                        dateText = event.dateText,
                        place = event.place,
                        status = status
                    )
                }
                _uiState.value = _uiState.value.copy(eventHistory = history)
            }.onFailure { throwable ->
                _uiState.value = _uiState.value.copy(
                    eventHistory = emptyList(),
                    statusMessage = throwable.message ?: "Impossibile caricare gli eventi dal database"
                )
            }
        }
    }

    private companion object {
        private const val MaxProfilePhotoCount = 6
    }
}

class AccountViewModelFactory(
    private val initialUser: User?,
    private val authRepository: AuthRepository? = null,
    private val eventsRepository: EventsRepository? = null,
    private val userSettingsDataStore: UserSettingsDataStore? = null,
    private val onUserUpdated: (User) -> Unit = {}
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AccountViewModel::class.java)) {
            return AccountViewModel(
                initialUser = initialUser,
                authRepository = authRepository,
                eventsRepository = eventsRepository,
                userSettingsDataStore = userSettingsDataStore,
                onUserUpdated = onUserUpdated
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

