package minni.fyre.ui.navigation

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface AppSessionState {
    data object Loading : AppSessionState
    data object Unavailable : AppSessionState
    data object Unauthenticated : AppSessionState
    data object AuthenticatedProfileIncomplete : AppSessionState
    data object AuthenticatedProfileComplete : AppSessionState
}

class AppSessionViewModel : ViewModel() {
    private val _sessionState = MutableStateFlow<AppSessionState>(AppSessionState.Loading)
    val sessionState: StateFlow<AppSessionState> = _sessionState.asStateFlow()

    fun verifyAgain() { _sessionState.value = AppSessionState.Loading }
    fun verificationFailed() { _sessionState.value = AppSessionState.Unavailable }

    fun bootstrap(isAuthenticated: Boolean, isProfileComplete: Boolean) {
        _sessionState.value = if (!isAuthenticated) {
            AppSessionState.Unauthenticated
        } else if (isProfileComplete) {
            AppSessionState.AuthenticatedProfileComplete
        } else {
            AppSessionState.AuthenticatedProfileIncomplete
        }
    }

    fun onAuthenticated(isProfileComplete: Boolean) {
        _sessionState.value = if (isProfileComplete) {
            AppSessionState.AuthenticatedProfileComplete
        } else {
            AppSessionState.AuthenticatedProfileIncomplete
        }
    }

    fun completeProfile() {
        _sessionState.value = AppSessionState.AuthenticatedProfileComplete
    }

    fun logout() {
        _sessionState.value = AppSessionState.Unauthenticated
    }
}

