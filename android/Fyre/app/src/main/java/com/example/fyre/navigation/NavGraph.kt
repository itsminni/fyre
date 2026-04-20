package com.example.fyre.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.example.fyre.auth.presentation.AuthViewModel
import com.example.fyre.auth.presentation.LoginScreen
import com.example.fyre.auth.presentation.RegisterScreen
import com.example.fyre.discover.presentation.WelcomeScreen
import com.example.fyre.profile.presentation.HomeScreen

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
    authViewModel: AuthViewModel
) {
    NavHost(
        navController = navController,
        startDestination = Screen.Welcome.route // La schermata iniziale è il benvenuto
    ) {
        // ============================================================
        // Schermata di Benvenuto
        // ============================================================
        composable(route = Screen.Welcome.route) {
            WelcomeScreen(
                onNavigateToLogin = {
                    // Naviga al login
                    navController.navigate(Screen.Login.route)
                },
                onNavigateToRegister = {
                    // Naviga alla registrazione
                    authViewModel.clearFields()
                    navController.navigate(Screen.Register.route)
                }
            )
        }

        // ============================================================
        // Schermata di Login
        // ============================================================
        composable(route = Screen.Login.route) {
            LoginScreen(
                viewModel = authViewModel,
                onNavigateBack = {
                    // Torna alla schermata di benvenuto
                    navController.popBackStack()
                },
                onNavigateToRegister = {
                    // Pulisce i campi quando si va alla registrazione
                    authViewModel.clearFields()
                    navController.navigate(Screen.Register.route)
                },
                onLoginSuccess = {
                    // Naviga alla Home e rimuove tutto il back stack auth
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Welcome.route) { inclusive = true }
                    }
                }
            )
        }

        // ============================================================
        // Schermata di Registrazione
        // ============================================================
        composable(route = Screen.Register.route) {
            RegisterScreen(
                viewModel = authViewModel,
                onNavigateBack = {
                    // Torna alla schermata precedente
                    navController.popBackStack()
                },
                onNavigateToLogin = {
                    // Pulisce i campi quando si torna al login
                    authViewModel.clearFields()
                    navController.popBackStack()
                },
                onRegisterSuccess = {
                    // Naviga alla Home e rimuove tutto il back stack auth
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Welcome.route) { inclusive = true }
                    }
                }
            )
        }

        // ============================================================
        // Schermata Home (dopo il login)
        // ============================================================
        composable(route = Screen.Home.route) {
            HomeScreen(
                viewModel = authViewModel,
                onLogout = {
                    // Effettua il logout e torna alla schermata di benvenuto
                    authViewModel.logout()
                    navController.navigate(Screen.Welcome.route) {
                        popUpTo(Screen.Home.route) { inclusive = true }
                    }
                }
            )
        }
    }
}


