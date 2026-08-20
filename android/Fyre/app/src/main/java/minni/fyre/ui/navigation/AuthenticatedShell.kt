package minni.fyre.ui.navigation

import android.Manifest
import android.content.Context
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import minni.fyre.R
import minni.fyre.account.model.NotificationSettings
import minni.fyre.core.notifications.AndroidNotificationGateway
import minni.fyre.core.notifications.EventReminderScheduler
import minni.fyre.core.notifications.NotificationChannels
import minni.fyre.core.notifications.NotificationGateway
import minni.fyre.core.notifications.RealtimeNotificationSeenStore
import minni.fyre.account.presentation.AccountScreen
import minni.fyre.data.AppGraph
import minni.fyre.data.AppGraphProvider
import minni.fyre.data.appwrite.AppwriteRealtimeEvent
import minni.fyre.data.appwrite.AppwriteRealtimeService
import minni.fyre.data.local.PersistedUserSettings
import minni.fyre.data.local.UserSettingsDataStore
import minni.fyre.discover.presentation.DiscoverScreen
import minni.fyre.events.presentation.EventsScreen
import minni.fyre.messages.model.MessageThread
import minni.fyre.messages.presentation.MessagesScreen
import minni.fyre.ui.auth.AuthViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
    val appGraph = remember(context.applicationContext) {
        AppGraphProvider.get(context.applicationContext)
    }
    val persistedSettings by settingsDataStore.settings.collectAsState(
        initial = PersistedUserSettings()
    )
    val notificationGateway = remember(context.applicationContext) {
        AndroidNotificationGateway(context.applicationContext)
    }

    LaunchedEffect(
        persistedSettings.notificationSettings.pushEnabled,
        persistedSettings.notificationSettings.eventReminders
    ) {
        if (!persistedSettings.notificationSettings.pushEnabled ||
            !persistedSettings.notificationSettings.eventReminders
        ) {
            EventReminderScheduler.cancelAllReminders(context.applicationContext)
        }
    }
    var matchBannerThread by remember { mutableStateOf<MessageThread?>(null) }
    var unreadMatchThreadIds by remember { mutableStateOf<Set<String>>(emptySet()) }

    NotificationPermissionEffect(enabled = persistedSettings.notificationSettings.pushEnabled)

    val openThread: (String) -> Unit = { threadId ->
        unreadMatchThreadIds = unreadMatchThreadIds - threadId
        matchBannerThread = null
        navController.navigate(MainRoute.messagesThread(threadId)) {
            launchSingleTop = true
        }
    }

    MatchRealtimeEffect(
        currentUserId = currentUser?.appwriteUserId,
        appGraph = appGraph,
        notificationSettings = persistedSettings.notificationSettings,
        notificationGateway = notificationGateway,
        onMatchedThread = { thread ->
            unreadMatchThreadIds = unreadMatchThreadIds + thread.id
            matchBannerThread = thread
        }
    )

    LaunchedEffect(matchBannerThread?.id) {
        val visibleThread = matchBannerThread ?: return@LaunchedEffect
        delay(MATCH_BANNER_DURATION_MS)
        if (matchBannerThread?.id == visibleThread.id) {
            matchBannerThread = null
        }
    }

    val tabs = listOf(
        MainTab(MainRoute.Home, R.string.tab_discovery, Icons.Filled.Explore),
        MainTab(MainRoute.Messages, R.string.tab_messages, Icons.AutoMirrored.Filled.Chat),
        MainTab(MainRoute.Events, R.string.tab_events, Icons.Filled.CalendarMonth),
        MainTab(MainRoute.Account, R.string.tab_account, Icons.Filled.AccountCircle)
    )

    Box {
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
                                if (tab.route == MainRoute.Messages) {
                                    unreadMatchThreadIds = emptySet()
                                    matchBannerThread = null
                                }
                                navController.navigate(tab.route) {
                                    popUpTo(MainRoute.Home) {
                                        saveState = false
                                    }
                                    launchSingleTop = true
                                    restoreState = false
                                }
                            },
                            icon = {
                                if (tab.route == MainRoute.Messages && unreadMatchThreadIds.isNotEmpty()) {
                                    BadgedBox(
                                        badge = {
                                            Badge {
                                                Text(unreadMatchThreadIds.size.toString())
                                            }
                                        }
                                    ) {
                                        Icon(imageVector = tab.icon, contentDescription = label)
                                    }
                                } else {
                                    Icon(imageVector = tab.icon, contentDescription = label)
                                }
                            },
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
                        currentUserId = currentUser?.appwriteUserId,
                        discoveryPreferences = persistedSettings.discoveryPreferences,
                        notificationSettings = persistedSettings.notificationSettings,
                        notificationGateway = notificationGateway,
                        onOpenThread = openThread
                    )
                }

                composable(MainRoute.Discover) {
                    DiscoverScreen(
                        currentUserId = currentUser?.appwriteUserId,
                        discoveryPreferences = persistedSettings.discoveryPreferences,
                        notificationSettings = persistedSettings.notificationSettings,
                        notificationGateway = notificationGateway,
                        onOpenThread = openThread
                    )
                }
                composable(MainRoute.Messages) {
                    MessagesScreen(
                        chatSettings = persistedSettings.chatCustomizationSettings,
                        notificationSettings = persistedSettings.notificationSettings,
                        notificationGateway = notificationGateway,
                        onOpenThread = openThread
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
                        onOpenThread = openThread,
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

        AnimatedVisibility(
            visible = matchBannerThread != null,
            enter = slideInVertically { -it } + fadeIn(),
            exit = slideOutVertically { -it } + fadeOut(),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .zIndex(1f)
        ) {
            matchBannerThread?.let { thread ->
                MatchBanner(
                    thread = thread,
                    onOpenThread = { openThread(thread.id) }
                )
            }
        }
    }
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
private fun NotificationPermissionEffect(enabled: Boolean) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return

    val permissionState = rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)
    var requestedPermission by remember { mutableStateOf(false) }
    LaunchedEffect(enabled, permissionState.status.isGranted) {
        if (enabled && !requestedPermission && !permissionState.status.isGranted) {
            requestedPermission = true
            permissionState.launchPermissionRequest()
        }
    }
}

