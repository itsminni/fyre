package minni.fyre.ui.navigation

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import minni.fyre.R
import minni.fyre.core.notifications.EventReminderScheduler
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navigation
import minni.fyre.data.model.hasCompleteProfile
import minni.fyre.ui.auth.AuthViewModel
import minni.fyre.ui.auth.LoginScreen
import minni.fyre.ui.auth.RegisterScreen
import minni.fyre.ui.auth.DemoNoticeScreen
import minni.fyre.ui.profile.ProfileCompletionScreen
import minni.fyre.ui.welcome.WelcomeScreen

@Composable
fun NavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    sessionViewModel: AppSessionViewModel
) {
    val sessionState by sessionViewModel.sessionState.collectAsState()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val context = LocalContext.current

    if (sessionState == AppSessionState.Loading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text = stringResource(R.string.nav_loading_session))
        }
        return
    }


    LaunchedEffect(sessionState, currentRoute) {
        when (sessionState) {
            AppSessionState.Loading -> Unit
            AppSessionState.Unauthenticated -> {
                if (currentRoute != AuthRoute.Welcome &&
                    currentRoute != AuthRoute.Login &&
                    currentRoute != AuthRoute.Register &&
                    currentRoute != AuthRoute.DemoNotice
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
                    onNavigateToDemoNotice = { navController.navigate(AuthRoute.DemoNotice) }
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
                    onNavigateToDemoNotice = { navController.navigate(AuthRoute.DemoNotice) },
                    onRegisterSuccess = {
                        authViewModel.resetState()
                        sessionViewModel.onAuthenticated(
                            isProfileComplete = authViewModel.currentUser.value?.hasCompleteProfile() == true
                        )
                    }
                )
            }

            composable(route = AuthRoute.DemoNotice) {
                DemoNoticeScreen(onBack = { navController.popBackStack() })
            }
        }

        composable(route = RootRoute.ProfileCompletion) {
            ProfileCompletionScreen(
                viewModel = authViewModel,
                onCompleteProfile = { sessionViewModel.completeProfile() },
                onLogout = {
                    EventReminderScheduler.cancelAllReminders(context.applicationContext)
                    authViewModel.logout(onCompleted = sessionViewModel::logout)
                }
            )
        }

        composable(route = RootRoute.AuthenticatedShell) {
            AuthenticatedShell(
                authViewModel = authViewModel,
                onLogout = {
                    EventReminderScheduler.cancelAllReminders(context.applicationContext)
                    authViewModel.logout(onCompleted = sessionViewModel::logout)
                }
            )
        }
    }
}
