package com.example.fyre.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.padding
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.fyre.account.presentation.AccountScreen
import com.example.fyre.discover.presentation.DiscoverScreen
import com.example.fyre.events.presentation.EventsScreen
import com.example.fyre.messages.presentation.MessagesScreen
import com.example.fyre.ui.auth.AuthViewModel
import com.example.fyre.ui.home.HomeScreen

private data class MainTab(
    val route: String,
    val label: String,
    val icon: ImageVector
)

@Composable
fun AuthenticatedShell(
    authViewModel: AuthViewModel,
    onLogout: () -> Unit
) {
    val navController = rememberNavController()
    val tabs = listOf(
        MainTab(MainRoute.Home, "Home", Icons.Filled.Home),
        MainTab(MainRoute.Discover, "Discover", Icons.Filled.Explore),
        MainTab(MainRoute.Messages, "Messaggi", Icons.AutoMirrored.Filled.Chat),
        MainTab(MainRoute.Events, "Eventi", Icons.Filled.CalendarMonth),
        MainTab(MainRoute.Account, "Account", Icons.Filled.AccountCircle)
    )

    Scaffold(
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = navBackStackEntry?.destination?.route

            NavigationBar {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = currentRoute == tab.route,
                        onClick = {
                            navController.navigate(tab.route) {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(imageVector = tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) }
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
                HomeScreen(
                    viewModel = authViewModel,
                    onLogout = onLogout
                )
            }
            composable(MainRoute.Discover) { DiscoverScreen() }
            composable(MainRoute.Messages) { MessagesScreen() }
            composable(MainRoute.Events) { EventsScreen() }
            composable(MainRoute.Account) { AccountScreen() }
        }
    }
}