@Composable
private fun MatchRealtimeEffect(
    currentUserId: String?,
    appGraph: AppGraph,
    notificationSettings: NotificationSettings,
    notificationGateway: NotificationGateway,
    onMatchedThread: (MessageThread) -> Unit
) {
    val context = LocalContext.current
    val notificationSeenStore = remember { RealtimeNotificationSeenStore() }

    LaunchedEffect(
        currentUserId,
        appGraph,
        notificationSettings.pushEnabled,
        notificationSettings.matchNotifications
    ) {
        val userId = currentUserId?.trim().takeUnless { it.isNullOrBlank() }
            ?: return@LaunchedEffect
        val configuration = appGraph.appwriteConfiguration ?: return@LaunchedEffect
        val knownThreadIds = mutableSetOf<String>()
        appGraph.messagesRepository.getThreads()
            .onSuccess { threads -> knownThreadIds += threads.map { it.id } }

        val effectScope = this
        val realtimeService = AppwriteRealtimeService(context.applicationContext, configuration)
        val subscription = realtimeService.makeNotificationSubscription(
            onEvent = onEvent@{ event ->
                val threadId = realtimeMatchThreadId(event, userId)
                if (threadId == null) {
                    val rawIdentifier = realtimeMatchIdentifier(event, userId) ?: return@onEvent
                    effectScope.launch {
                        handleRealtimeMatchNotification(
                            currentUserId = userId,
                            rawIdentifier = rawIdentifier,
                            notificationSettings = notificationSettings,
                            notificationGateway = notificationGateway,
                            notificationSeenStore = notificationSeenStore,
                            context = context.applicationContext
                        )
                    }
                    return@onEvent
                }

                effectScope.launch {
                    if (!knownThreadIds.add(threadId)) return@launch
                    handleRealtimeMatchedThread(
                        currentUserId = userId,
                        threadId = threadId,
                        appGraph = appGraph,
                        notificationSettings = notificationSettings,
                        notificationGateway = notificationGateway,
                        notificationSeenStore = notificationSeenStore,
                        context = context.applicationContext,
                        onMatchedThread = onMatchedThread
                    )
                }
            }
        )

        subscription.start()
        try {
            awaitCancellation()
        } finally {
            subscription.cancel()
        }
    }
}

