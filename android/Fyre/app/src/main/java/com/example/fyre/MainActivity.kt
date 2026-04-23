package com.example.fyre

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import androidx.compose.runtime.LaunchedEffect
import com.example.fyre.account.model.ThemeMode
import com.example.fyre.core.notifications.AndroidNotificationGateway
import com.example.fyre.data.local.PersistedUserSettings
import com.example.fyre.data.local.SessionDataStore
import com.example.fyre.data.local.UserSettingsDataStore
import com.example.fyre.data.repository.UserRepository
import com.example.fyre.ui.auth.AuthViewModel
import com.example.fyre.ui.auth.AuthViewModelFactory
import com.example.fyre.ui.navigation.AppSessionViewModel
import com.example.fyre.ui.navigation.NavGraph
import com.example.fyre.ui.theme.FyreTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Activity principale dell'app Fyre.
 *
 * Punto di ingresso dell'applicazione. Inizializza:
 * - Il tema Material 3 personalizzato (FyreTheme)
 * - Il repository per la persistenza degli utenti su file JSON
 * - Il ViewModel per la gestione dell'autenticazione
 * - Il grafo di navigazione tra le schermate
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Abilita il rendering edge-to-edge (contenuto sotto status/navigation bar)
        enableEdgeToEdge()

        // Inizializza il repository con il contesto dell'applicazione
        // (applicationContext vive per tutta la durata dell'app, evita memory leak)
        val userRepository = UserRepository(applicationContext)
        val sessionDataStore = SessionDataStore(applicationContext)
        val userSettingsDataStore = UserSettingsDataStore(applicationContext)
        val notificationGateway = AndroidNotificationGateway(applicationContext)
        notificationGateway.createChannels()

        setContent {
            val persistedSettings by userSettingsDataStore.settings.collectAsState(
                initial = PersistedUserSettings()
            )
            val darkTheme = when (persistedSettings.themeMode) {
                ThemeMode.System -> isSystemInDarkTheme()
                ThemeMode.Light -> false
                ThemeMode.Dark -> true
            }

            FyreTheme(
                darkTheme = darkTheme,
                dynamicColor = persistedSettings.dynamicColor
            ) {
                // Controller di navigazione — gestisce lo stack delle schermate
                val navController = rememberNavController()

                // ViewModel condiviso tra tutte le schermate di autenticazione
                // La factory permette di passare il repository al costruttore
                val authViewModel: AuthViewModel = viewModel(
                    factory = AuthViewModelFactory(userRepository)
                )
                val sessionViewModel: AppSessionViewModel = viewModel()

                LaunchedEffect(Unit) {
                    val savedEmail = sessionDataStore.currentUserEmail.first()
                    val restored = if (savedEmail.isNullOrBlank()) {
                        false
                    } else {
                        authViewModel.restoreSession(savedEmail)
                    }

                    if (restored) {
                        sessionViewModel.bootstrap(
                            isAuthenticated = true,
                            isProfileComplete = authViewModel.hasCompletedProfile()
                        )
                    } else {
                        sessionDataStore.setCurrentUserEmail(null)
                        sessionViewModel.bootstrap(
                            isAuthenticated = false,
                            isProfileComplete = false
                        )
                    }

                    launch {
                        authViewModel.currentUser.collect { user ->
                            sessionDataStore.setCurrentUserEmail(user?.email)
                        }
                    }
                }

                // Grafo di navigazione — definisce le schermate e le transizioni
                NavGraph(
                    navController = navController,
                    authViewModel = authViewModel,
                    sessionViewModel = sessionViewModel,
                    sessionDataStore = sessionDataStore
                )
            }
        }
    }
}

