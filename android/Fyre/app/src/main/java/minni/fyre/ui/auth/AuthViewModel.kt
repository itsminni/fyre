package minni.fyre.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import minni.fyre.data.model.ProfileFieldValues
import minni.fyre.data.model.User
import minni.fyre.data.model.UserProfile
import minni.fyre.data.model.hasCompleteProfile
import minni.fyre.data.repository.AuthRepository
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AuthState {

    data object Idle : AuthState()


    data class Success(val user: User) : AuthState()


    data class Error(val message: String) : AuthState()
}

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {

    private object ValidationMessages {
        const val UnknownError = "Errore sconosciuto"

        const val DisplayNameRequired = "Inserisci il tuo nome"
        const val DisplayNameMinLength = "Il nome deve avere almeno 2 caratteri"

        const val EmailRequired = "Inserisci l'email"
        const val EmailInvalid = "Formato email non valido"

        const val LoginPasswordRequired = "Inserisci la password"
        const val RegisterPasswordMinLength = "La password deve avere almeno 8 caratteri"
        const val RegisterPasswordUppercase = "La password deve contenere almeno una lettera maiuscola"
        const val RegisterPasswordDigit = "La password deve contenere almeno un numero"
        const val PasswordMismatch = "Le password non corrispondono"

        const val DemoNoticeRequired = "Conferma di aver letto la nota sulla demo e sui dati per continuare"

        const val ProfileFirstNameRequired = "Inserisci il nome"
        const val ProfileCityRequired = "Inserisci la citta"
        const val ProfileBirthDateRequired = "Inserisci la data di nascita"
        const val ProfileInvalidAge = "Devi avere almeno 18 anni"
        const val ProfileBioRequired = "Inserisci una bio"
        const val ProfilePreferredGendersRequired = "Seleziona almeno una preferenza di genere"
        const val ProfileSessionUnavailable = "Sessione utente non disponibile"
        const val ProfileSaveError = "Errore salvataggio profilo"
    }


    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _globalError = MutableStateFlow<String?>(null)
    val globalError: StateFlow<String?> = _globalError.asStateFlow()


    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()


    private val _displayName = MutableStateFlow("")
    val displayName: StateFlow<String> = _displayName.asStateFlow()

    private val _confirmPassword = MutableStateFlow("")
    val confirmPassword: StateFlow<String> = _confirmPassword.asStateFlow()

    private val _demoNoticeRead = MutableStateFlow(false)
    val demoNoticeRead: StateFlow<Boolean> = _demoNoticeRead.asStateFlow()

    private val _displayNameError = MutableStateFlow<String?>(null)
    val displayNameError: StateFlow<String?> = _displayNameError.asStateFlow()

    private val _emailError = MutableStateFlow<String?>(null)
    val emailError: StateFlow<String?> = _emailError.asStateFlow()

    private val _passwordError = MutableStateFlow<String?>(null)
    val passwordError: StateFlow<String?> = _passwordError.asStateFlow()

    private val _confirmPasswordError = MutableStateFlow<String?>(null)
    val confirmPasswordError: StateFlow<String?> = _confirmPasswordError.asStateFlow()

    private val _demoNoticeError = MutableStateFlow<String?>(null)
    val demoNoticeError: StateFlow<String?> = _demoNoticeError.asStateFlow()

    private val _profileFirstName = MutableStateFlow("")
    val profileFirstName: StateFlow<String> = _profileFirstName.asStateFlow()

    private val _profileLastName = MutableStateFlow("")
    val profileLastName: StateFlow<String> = _profileLastName.asStateFlow()

    private val _profileCity = MutableStateFlow("")
    val profileCity: StateFlow<String> = _profileCity.asStateFlow()

    private val _profileBirthDate = MutableStateFlow("")
    val profileBirthDate: StateFlow<String> = _profileBirthDate.asStateFlow()

    private val _profileBio = MutableStateFlow("")
    val profileBio: StateFlow<String> = _profileBio.asStateFlow()

    private val _profileAvatarUri = MutableStateFlow<String?>(null)
    val profileAvatarUri: StateFlow<String?> = _profileAvatarUri.asStateFlow()

    private val _profilePhotoUris = MutableStateFlow<List<String>>(emptyList())
    val profilePhotoUris: StateFlow<List<String>> = _profilePhotoUris.asStateFlow()

    private val _profileGender = MutableStateFlow(ProfileFieldValues.GenderMale)
    val profileGender: StateFlow<String> = _profileGender.asStateFlow()

    private val _profileOrientation = MutableStateFlow(ProfileFieldValues.OrientationStraight)
    val profileOrientation: StateFlow<String> = _profileOrientation.asStateFlow()

    private val _profileIntent = MutableStateFlow(ProfileFieldValues.IntentRelationship)
    val profileIntent: StateFlow<String> = _profileIntent.asStateFlow()

    private val _profileInterests = MutableStateFlow("")
    val profileInterests: StateFlow<String> = _profileInterests.asStateFlow()

    private val _profileInstagramTag = MutableStateFlow("")
    val profileInstagramTag: StateFlow<String> = _profileInstagramTag.asStateFlow()

    private val _profileSpotifyTag = MutableStateFlow("")
    val profileSpotifyTag: StateFlow<String> = _profileSpotifyTag.asStateFlow()

    private val _profilePreferredGenders = MutableStateFlow<List<String>>(emptyList())
    val profilePreferredGenders: StateFlow<List<String>> = _profilePreferredGenders.asStateFlow()

    private val _profileMinPreferredAge = MutableStateFlow("20")
    val profileMinPreferredAge: StateFlow<String> = _profileMinPreferredAge.asStateFlow()

    private val _profileMaxPreferredAge = MutableStateFlow("32")
    val profileMaxPreferredAge: StateFlow<String> = _profileMaxPreferredAge.asStateFlow()

    private val _profileMaxDistanceKm = MutableStateFlow("50")
    val profileMaxDistanceKm: StateFlow<String> = _profileMaxDistanceKm.asStateFlow()

    private val _profileSmokes = MutableStateFlow(false)
    val profileSmokes: StateFlow<Boolean> = _profileSmokes.asStateFlow()

    private val _profileDrinks = MutableStateFlow(false)
    val profileDrinks: StateFlow<Boolean> = _profileDrinks.asStateFlow()

    private val _profileError = MutableStateFlow<String?>(null)
    val profileError: StateFlow<String?> = _profileError.asStateFlow()

    private val _profileSaveCompleted = MutableStateFlow(false)
    val profileSaveCompleted: StateFlow<Boolean> = _profileSaveCompleted.asStateFlow()


    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

fun updateEmail(value: String) {
        _email.value = value
        _emailError.value = null
        _globalError.value = null
    }


    fun updatePassword(value: String) {
        _password.value = value
        _passwordError.value = null
        _confirmPasswordError.value = null
        _globalError.value = null
    }


    fun updateDisplayName(value: String) {
        _displayName.value = value
        _displayNameError.value = null
        _globalError.value = null
    }


    fun updateConfirmPassword(value: String) {
        _confirmPassword.value = value
        _confirmPasswordError.value = null
        _globalError.value = null
    }

    fun setDemoNoticeRead(value: Boolean) {
        _demoNoticeRead.value = value
        _demoNoticeError.value = null
        _globalError.value = null
    }

    fun updateProfileFirstName(value: String) {
        _profileFirstName.value = value
        _profileError.value = null
    }

    fun updateProfileLastName(value: String) {
        _profileLastName.value = value
        _profileError.value = null
    }

    fun updateProfileCity(value: String) {
        _profileCity.value = value
        _profileError.value = null
    }

    fun updateProfileBirthDate(value: String) {
        _profileBirthDate.value = value
        _profileError.value = null
    }

    fun updateProfileBio(value: String) {
        _profileBio.value = value
        _profileError.value = null
    }

    fun updateProfileAvatarUri(value: String?) {
        _profileAvatarUri.value = value
        _profileError.value = null
    }

    fun addProfilePhotoUris(values: List<String>) {
        val next = (_profilePhotoUris.value + values)
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
            .take(MaxProfilePhotoCount)
        _profilePhotoUris.value = next
        _profileError.value = null
    }

    fun removeProfilePhotoAt(index: Int) {
        val current = _profilePhotoUris.value
        if (index !in current.indices) return

        _profilePhotoUris.value = current.toMutableList().apply { removeAt(index) }
        _profileError.value = null
    }

    fun moveProfilePhoto(index: Int, delta: Int) {
        val target = index + delta
        val current = _profilePhotoUris.value
        if (index !in current.indices || target !in current.indices) return

        _profilePhotoUris.value = current.toMutableList().apply {
            val moving = removeAt(index)
            add(target, moving)
        }
        _profileError.value = null
    }

    fun updateProfileGender(value: String) {
        _profileGender.value = ProfileFieldValues.canonicalGenderOrNull(value)
            ?: ProfileFieldValues.GenderMale
        _profileError.value = null
    }

    fun updateProfileOrientation(value: String) {
        _profileOrientation.value = ProfileFieldValues.canonicalOrientationOrNull(value)
            ?: ProfileFieldValues.OrientationStraight
        _profileError.value = null
    }

    fun updateProfileIntent(value: String) {
        _profileIntent.value = ProfileFieldValues.canonicalIntent(
            value,
            fallback = ProfileFieldValues.IntentRelationship
        )
        _profileError.value = null
    }

    fun updateProfileInterests(value: String) {
        _profileInterests.value = value
        _profileError.value = null
    }

    fun updateProfileInstagramTag(value: String) {
        _profileInstagramTag.value = value
        _profileError.value = null
    }

    fun updateProfileSpotifyTag(value: String) {
        _profileSpotifyTag.value = value
        _profileError.value = null
    }

    fun setProfilePreferredGender(value: String, selected: Boolean) {
        val canonicalValue = ProfileFieldValues.canonicalGenderOrNull(value) ?: return
        val current = _profilePreferredGenders.value.toMutableList()
        if (selected && canonicalValue !in current) {
            current += canonicalValue
        } else if (!selected) {
            current -= canonicalValue
        }
        _profilePreferredGenders.value = ProfileFieldValues.canonicalPreferredGenders(current)
        _profileError.value = null
    }

    fun updateProfileMinPreferredAge(value: String) {
        _profileMinPreferredAge.value = value.filter { it.isDigit() }.take(2)
        _profileError.value = null
    }

    fun updateProfileMaxPreferredAge(value: String) {
        _profileMaxPreferredAge.value = value.filter { it.isDigit() }.take(2)
        _profileError.value = null
    }

    fun updateProfileMaxDistanceKm(value: String) {
        _profileMaxDistanceKm.value = value.filter { it.isDigit() }.take(3)
        _profileError.value = null
    }

    fun updateProfileSmokes(value: Boolean) {
        _profileSmokes.value = value
        _profileError.value = null
    }

    fun updateProfileDrinks(value: Boolean) {
        _profileDrinks.value = value
        _profileError.value = null
    }

    fun hydrateProfileDraftFromCurrentUser() {
        val profile = _currentUser.value?.profile ?: return
        _profileFirstName.value = profile.firstName
        _profileLastName.value = profile.lastName
        _profileCity.value = profile.city
        _profileBirthDate.value = profile.birthDate
        _profileBio.value = profile.bio
        _profileAvatarUri.value = profile.avatarUri
        _profilePhotoUris.value = profile.profilePhotoUris.take(MaxProfilePhotoCount)
        _profileGender.value = ProfileFieldValues.canonicalGenderOrNull(profile.gender)
            ?: ProfileFieldValues.GenderMale
        _profileOrientation.value = ProfileFieldValues.canonicalOrientationOrNull(profile.orientation)
            ?: ProfileFieldValues.OrientationStraight
        _profileIntent.value = ProfileFieldValues.canonicalIntent(
            profile.intent,
            fallback = ProfileFieldValues.IntentRelationship
        )
        _profileInterests.value = profile.interests
        _profileInstagramTag.value = profile.instagramTag.orEmpty()
        _profileSpotifyTag.value = profile.spotifyTag.orEmpty()
        _profilePreferredGenders.value = normalizedPreferredGenders(profile.preferredGenders)
        val (minPreferredAge, maxPreferredAge) = ProfileFieldValues.preferredAgeRange(
            profile.minPreferredAge,
            profile.maxPreferredAge
        )
        _profileMinPreferredAge.value = minPreferredAge.toString()
        _profileMaxPreferredAge.value = maxPreferredAge.toString()
        _profileMaxDistanceKm.value = ProfileFieldValues.maxDistanceKm(profile.maxDistanceKm)
            ?.toString()
            .orEmpty()
        _profileSmokes.value = profile.smokes
        _profileDrinks.value = profile.drinks
    }

fun login() {
        if (_isLoading.value) return
        clearValidationErrors()
        _globalError.value = null


        val emailError = validateEmail(_email.value)
        if (emailError != null) {
            _emailError.value = emailError
            return
        }

        val passwordError = validateLoginPassword(_password.value)
        if (passwordError != null) {
            _passwordError.value = passwordError
            return
        }

        _isLoading.value = true
        viewModelScope.launch {
            val result = repository.authenticateUser(_email.value, _password.value)
            result.fold(
                onSuccess = { user ->
                    _currentUser.value = user
                    _authState.value = AuthState.Success(user)
                },
                onFailure = { error ->
                    val message = error.message ?: ValidationMessages.UnknownError
                    _globalError.value = message
                    _authState.value = AuthState.Error(message)
                }
            )
            _isLoading.value = false
        }
    }

fun register() {
        if (_isLoading.value) return
        clearValidationErrors()
        _globalError.value = null


        if (_displayName.value.isBlank()) {
            _displayNameError.value = ValidationMessages.DisplayNameRequired
            return
        }

        if (_displayName.value.trim().length < 2) {
            _displayNameError.value = ValidationMessages.DisplayNameMinLength
            return
        }


        val emailError = validateEmail(_email.value)
        if (emailError != null) {
            _emailError.value = emailError
            return
        }


        val passwordError = validatePassword(_password.value)
        if (passwordError != null) {
            _passwordError.value = passwordError
            return
        }


        if (_password.value != _confirmPassword.value) {
            _confirmPasswordError.value = ValidationMessages.PasswordMismatch
            return
        }

        if (!_demoNoticeRead.value) {
            _demoNoticeError.value = ValidationMessages.DemoNoticeRequired
            return
        }

        _isLoading.value = true
        viewModelScope.launch {
            val result = repository.registerUser(
                email = _email.value,
                password = _password.value,
                displayName = _displayName.value
            )
            result.fold(
                onSuccess = { user ->
                    _currentUser.value = user
                    _authState.value = AuthState.Success(user)
                },
                onFailure = { error ->
                    val message = error.message ?: ValidationMessages.UnknownError
                    _globalError.value = message
                    _authState.value = AuthState.Error(message)
                }
            )

            _isLoading.value = false
        }
    }

fun logout(onCompleted: () -> Unit = {}) {
        if (_isLoading.value) return

        _isLoading.value = true
        _globalError.value = null
        viewModelScope.launch {
            // Do not expose the login flow until the remote session deletion and
            // the fail-closed local cleanup have both completed.
            repository.logout()
            clearAuthenticatedState()
            _isLoading.value = false
            onCompleted()
        }
    }

fun resetState() {
        _authState.value = AuthState.Idle
        _globalError.value = null
        _profileSaveCompleted.value = false
    }

fun clearFields() {
        _email.value = ""
        _password.value = ""
        _displayName.value = ""
        _confirmPassword.value = ""
        _demoNoticeRead.value = false
        _authState.value = AuthState.Idle
        _globalError.value = null
        clearValidationErrors()
        clearProfileDraft()
        _profileSaveCompleted.value = false
        _isLoading.value = false
    }

    fun hasCompletedProfile(): Boolean = _currentUser.value?.hasCompleteProfile() == true

    fun applyUpdatedUser(user: User) {
        _currentUser.value = user
        _authState.value = AuthState.Idle
        _globalError.value = null
    }

suspend fun restoreSession(): Boolean {
        val result = repository.restoreSession()
        val user = result.getOrElse { throwable ->
            _globalError.value = throwable.message ?: ValidationMessages.UnknownError
            return false
        } ?: return false

        _currentUser.value = user
        _authState.value = AuthState.Idle
        _globalError.value = null
        return true
    }

    fun saveProfileSetup() {
        if (_isLoading.value) return
        _profileError.value = validateProfileDraft()
        if (_profileError.value != null) {
            return
        }

        val current = _currentUser.value ?: run {
            _profileError.value = ValidationMessages.ProfileSessionUnavailable
            return
        }

        val minPreferredAge = resolvedMinPreferredAge()
        val maxPreferredAge = resolvedMaxPreferredAge(minPreferredAge)
        val profile = (current.profile ?: UserProfile()).copy(
            firstName = _profileFirstName.value.trim(),
            lastName = _profileLastName.value.trim(),
            city = _profileCity.value.trim(),
            birthDate = _profileBirthDate.value.trim(),
            gender = ProfileFieldValues.canonicalGenderOrNull(_profileGender.value)
                ?: ProfileFieldValues.GenderMale,
            orientation = ProfileFieldValues.canonicalOrientationOrNull(_profileOrientation.value)
                ?: ProfileFieldValues.OrientationStraight,
            bio = _profileBio.value.trim(),
            intent = ProfileFieldValues.canonicalIntent(
                _profileIntent.value,
                fallback = ProfileFieldValues.IntentRelationship
            ),
            interests = _profileInterests.value.trim(),
            instagramTag = normalizedSocialTag(_profileInstagramTag.value),
            spotifyTag = normalizedSocialTag(_profileSpotifyTag.value),
            preferredGenders = normalizedPreferredGenders(_profilePreferredGenders.value),
            minPreferredAge = minPreferredAge,
            maxPreferredAge = maxPreferredAge,
            maxDistanceKm = resolvedMaxDistanceKm(),
            smokes = _profileSmokes.value,
            drinks = _profileDrinks.value,
            avatarUri = _profileAvatarUri.value,
            profilePhotoUris = _profilePhotoUris.value.take(MaxProfilePhotoCount)
        )

        _isLoading.value = true
        viewModelScope.launch {
            val result = repository.updateUserProfile(current.email, profile)
            _isLoading.value = false

            result.fold(
                onSuccess = { updatedUser ->
                    _currentUser.value = updatedUser
                    _profileError.value = null
                    _profileSaveCompleted.value = true
                },
                onFailure = { throwable ->
                    _profileError.value = throwable.message ?: ValidationMessages.ProfileSaveError
                    _profileSaveCompleted.value = false
                }
            )
        }
    }

    fun consumeProfileSaveCompleted() {
        _profileSaveCompleted.value = false
    }

private fun validateEmail(email: String): String? {
        if (email.isBlank()) return ValidationMessages.EmailRequired

        val emailPattern = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
        if (!emailPattern.matches(email.trim())) return ValidationMessages.EmailInvalid
        return null
    }

    private fun validateLoginPassword(password: String): String? {
        if (password.isBlank()) return ValidationMessages.LoginPasswordRequired
        return null
    }

fun validatePassword(password: String): String? {
        if (password.length < 8) return ValidationMessages.RegisterPasswordMinLength
        if (!password.any { it.isUpperCase() }) return ValidationMessages.RegisterPasswordUppercase
        if (!password.any { it.isDigit() }) return ValidationMessages.RegisterPasswordDigit
        return null
    }

    private fun clearValidationErrors() {
        _displayNameError.value = null
        _emailError.value = null
        _passwordError.value = null
        _confirmPasswordError.value = null
        _demoNoticeError.value = null
    }

    private fun clearProfileDraft() {
        _profileFirstName.value = ""
        _profileLastName.value = ""
        _profileCity.value = ""
        _profileBirthDate.value = ""
        _profileBio.value = ""
        _profileAvatarUri.value = null
        _profilePhotoUris.value = emptyList()
        _profileGender.value = ProfileFieldValues.GenderMale
        _profileOrientation.value = ProfileFieldValues.OrientationStraight
        _profileIntent.value = ProfileFieldValues.IntentRelationship
        _profileInterests.value = ""
        _profileInstagramTag.value = ""
        _profileSpotifyTag.value = ""
        _profilePreferredGenders.value = emptyList()
        _profileMinPreferredAge.value = "20"
        _profileMaxPreferredAge.value = "32"
        _profileMaxDistanceKm.value = "50"
        _profileSmokes.value = false
        _profileDrinks.value = false
        _profileError.value = null
        _profileSaveCompleted.value = false
    }

    private fun clearAuthenticatedState() {
        _currentUser.value = null
        _authState.value = AuthState.Idle
        _email.value = ""
        _password.value = ""
        _displayName.value = ""
        _confirmPassword.value = ""
        _demoNoticeRead.value = false
        _globalError.value = null
        clearValidationErrors()
        clearProfileDraft()
        _profileSaveCompleted.value = false
    }

    private fun validateProfileDraft(): String? {
        if (_profileFirstName.value.isBlank()) return ValidationMessages.ProfileFirstNameRequired
        if (_profileCity.value.isBlank()) return ValidationMessages.ProfileCityRequired
        if (_profileBirthDate.value.isBlank()) return ValidationMessages.ProfileBirthDateRequired
        val age = ageFromBirthDate(_profileBirthDate.value)
            ?: return ValidationMessages.ProfileInvalidAge
        if (age < 18) return ValidationMessages.ProfileInvalidAge
        if (_profileBio.value.isBlank()) return ValidationMessages.ProfileBioRequired
        if (_profilePreferredGenders.value.none { it.isNotBlank() }) {
            return ValidationMessages.ProfilePreferredGendersRequired
        }
        return null
    }

    private fun resolvedMinPreferredAge(): Int {
        val requestedMin = _profileMinPreferredAge.value.toIntOrNull() ?: 20
        val requestedMax = _profileMaxPreferredAge.value.toIntOrNull() ?: 32
        return ProfileFieldValues.preferredAgeRange(requestedMin, requestedMax).first
    }

    private fun resolvedMaxPreferredAge(minPreferredAge: Int): Int {
        val requestedMax = _profileMaxPreferredAge.value.toIntOrNull() ?: 32
        return ProfileFieldValues.preferredAgeRange(minPreferredAge, requestedMax).second
    }

    private fun resolvedMaxDistanceKm(): Int? {
        return ProfileFieldValues.maxDistanceKm(_profileMaxDistanceKm.value.toIntOrNull())
    }

    private fun normalizedPreferredGenders(values: List<String>): List<String> {
        return ProfileFieldValues.canonicalPreferredGenders(values)
    }

    private fun normalizedSocialTag(value: String?): String? {
        val trimmed = value?.trim().orEmpty()
        if (trimmed.isBlank()) return null

        val withoutAtPrefix = trimmed.dropWhile { it == '@' }
        val withoutWhitespace = withoutAtPrefix.replace(Regex("\\s+"), "")
        val withoutAt = withoutWhitespace.replace("@", "")
        return withoutAt.take(64).takeIf { it.isNotBlank() }
    }

    private fun ageFromBirthDate(value: String): Int? {
        val birthDate = parseBirthDate(value) ?: return null
        return Period.between(birthDate, LocalDate.now(ZoneOffset.UTC)).years
    }

    private fun parseBirthDate(value: String): LocalDate? {
        val trimmed = value.trim()
        if (trimmed.isBlank()) return null

        return runCatching {
            LocalDate.parse(trimmed, DateTimeFormatter.ofPattern("dd/MM/yyyy"))
        }.recoverCatching {
            LocalDate.parse(trimmed, DateTimeFormatter.ISO_LOCAL_DATE)
        }.recoverCatching { error ->
            if (error is DateTimeParseException) {
                Instant.parse(trimmed).atZone(ZoneOffset.UTC).toLocalDate()
            } else {
                throw error
            }
        }.getOrNull()
    }

    private companion object {
        private const val MaxProfilePhotoCount = 6
    }
}

class AuthViewModelFactory(
    private val repository: AuthRepository
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AuthViewModel::class.java)) {
            return AuthViewModel(repository) as T
        }
        throw IllegalArgumentException("Classe ViewModel sconosciuta: ${modelClass.name}")
    }
}
