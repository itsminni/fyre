package com.example.fyre.ui.navigation

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface AppSessionState {
    data object Unauthenticated : AppSessionState
    data object AuthenticatedProfileIncomplete : AppSessionState
    data object AuthenticatedProfileComplete : AppSessionState
}

class AppSessionViewModel : ViewModel() {
    private val _sessionState = MutableStateFlow<AppSessionState>(AppSessionState.Unauthenticated)
    val sessionState: StateFlow<AppSessionState> = _sessionState.asStateFlow()

    fun onAuthenticated() {
        _sessionState.value = AppSessionState.AuthenticatedProfileIncomplete
    }

    fun completeProfile() {
        _sessionState.value = AppSessionState.AuthenticatedProfileComplete
    }

    fun logout() {
        _sessionState.value = AppSessionState.Unauthenticated
    }
}

