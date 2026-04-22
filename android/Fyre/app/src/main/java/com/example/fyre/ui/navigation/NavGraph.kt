package com.example.fyre.ui.navigation

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.example.fyre.data.local.SessionDataStore
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navigation
import com.example.fyre.data.model.hasCompleteProfile
import com.example.fyre.ui.auth.AuthViewModel
import com.example.fyre.ui.auth.LoginScreen
import com.example.fyre.ui.auth.RegisterScreen
import com.example.fyre.ui.auth.TermsPrivacyScreen
import com.example.fyre.ui.profile.ProfileCompletionScreen
import com.example.fyre.ui.welcome.WelcomeScreen
import kotlinx.coroutines.launch

/**
 * Grafo di navigazione dell'app Fyre.
 *
 * Definisce tutte le schermate e le transizioni tra di esse.
 * Il ViewModel è condiviso tra le schermate di autenticazione per
 * mantenere lo stato dei campi durante la navigazione.
 *
 * @param navController Il controller di navigazione
 * @param authViewModel Il ViewModel condiviso per l'autenticazione
 */
@Composable
fun NavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    sessionViewModel: AppSessionViewModel,
    sessionDataStore: SessionDataStore
) {
    val sessionState by sessionViewModel.sessionState.collectAsState()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val scope = rememberCoroutineScope()

    if (sessionState == AppSessionState.Loading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text = "Caricamento sessione...")
        }
        return
    }

    // Root navigation guidata dallo stato logico locale/mock della sessione.
    LaunchedEffect(sessionState, currentRoute) {
        when (sessionState) {
            AppSessionState.Loading -> Unit
            AppSessionState.Unauthenticated -> {
                if (currentRoute != AuthRoute.Welcome &&
                    currentRoute != AuthRoute.Login &&
                    currentRoute != AuthRoute.Register &&
                    currentRoute != AuthRoute.TermsPrivacy
                ) {
                    navController.navigate(RootRoute.Auth) {
                        popUpTo(navController.graph.id) { inclusive = true }
                    }
                }
            }

            AppSessionState.AuthenticatedProfileIncomplete -> {
                if (currentRoute != RootRoute.ProfileCompletion) {
                    navController.navigate(RootRoute.ProfileCompletion) {
                        popUpTo(navController.graph.id) { inclusive = true }
                    }
                }
            }

            AppSessionState.AuthenticatedProfileComplete -> {
                if (currentRoute != RootRoute.AuthenticatedShell) {
                    navController.navigate(RootRoute.AuthenticatedShell) {
                        popUpTo(navController.graph.id) { inclusive = true }
                    }
                }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = RootRoute.Auth
    ) {
        navigation(
            startDestination = AuthRoute.Welcome,
            route = RootRoute.Auth
        ) {
            composable(route = AuthRoute.Welcome) {
                WelcomeScreen(
                    onNavigateToLogin = { navController.navigate(AuthRoute.Login) },
                    onNavigateToRegister = {
                        authViewModel.clearFields()
                        navController.navigate(AuthRoute.Register)
                    },
                    onNavigateToTerms = { navController.navigate(AuthRoute.TermsPrivacy) }
                )
            }

            composable(route = AuthRoute.Login) {
                LoginScreen(
                    viewModel = authViewModel,
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToRegister = {
                        authViewModel.clearFields()
                        navController.navigate(AuthRoute.Register)
                    },
                    onLoginSuccess = {
                        authViewModel.resetState()
                        scope.launch {
                            sessionDataStore.setCurrentUserEmail(authViewModel.currentUser.value?.email)
                        }
                        sessionViewModel.onAuthenticated(
                            isProfileComplete = authViewModel.currentUser.value?.hasCompleteProfile() == true
                        )
                    }
                )
            }

            composable(route = AuthRoute.Register) {
                RegisterScreen(
                    viewModel = authViewModel,
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToLogin = {
                        authViewModel.clearFields()
                        navController.popBackStack()
                    },
                    onNavigateToTerms = { navController.navigate(AuthRoute.TermsPrivacy) },
                    onRegisterSuccess = {
                        authViewModel.resetState()
                        scope.launch {
                            sessionDataStore.setCurrentUserEmail(authViewModel.currentUser.value?.email)
                        }
                        sessionViewModel.onAuthenticated(
                            isProfileComplete = authViewModel.currentUser.value?.hasCompleteProfile() == true
                        )
                    }
                )
            }

            composable(route = AuthRoute.TermsPrivacy) {
                TermsPrivacyScreen(
                    onAccept = {
                        authViewModel.setTermsAccepted(true)
                        navController.popBackStack()
                    },
                    onDecline = { navController.popBackStack() }
                )
            }
        }

        composable(route = RootRoute.ProfileCompletion) {
            ProfileCompletionScreen(
                viewModel = authViewModel,
                onCompleteProfile = { sessionViewModel.completeProfile() },
                onLogout = {
                    authViewModel.logout()
                    scope.launch { sessionDataStore.setCurrentUserEmail(null) }
                    sessionViewModel.logout()
                }
            )
        }

        composable(route = RootRoute.AuthenticatedShell) {
            AuthenticatedShell(
                authViewModel = authViewModel,
                onLogout = {
                    authViewModel.logout()
                    scope.launch { sessionDataStore.setCurrentUserEmail(null) }
                    sessionViewModel.logout()
                }
            )
        }
    }
}

