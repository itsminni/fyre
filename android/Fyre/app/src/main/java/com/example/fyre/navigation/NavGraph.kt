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

@Composable
fun NavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel
) {
    NavHost(
        navController = navController,
        startDestination = Screen.Welcome.route 
    ) {

composable(route = Screen.Welcome.route) {
            WelcomeScreen(
                onNavigateToLogin = {
                    
                    navController.navigate(Screen.Login.route)
                },
                onNavigateToRegister = {
                    
                    authViewModel.clearFields()
                    navController.navigate(Screen.Register.route)
                }
            )
        }

composable(route = Screen.Login.route) {
            LoginScreen(
                viewModel = authViewModel,
                onNavigateBack = {
                    
                    navController.popBackStack()
                },
                onNavigateToRegister = {
                    
                    authViewModel.clearFields()
                    navController.navigate(Screen.Register.route)
                },
                onLoginSuccess = {
                    
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Welcome.route) { inclusive = true }
                    }
                }
            )
        }

composable(route = Screen.Register.route) {
            RegisterScreen(
                viewModel = authViewModel,
                onNavigateBack = {
                    
                    navController.popBackStack()
                },
                onNavigateToLogin = {
                    
                    authViewModel.clearFields()
                    navController.popBackStack()
                },
                onRegisterSuccess = {
                    
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Welcome.route) { inclusive = true }
                    }
                }
            )
        }

composable(route = Screen.Home.route) {
            HomeScreen(
                viewModel = authViewModel,
                onLogout = {
                    
                    authViewModel.logout()
                    navController.navigate(Screen.Welcome.route) {
                        popUpTo(Screen.Home.route) { inclusive = true }
                    }
                }
            )
        }
    }
}


