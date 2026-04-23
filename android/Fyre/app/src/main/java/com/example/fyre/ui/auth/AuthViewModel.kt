package com.example.fyre.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.fyre.data.model.User
import com.example.fyre.data.model.UserProfile
import com.example.fyre.data.model.hasCompleteProfile
import com.example.fyre.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ============================================================
// Stato dell'autenticazione — sealed class per gestire i vari stati
// ============================================================

/**
 * Rappresenta lo stato corrente del processo di autenticazione.
 * Usato dalla UI per mostrare feedback appropriato all'utente.
 */
sealed class AuthState {
    /** Stato iniziale, nessuna operazione in corso */
    data object Idle : AuthState()

    /** Autenticazione riuscita, contiene l'utente loggato */
    data class Success(val user: User) : AuthState()

    /** Errore durante l'autenticazione, contiene il messaggio di errore */
    data class Error(val message: String) : AuthState()
}

// ============================================================
// ViewModel per la gestione dell'autenticazione
// ============================================================

/**
 * ViewModel che gestisce la logica di login e registrazione.
 *
 * Contiene lo stato dei campi di input e la logica di validazione.
 * Comunica con il [AuthRepository] per le operazioni di autenticazione.
 *
 * @property repository Repository locale/fake per auth
 */
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

        const val TermsRequired = "Devi accettare Termini e Privacy per continuare"

        const val ProfileFirstNameRequired = "Inserisci il nome"
        const val ProfileLastNameRequired = "Inserisci il cognome"
        const val ProfileUsernameMinLength = "Username minimo 3 caratteri"
        const val ProfileCityRequired = "Inserisci la citta"
        const val ProfileBirthDateRequired = "Inserisci la data di nascita"
        const val ProfileAvatarRequired = "Seleziona un avatar"
        const val ProfileSessionUnavailable = "Sessione utente non disponibile"
        const val ProfileSaveError = "Errore salvataggio profilo"
    }

    // --- Stato dell'autenticazione ---
    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _globalError = MutableStateFlow<String?>(null)
    val globalError: StateFlow<String?> = _globalError.asStateFlow()

    // --- Campi di input condivisi ---
    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    // --- Campi di input solo per la registrazione ---
    private val _displayName = MutableStateFlow("")
    val displayName: StateFlow<String> = _displayName.asStateFlow()

    private val _confirmPassword = MutableStateFlow("")
    val confirmPassword: StateFlow<String> = _confirmPassword.asStateFlow()

    private val _termsAccepted = MutableStateFlow(false)
    val termsAccepted: StateFlow<Boolean> = _termsAccepted.asStateFlow()

    private val _displayNameError = MutableStateFlow<String?>(null)
    val displayNameError: StateFlow<String?> = _displayNameError.asStateFlow()

    private val _emailError = MutableStateFlow<String?>(null)
    val emailError: StateFlow<String?> = _emailError.asStateFlow()

    private val _passwordError = MutableStateFlow<String?>(null)
    val passwordError: StateFlow<String?> = _passwordError.asStateFlow()

    private val _confirmPasswordError = MutableStateFlow<String?>(null)
    val confirmPasswordError: StateFlow<String?> = _confirmPasswordError.asStateFlow()

    private val _termsError = MutableStateFlow<String?>(null)
    val termsError: StateFlow<String?> = _termsError.asStateFlow()

    private val _profileFirstName = MutableStateFlow("")
    val profileFirstName: StateFlow<String> = _profileFirstName.asStateFlow()

    private val _profileLastName = MutableStateFlow("")
    val profileLastName: StateFlow<String> = _profileLastName.asStateFlow()

    private val _profileUsername = MutableStateFlow("")
    val profileUsername: StateFlow<String> = _profileUsername.asStateFlow()

    private val _profileCity = MutableStateFlow("")
    val profileCity: StateFlow<String> = _profileCity.asStateFlow()

    private val _profileBirthDate = MutableStateFlow("")
    val profileBirthDate: StateFlow<String> = _profileBirthDate.asStateFlow()

    private val _profileBio = MutableStateFlow("")
    val profileBio: StateFlow<String> = _profileBio.asStateFlow()

    private val _profileAvatarUri = MutableStateFlow<String?>(null)
    val profileAvatarUri: StateFlow<String?> = _profileAvatarUri.asStateFlow()

    private val _profileError = MutableStateFlow<String?>(null)
    val profileError: StateFlow<String?> = _profileError.asStateFlow()

    private val _profileSaveCompleted = MutableStateFlow(false)
    val profileSaveCompleted: StateFlow<Boolean> = _profileSaveCompleted.asStateFlow()

    // --- Utente attualmente loggato ---
    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    // ============================================================
    // Aggiornamento campi di input
    // ============================================================

    /** Aggiorna il valore dell'email */
    fun updateEmail(value: String) {
        _email.value = value
        _emailError.value = null
        _globalError.value = null
    }

    /** Aggiorna il valore della password */
    fun updatePassword(value: String) {
        _password.value = value
        _passwordError.value = null
        _confirmPasswordError.value = null
        _globalError.value = null
    }

    /** Aggiorna il valore del nome visualizzato */
    fun updateDisplayName(value: String) {
        _displayName.value = value
        _displayNameError.value = null
        _globalError.value = null
    }

    /** Aggiorna il valore della conferma password */
    fun updateConfirmPassword(value: String) {
        _confirmPassword.value = value
        _confirmPasswordError.value = null
        _globalError.value = null
    }

    fun setTermsAccepted(value: Boolean) {
        _termsAccepted.value = value
        _termsError.value = null
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

    fun updateProfileUsername(value: String) {
        _profileUsername.value = value
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
    }

    fun updateProfileAvatarUri(value: String?) {
        _profileAvatarUri.value = value
        _profileError.value = null
    }

    fun hydrateProfileDraftFromCurrentUser() {
        val profile = _currentUser.value?.profile ?: return
        _profileFirstName.value = profile.firstName
        _profileLastName.value = profile.lastName
        _profileUsername.value = profile.username
        _profileCity.value = profile.city
        _profileBirthDate.value = profile.birthDate
        _profileBio.value = profile.bio
        _profileAvatarUri.value = profile.avatarUri
    }

    // ============================================================
    // Logica di autenticazione
    // ============================================================

    /**
     * Effettua il login con le credenziali inserite.
     * Valida i campi prima di procedere.
     */
    fun login() {
        if (_isLoading.value) return
        clearValidationErrors()
        _globalError.value = null

        // Validazione campi
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

    /**
     * Effettua la registrazione di un nuovo utente.
     * Valida tutti i campi prima di procedere.
     */
    fun register() {
        if (_isLoading.value) return
        clearValidationErrors()
        _globalError.value = null

        // Validazione nome
        if (_displayName.value.isBlank()) {
            _displayNameError.value = ValidationMessages.DisplayNameRequired
            return
        }

        if (_displayName.value.trim().length < 2) {
            _displayNameError.value = ValidationMessages.DisplayNameMinLength
            return
        }

        // Validazione email
        val emailError = validateEmail(_email.value)
        if (emailError != null) {
            _emailError.value = emailError
            return
        }

        // Validazione password
        val passwordError = validatePassword(_password.value)
        if (passwordError != null) {
            _passwordError.value = passwordError
            return
        }

        // Controllo corrispondenza password
        if (_password.value != _confirmPassword.value) {
            _confirmPasswordError.value = ValidationMessages.PasswordMismatch
            return
        }

        if (!_termsAccepted.value) {
            _termsError.value = ValidationMessages.TermsRequired
            return
        }

        _isLoading.value = true
        val consentTimestamp = System.currentTimeMillis()
        viewModelScope.launch {
            val result = repository.registerUser(
                email = _email.value,
                password = _password.value,
                displayName = _displayName.value,
                termsAcceptedAt = consentTimestamp,
                privacyAcceptedAt = consentTimestamp
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

    /**
     * Effettua il logout dell'utente.
     * Resetta tutti i campi e lo stato.
     */
    fun logout() {
        viewModelScope.launch {
            repository.logout()
        }
        _currentUser.value = null
        _authState.value = AuthState.Idle
        _email.value = ""
        _password.value = ""
        _displayName.value = ""
        _confirmPassword.value = ""
        _termsAccepted.value = false
        _globalError.value = null
        clearValidationErrors()
        clearProfileDraft()
        _profileSaveCompleted.value = false
        _isLoading.value = false
    }

    /**
     * Resetta lo stato di errore (chiamato quando l'utente cambia schermata).
     */
    fun resetState() {
        _authState.value = AuthState.Idle
        _globalError.value = null
        _profileSaveCompleted.value = false
    }

    /**
     * Pulisce i campi di input (utile quando si cambia tra login e registrazione).
     */
    fun clearFields() {
        _email.value = ""
        _password.value = ""
        _displayName.value = ""
        _confirmPassword.value = ""
        _termsAccepted.value = false
        _authState.value = AuthState.Idle
        _globalError.value = null
        clearValidationErrors()
        clearProfileDraft()
        _profileSaveCompleted.value = false
        _isLoading.value = false
    }

    fun hasCompletedProfile(): Boolean = _currentUser.value?.hasCompleteProfile() == true

    /**
     * Ripristina una sessione locale tramite email salvata su storage.
     * @return true se il profilo viene trovato e caricato, false altrimenti.
     */
    suspend fun restoreSession(email: String?): Boolean {
        val result = repository.restoreSession(email)
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

        val profile = UserProfile(
            firstName = _profileFirstName.value.trim(),
            lastName = _profileLastName.value.trim(),
            username = _profileUsername.value.trim(),
            city = _profileCity.value.trim(),
            birthDate = _profileBirthDate.value.trim(),
            bio = _profileBio.value.trim(),
            avatarUri = _profileAvatarUri.value
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

    // ============================================================
    // Validazione
    // ============================================================

    /**
     * Valida il formato dell'email.
     * @return Messaggio di errore se non valida, null se corretta
     */
    private fun validateEmail(email: String): String? {
        if (email.isBlank()) return ValidationMessages.EmailRequired
        // Pattern semplice per validazione email
        val emailPattern = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
        if (!emailPattern.matches(email.trim())) return ValidationMessages.EmailInvalid
        return null
    }

    private fun validateLoginPassword(password: String): String? {
        if (password.isBlank()) return ValidationMessages.LoginPasswordRequired
        return null
    }

    /**
     * Valida la robustezza della password.
     * Requisiti: minimo 8 caratteri, almeno 1 maiuscola, almeno 1 numero.
     *
     * @return Messaggio di errore se non valida, null se corretta
     */
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
        _termsError.value = null
    }

    private fun clearProfileDraft() {
        _profileFirstName.value = ""
        _profileLastName.value = ""
        _profileUsername.value = ""
        _profileCity.value = ""
        _profileBirthDate.value = ""
        _profileBio.value = ""
        _profileAvatarUri.value = null
        _profileError.value = null
        _profileSaveCompleted.value = false
    }

    private fun validateProfileDraft(): String? {
        if (_profileFirstName.value.isBlank()) return ValidationMessages.ProfileFirstNameRequired
        if (_profileLastName.value.isBlank()) return ValidationMessages.ProfileLastNameRequired
        if (_profileUsername.value.trim().length < 3) return ValidationMessages.ProfileUsernameMinLength
        if (_profileCity.value.isBlank()) return ValidationMessages.ProfileCityRequired
        if (_profileBirthDate.value.isBlank()) return ValidationMessages.ProfileBirthDateRequired
        if (_profileAvatarUri.value.isNullOrBlank()) return ValidationMessages.ProfileAvatarRequired
        return null
    }
}

// ============================================================
// Factory per creare l'AuthViewModel con il repository
// ============================================================

/**
 * Factory necessaria perché il ViewModel ha un parametro nel costruttore (repository).
 * Senza librerie di Dependency Injection (Hilt/Koin), usiamo questa factory manuale.
 */
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