private fun handleRealtimeMatchNotification(
    currentUserId: String,
    rawIdentifier: String,
    notificationSettings: NotificationSettings,
    notificationGateway: NotificationGateway,
    notificationSeenStore: RealtimeNotificationSeenStore,
    context: Context
) {
    if (!notificationSeenStore.markMatchSeen(currentUserId, rawIdentifier)) return
    if (!notificationSettings.pushEnabled || !notificationSettings.matchNotifications) return

    notificationGateway.showLocalNotification(
        title = context.getString(R.string.account_switch_matches),
        body = context.getString(R.string.discover_match_notification_fallback),
        channelId = NotificationChannels.MATCHES
    )
}

private suspend fun handleRealtimeMatchedThread(
    currentUserId: String,
    threadId: String,
    appGraph: AppGraph,
    notificationSettings: NotificationSettings,
    notificationGateway: NotificationGateway,
    notificationSeenStore: RealtimeNotificationSeenStore,
    context: Context,
    onMatchedThread: (MessageThread) -> Unit
) {
    if (!notificationSeenStore.markMatchSeen(currentUserId, threadId)) return

    val thread = appGraph.messagesRepository.ensureThread(threadId).getOrNull()
    if (notificationSettings.pushEnabled && notificationSettings.matchNotifications) {
        notificationGateway.showLocalNotification(
            title = context.getString(R.string.account_switch_matches),
            body = thread?.matchDisplayNameOrNull()?.let { name ->
                context.getString(R.string.discover_match_notification_body, name)
            } ?: context.getString(R.string.discover_match_notification_fallback),
            channelId = NotificationChannels.MATCHES
        )
    }

    if (thread != null) {
        onMatchedThread(thread)
    }
}

private fun realtimeMatchThreadId(event: AppwriteRealtimeEvent, currentUserId: String): String? {
    if (event.isThreadParticipantEvent() &&
        event.isCreate &&
        event.stringValue("userId") == currentUserId
    ) {
        return event.stringValue("threadId")
    }

    if (!event.isMatchEvent()) return null

    val userAId = event.stringValue("userAId")
    val userBId = event.stringValue("userBId")
    if (userAId != currentUserId && userBId != currentUserId) return null

    return event.stringValue("threadId")
}

private fun realtimeMatchIdentifier(event: AppwriteRealtimeEvent, currentUserId: String): String? {
    if (!event.isMatchEvent()) return null

    val userAId = event.stringValue("userAId")
    val userBId = event.stringValue("userBId")
    if (userAId != currentUserId && userBId != currentUserId) return null

    return event.stringValue("threadId")
        ?: event.stringValue("\$id")
        ?: event.stringValue("matchKey")
}

private fun AppwriteRealtimeEvent.isThreadParticipantEvent(): Boolean {
    if (stringValue("threadId") == null || stringValue("userId") == null) return false

    return stringValue("role") != null ||
        hasPayloadKey("muted") ||
        hasPayloadKey("pinned") ||
        hasPayloadKey("notificationsEnabled") ||
        hasPayloadKey("lastReadAt")
}

private fun AppwriteRealtimeEvent.isMatchEvent(): Boolean {
    return stringValue("matchKey") != null ||
        (stringValue("userAId") != null && stringValue("userBId") != null)
}

@Composable
private fun MatchBanner(
    thread: MessageThread,
    onOpenThread: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenThread),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 6.dp,
        shadowElevation = 10.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                modifier = Modifier.size(42.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Filled.Favorite,
                        contentDescription = null,
                        modifier = Modifier.size(22.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Box(modifier = Modifier.weight(1f)) {
                androidx.compose.foundation.layout.Column {
                    Text(
                        text = stringResource(
                            R.string.match_banner_title,
                            thread.matchDisplayNameOrNull() ?: thread.displayName
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = stringResource(R.string.match_banner_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Icon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

private fun MessageThread.matchDisplayNameOrNull(): String? {
    val normalized = displayName.trim()
    if (normalized.isBlank()) return null
    if (normalized.equals("Match", ignoreCase = true)) return null
    return normalized
}

private const val MATCH_BANNER_DURATION_MS = 6_000L
