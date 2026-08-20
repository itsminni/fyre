package minni.fyre.account.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import minni.fyre.account.model.AccountSection
import minni.fyre.account.model.AccountUiState
import minni.fyre.account.model.AppLanguage
import minni.fyre.account.model.AppIconVariant
import minni.fyre.account.model.AppearanceSettings
import minni.fyre.account.model.ChatCustomizationSettings
import minni.fyre.account.model.DiscoveryPreferences
import minni.fyre.account.model.EventHistoryItem
import minni.fyre.account.model.EventHistoryStatus
import minni.fyre.account.model.NotificationSettings
import minni.fyre.account.model.ProfileDraft
import minni.fyre.account.model.ThemeMode
import minni.fyre.data.local.UserSettingsDataStore
import minni.fyre.data.model.ProfileFieldValues
import minni.fyre.data.model.User
import minni.fyre.data.model.UserProfile
import minni.fyre.data.repository.AuthRepository
import minni.fyre.events.data.EventsRepository
import minni.fyre.events.model.EventUserState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class AccountViewModel(
    initialUser: User?,
    private val authRepository: AuthRepository? = null,
    private val eventsRepository: EventsRepository? = null,
    private val userSettingsDataStore: UserSettingsDataStore? = null,
    private val onUserUpdated: (User) -> Unit = {}
) : ViewModel() {
    private var currentUser: User? = initialUser
    private var profileAutoSaveJob: Job? = null

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
                            appLanguage = persisted.appLanguage,
                            appIconVariant = persisted.appIconVariant
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
        scheduleProfileAutoSave()
    }

    fun saveProfile() {
        profileAutoSaveJob?.cancel()
        saveProfileNow(isAutomatic = false)
    }

    private fun saveProfileNow(isAutomatic: Boolean) {
        val repository = authRepository ?: run {
            _uiState.value = _uiState.value.copy(statusMessage = "Repository profilo Appwrite non configurato")
            return
        }
        val user = currentUser ?: run {
            _uiState.value = _uiState.value.copy(statusMessage = "Sessione utente non disponibile")
            return
        }
        if (_uiState.value.isSavingProfile) {
            if (isAutomatic) scheduleProfileAutoSave()
            return
        }

        val draft = _uiState.value.profileDraft
        val preferredGenders = ProfileFieldValues.canonicalPreferredGenders(draft.preferredGenders)
        if (preferredGenders.isEmpty()) {
            _uiState.value = _uiState.value.copy(
                statusMessage = "Seleziona almeno una preferenza di genere"
            )
            return
        }
        val (minPreferredAge, maxPreferredAge) = ProfileFieldValues.preferredAgeRange(
            draft.minPreferredAge,
            draft.maxPreferredAge
        )
        val profile = (user.profile ?: UserProfile()).copy(
            firstName = draft.firstName.trim(),
            lastName = draft.lastName.trim(),
            city = draft.city.trim(),
            birthDate = draft.birthDate.trim(),
            gender = ProfileFieldValues.canonicalGenderOrNull(draft.gender)
                ?: ProfileFieldValues.GenderMale,
            orientation = ProfileFieldValues.canonicalOrientationOrNull(draft.orientation)
                ?: ProfileFieldValues.OrientationStraight,
            bio = draft.bio.trim(),
            intent = ProfileFieldValues.canonicalIntent(
                draft.intent,
                fallback = ProfileFieldValues.IntentRelationship
            ),
            interests = draft.interests.trim(),
            instagramTag = draft.instagramTag.trim().ifBlank { null },
            spotifyTag = draft.spotifyTag.trim().ifBlank { null },
            preferredGenders = preferredGenders,
            minPreferredAge = minPreferredAge,
            maxPreferredAge = maxPreferredAge,
            maxDistanceKm = ProfileFieldValues.maxDistanceKm(draft.maxDistanceKm),
            smokes = draft.smokes,
            drinks = draft.drinks,
            excludeSmokers = draft.excludeSmokers,
            excludeDrinkers = draft.excludeDrinkers,
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
                    val latestDraft = _uiState.value.profileDraft
                    val hasNewerDraft = latestDraft != draft
                    _uiState.value = _uiState.value.copy(
                        email = updatedUser.email,
                        displayName = updatedUser.displayName,
                        profileDraft = if (hasNewerDraft) latestDraft else profileDraftFromUser(updatedUser),
                        isSavingProfile = false,
                        statusMessage = if (isAutomatic) {
                            "Modifiche salvate automaticamente"
                        } else {
                            "Profilo aggiornato su database"
                        }
                    )
                    if (hasNewerDraft) scheduleProfileAutoSave()
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
            statusMessage = "Preferenze salvate sul dispositivo"
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

    fun updateAppearanceSettings(update: AppearanceSettings) {
        _uiState.value = _uiState.value.copy(
            appearanceSettings = update,
            statusMessage = "Aspetto aggiornato sul dispositivo"
        )
        userSettingsDataStore?.let { dataStore ->
            viewModelScope.launch {
                dataStore.updateAppearance(
                    themeMode = update.themeMode,
                    appLanguage = update.appLanguage,
                    appIconVariant = update.appIconVariant
                )
            }
        }
    }

    fun setThemeMode(mode: ThemeMode) {
        val current = _uiState.value.appearanceSettings
        updateAppearanceSettings(current.copy(themeMode = mode))
    }

    fun setAppLanguage(language: AppLanguage) {
        val current = _uiState.value.appearanceSettings
        updateAppearanceSettings(current.copy(appLanguage = language))
    }

    fun setAppIconVariant(variant: AppIconVariant) {
        val current = _uiState.value.appearanceSettings
        updateAppearanceSettings(current.copy(appIconVariant = variant))
    }

    private fun scheduleProfileAutoSave() {
        if (authRepository == null || currentUser == null) return

        profileAutoSaveJob?.cancel()
        profileAutoSaveJob = viewModelScope.launch {
            delay(ProfileAutoSaveDelayMs)
            saveProfileNow(isAutomatic = true)
        }
    }

    private fun profileDraftFromUser(user: User?): ProfileDraft {
        val profile = user?.profile
        if (profile != null) {
            val (minPreferredAge, maxPreferredAge) = ProfileFieldValues.preferredAgeRange(
                profile.minPreferredAge,
                profile.maxPreferredAge
            )
            return ProfileDraft(
                firstName = profile.firstName,
                lastName = profile.lastName,
                city = profile.city,
                birthDate = profile.birthDate,
                gender = ProfileFieldValues.canonicalGenderOrNull(profile.gender)
                    ?: ProfileFieldValues.GenderMale,
                orientation = ProfileFieldValues.canonicalOrientationOrNull(profile.orientation)
                    ?: ProfileFieldValues.OrientationStraight,
                bio = profile.bio,
                intent = ProfileFieldValues.canonicalIntent(
                    profile.intent,
                    fallback = ProfileFieldValues.IntentRelationship
                ),
                interests = profile.interests,
                instagramTag = profile.instagramTag.orEmpty(),
                spotifyTag = profile.spotifyTag.orEmpty(),
                preferredGenders = ProfileFieldValues.canonicalPreferredGenders(profile.preferredGenders),
                minPreferredAge = minPreferredAge,
                maxPreferredAge = maxPreferredAge,
                maxDistanceKm = ProfileFieldValues.maxDistanceKm(profile.maxDistanceKm),
                smokes = profile.smokes,
                drinks = profile.drinks,
                excludeSmokers = profile.excludeSmokers,
                excludeDrinkers = profile.excludeDrinkers,
                avatarUri = profile.avatarUri,
                profilePhotoUris = profile.profilePhotoUris.take(MaxProfilePhotoCount)
            )
        }

        val safeName = user?.displayName.orEmpty().trim()
        if (safeName.isBlank()) return ProfileDraft()

        val parts = safeName.split(" ").filter { it.isNotBlank() }
        return ProfileDraft(
            firstName = parts.firstOrNull().orEmpty(),
            lastName = parts.drop(1).joinToString(" ")
        )
    }

    private fun loadEventHistoryFromDatabase() {
        val repository = eventsRepository ?: return
        val user = currentUser ?: return

        viewModelScope.launch {
            val result = repository.getEventsForUser(
                userId = user.appwriteUserId ?: user.email,
                displayName = user.displayName
            )
            result.onSuccess { loadedEvents ->
                val history = loadedEvents.mapNotNull { event ->
                    val status = when (event.userState) {
                        EventUserState.Registered -> EventHistoryStatus.Registered
                        EventUserState.Promoted -> EventHistoryStatus.Promoted
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
        private const val ProfileAutoSaveDelayMs = 900L
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
