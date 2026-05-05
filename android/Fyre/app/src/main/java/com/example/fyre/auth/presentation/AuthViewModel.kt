package com.example.fyre.auth.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.example.fyre.data.model.User
import com.example.fyre.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.runBlocking

sealed class AuthState {
    
    data object Idle : AuthState()

    
    data class Success(val user: User) : AuthState()

    
    data class Error(val message: String) : AuthState()
}

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {

    
    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    
    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    
    private val _displayName = MutableStateFlow("")
    val displayName: StateFlow<String> = _displayName.asStateFlow()

    private val _confirmPassword = MutableStateFlow("")
    val confirmPassword: StateFlow<String> = _confirmPassword.asStateFlow()

    
    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

fun updateEmail(value: String) {
        _email.value = value
    }

    
    fun updatePassword(value: String) {
        _password.value = value
    }

    
    fun updateDisplayName(value: String) {
        _displayName.value = value
    }

    
    fun updateConfirmPassword(value: String) {
        _confirmPassword.value = value
    }

fun login() {
        
        val emailError = validateEmail(_email.value)
        if (emailError != null) {
            _authState.value = AuthState.Error(emailError)
            return
        }

        if (_password.value.isBlank()) {
            _authState.value = AuthState.Error("Inserisci la password")
            return
        }

        
        val result = runBlocking { repository.authenticateUser(_email.value, _password.value) }
        result.fold(
            onSuccess = { user ->
                _currentUser.value = user
                _authState.value = AuthState.Success(user)
            },
            onFailure = { error ->
                _authState.value = AuthState.Error(error.message ?: "Errore sconosciuto")
            }
        )
    }

fun register() {
        
        if (_displayName.value.isBlank()) {
            _authState.value = AuthState.Error("Inserisci il tuo nome")
            return
        }

        
        val emailError = validateEmail(_email.value)
        if (emailError != null) {
            _authState.value = AuthState.Error(emailError)
            return
        }

        
        val passwordError = validatePassword(_password.value)
        if (passwordError != null) {
            _authState.value = AuthState.Error(passwordError)
            return
        }

        
        if (_password.value != _confirmPassword.value) {
            _authState.value = AuthState.Error("Le password non corrispondono")
            return
        }

        
        val result = runBlocking {
            repository.registerUser(
                email = _email.value,
                password = _password.value,
                displayName = _displayName.value,
                termsAcceptedAt = null,
                privacyAcceptedAt = null
            )
        }
        result.fold(
            onSuccess = { user ->
                _currentUser.value = user
                _authState.value = AuthState.Success(user)
            },
            onFailure = { error ->
                _authState.value = AuthState.Error(error.message ?: "Errore sconosciuto")
            }
        )
    }

fun logout() {
        _currentUser.value = null
        _authState.value = AuthState.Idle
        _email.value = ""
        _password.value = ""
        _displayName.value = ""
        _confirmPassword.value = ""
    }

fun resetState() {
        _authState.value = AuthState.Idle
    }

fun clearFields() {
        _email.value = ""
        _password.value = ""
        _displayName.value = ""
        _confirmPassword.value = ""
        _authState.value = AuthState.Idle
    }

private fun validateEmail(email: String): String? {
        if (email.isBlank()) return "Inserisci l'email"
        
        val emailPattern = Regex("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
        if (!emailPattern.matches(email.trim())) return "Formato email non valido"
        return null
    }

fun validatePassword(password: String): String? {
        if (password.length < 8) return "La password deve avere almeno 8 caratteri"
        if (!password.any { it.isUpperCase() }) return "La password deve contenere almeno una lettera maiuscola"
        if (!password.any { it.isDigit() }) return "La password deve contenere almeno un numero"
        return null
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


