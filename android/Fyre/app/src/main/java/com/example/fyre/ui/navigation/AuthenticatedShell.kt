package com.example.fyre.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.fyre.R
import com.example.fyre.core.notifications.AndroidNotificationGateway
import com.example.fyre.account.presentation.AccountScreen
import com.example.fyre.data.local.PersistedUserSettings
import com.example.fyre.data.local.UserSettingsDataStore
import com.example.fyre.discover.presentation.DiscoverScreen
import com.example.fyre.events.presentation.EventsScreen
import com.example.fyre.messages.presentation.MessagesScreen
import com.example.fyre.ui.auth.AuthViewModel

private data class MainTab(
    val route: String,
    val labelRes: Int,
    val icon: ImageVector
)

@Composable
fun AuthenticatedShell(
    authViewModel: AuthViewModel,
    onLogout: () -> Unit
) {
    val navController = rememberNavController()
    val currentUser by authViewModel.currentUser.collectAsState()
    val context = LocalContext.current
    val settingsDataStore = remember(context.applicationContext) {
        UserSettingsDataStore(context.applicationContext)
    }
    val persistedSettings by settingsDataStore.settings.collectAsState(
        initial = PersistedUserSettings()
    )
    val notificationGateway = remember(context.applicationContext) {
        AndroidNotificationGateway(context.applicationContext)
    }

    val tabs = listOf(
        MainTab(MainRoute.Home, R.string.tab_discovery, Icons.Filled.Explore),
        MainTab(MainRoute.Messages, R.string.tab_messages, Icons.AutoMirrored.Filled.Chat),
        MainTab(MainRoute.Events, R.string.tab_events, Icons.Filled.CalendarMonth),
        MainTab(MainRoute.Account, R.string.tab_account, Icons.Filled.AccountCircle)
    )

    Scaffold(
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = navBackStackEntry?.destination?.route

            NavigationBar {
                tabs.forEach { tab ->
                    val label = stringResource(tab.labelRes)
                    val isSelected = if (tab.route == MainRoute.Messages) {
                        currentRoute == MainRoute.Messages || currentRoute == MainRoute.MessagesThread
                    } else {
                        currentRoute == tab.route
                    }
                    NavigationBarItem(
                        selected = isSelected,
                        onClick = {
                            navController.navigate(tab.route) {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(imageVector = tab.icon, contentDescription = label) },
                        label = { Text(label) }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = MainRoute.Home,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(MainRoute.Home) {
                DiscoverScreen(
                    discoveryPreferences = persistedSettings.discoveryPreferences,
                    notificationSettings = persistedSettings.notificationSettings,
                    notificationGateway = notificationGateway,
                    onOpenThread = { threadId ->
                        navController.navigate(MainRoute.messagesThread(threadId))
                    }
                )
            }
            // Manteniamo la route legacy per compatibilita con eventuali deep link interni.
            composable(MainRoute.Discover) {
                DiscoverScreen(
                    discoveryPreferences = persistedSettings.discoveryPreferences,
                    notificationSettings = persistedSettings.notificationSettings,
                    notificationGateway = notificationGateway,
                    onOpenThread = { threadId ->
                        navController.navigate(MainRoute.messagesThread(threadId))
                    }
                )
            }
            composable(MainRoute.Messages) {
                MessagesScreen(
                    chatSettings = persistedSettings.chatCustomizationSettings,
                    notificationSettings = persistedSettings.notificationSettings,
                    notificationGateway = notificationGateway,
                    onOpenThread = { threadId ->
                        navController.navigate(MainRoute.messagesThread(threadId))
                    }
                )
            }
            composable(
                route = MainRoute.MessagesThread,
                arguments = listOf(navArgument(MainRoute.ThreadIdArg) { type = NavType.StringType })
            ) { backStackEntry ->
                MessagesScreen(
                    openThreadId = backStackEntry.arguments?.getString(MainRoute.ThreadIdArg),
                    chatSettings = persistedSettings.chatCustomizationSettings,
                    notificationSettings = persistedSettings.notificationSettings,
                    notificationGateway = notificationGateway,
                    onOpenThread = { threadId ->
                        navController.navigate(MainRoute.messagesThread(threadId))
                    },
                    onBackToInbox = {
                        navController.popBackStack()
                    }
                )
            }
            composable(MainRoute.Events) {
                EventsScreen(
                    currentUserId = currentUser?.appwriteUserId,
                    currentUserEmail = currentUser?.email,
                    currentUserDisplayName = currentUser?.displayName,
                    notificationSettings = persistedSettings.notificationSettings,
                    notificationGateway = notificationGateway
                )
            }
            composable(MainRoute.Account) {
                AccountScreen(
                    onLogout = onLogout,
                    currentUser = currentUser,
                    onUserUpdated = authViewModel::applyUpdatedUser
                )
            }
        }
    }
}
