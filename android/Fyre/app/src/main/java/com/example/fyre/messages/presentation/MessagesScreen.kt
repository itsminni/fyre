package com.example.fyre.messages.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.fyre.R
import com.example.fyre.account.model.ChatCustomizationSettings
import com.example.fyre.account.model.NotificationSettings
import com.example.fyre.core.notifications.NotificationChannels
import com.example.fyre.core.notifications.NotificationGateway
import com.example.fyre.data.AppGraph
import com.example.fyre.data.AppGraphProvider
import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteRealtimeEvent
import com.example.fyre.data.appwrite.AppwriteRealtimeService
import com.example.fyre.data.appwrite.PersistentCookieJar
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

@Composable
fun MessagesScreen(
    openThreadId: String? = null,
    chatSettings: ChatCustomizationSettings = ChatCustomizationSettings(),
    notificationSettings: NotificationSettings = NotificationSettings(),
    notificationGateway: NotificationGateway? = null,
    onOpenThread: (String) -> Unit = {},
    onBackToInbox: () -> Unit = {}
) {
    val context = LocalContext.current
    val appGraph = remember(context.applicationContext) {
        AppGraphProvider.get(context.applicationContext)
    }
    val viewModel: MessagesViewModel = viewModel(
        factory = MessagesViewModelFactory(appGraph.messagesRepository)
    )
    val threads by viewModel.threads.collectAsState()
    val selectedThreadId by viewModel.selectedThreadId.collectAsState()
    val messages by viewModel.messages.collectAsState()
    val draft by viewModel.draft.collectAsState()
    val replyToMessageId by viewModel.replyToMessageId.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    var lastNotifiedUnreadCount by rememberSaveable { mutableIntStateOf(-1) }
    val imageHeaders = remember(context.applicationContext, appGraph.appwriteConfiguration) {
        appGraph.appwriteConfiguration?.let { configuration ->
            appwriteImageHeaders(
                context = context.applicationContext,
                configuration = configuration
            )
        }.orEmpty()
    }

    LaunchedEffect(openThreadId) {
        if (openThreadId.isNullOrBlank()) {
            viewModel.showInbox()
        } else {
            viewModel.openThread(openThreadId)
        }
    }

    MessagesRealtimeEffect(
        appGraph = appGraph,
        selectedThreadId = selectedThreadId,
        viewModel = viewModel
    )
    MessagesPresenceEffect(viewModel = viewModel)
    InboxPollingEffect(
        selectedThreadId = selectedThreadId,
        viewModel = viewModel
    )
    ActiveThreadPollingEffect(
        selectedThreadId = selectedThreadId,
        viewModel = viewModel
    )

    LaunchedEffect(
        threads,
        selectedThreadId,
        notificationSettings.pushEnabled,
        notificationSettings.messageNotifications
    ) {
        if (selectedThreadId != null) return@LaunchedEffect

        val unreadTotal = threads.sumOf { it.unreadCount }
        if (unreadTotal <= 0) {
            lastNotifiedUnreadCount = 0
            return@LaunchedEffect
        }

        val canNotify = notificationSettings.pushEnabled && notificationSettings.messageNotifications
        if (!canNotify || unreadTotal == lastNotifiedUnreadCount) return@LaunchedEffect

        val latestUnreadThread = threads.firstOrNull { it.unreadCount > 0 }
        notificationGateway?.showLocalNotification(
            title = if (unreadTotal == 1) {
                context.getString(R.string.messages_new_message_one)
            } else {
                context.getString(R.string.messages_new_messages_many, unreadTotal)
            },
            body = latestUnreadThread?.let {
                context.getString(R.string.messages_notification_body, it.displayName, it.lastMessage)
            } ?: context.getString(R.string.messages_notification_fallback),
            channelId = NotificationChannels.MESSAGES
        )
        lastNotifiedUnreadCount = unreadTotal
    }

    if (selectedThreadId == null) {
        MessagesInboxScreen(
            threads = threads,
            onOpenThread = { threadId ->
                onOpenThread(threadId)
                viewModel.clearError()
            },
            onToggleThreadNotifications = { thread ->
                viewModel.setThreadNotifications(thread.id, !thread.notificationsEnabled)
            },
            isLoading = isLoading,
            errorMessage = errorMessage
        )
        return
    }

    val currentThread = threads.firstOrNull { it.id == selectedThreadId }
    if (currentThread == null) {
        MessagesInboxScreen(
            threads = threads,
            onOpenThread = onOpenThread,
            onToggleThreadNotifications = { thread ->
                viewModel.setThreadNotifications(thread.id, !thread.notificationsEnabled)
            },
            isLoading = isLoading,
            errorMessage = errorMessage
        )
        return
    }

    MessageThreadScreen(
        thread = currentThread,
        messages = messages,
        draft = draft,
        replyToMessageId = replyToMessageId,
        errorMessage = errorMessage,
        onDraftChange = viewModel::updateDraft,
        onSend = viewModel::sendCurrentMessage,
        onReply = { messageId -> viewModel.setReplyToMessage(messageId) },
        onCancelReply = { viewModel.setReplyToMessage(null) },
        onSendAttachment = { attachment ->
            viewModel.sendAttachment(
                type = attachment.type,
                displayName = attachment.displayName,
                localUri = attachment.localUri,
                mimeType = attachment.mimeType
            )
        },
        onSendVoice = viewModel::sendVoiceMessage,
        onToggleThreadNotifications = { enabled -> viewModel.setThreadNotifications(enabled) },
        onRelationshipAction = viewModel::updateRelationship,
        chatSettings = chatSettings,
        imageHeaders = imageHeaders,
        onBack = onBackToInbox
    )
}

@Composable
private fun MessagesPresenceEffect(viewModel: MessagesViewModel) {
    DisposableEffect(viewModel) {
        viewModel.markPresence(isOnline = true)
        onDispose {
            viewModel.markPresence(isOnline = false)
        }
    }
}

@Composable
private fun MessagesRealtimeEffect(
    appGraph: AppGraph,
    selectedThreadId: String?,
    viewModel: MessagesViewModel
) {
    val context = LocalContext.current

    LaunchedEffect(appGraph, selectedThreadId) {
        val configuration = appGraph.appwriteConfiguration ?: return@LaunchedEffect
        val effectScope = this
        val subscription = AppwriteRealtimeService(
            context = context.applicationContext,
            configuration = configuration
        ).makeInboxSubscription(
            onEvent = { event ->
                val activeThreadId = selectedThreadId
                val eventThreadId = event.messageThreadId()
                when {
                    activeThreadId != null && eventThreadId == activeThreadId -> {
                        effectScope.launch {
                            delay(RealtimeRefreshDebounceMs)
                            viewModel.refreshSelectedThread()
                        }
                    }

                    activeThreadId == null -> {
                        effectScope.launch {
                            delay(RealtimeRefreshDebounceMs)
                            viewModel.refreshInboxThreads()
                        }
                    }
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

@Composable
private fun ActiveThreadPollingEffect(
    selectedThreadId: String?,
    viewModel: MessagesViewModel
) {
    LaunchedEffect(selectedThreadId) {
        val threadId = selectedThreadId ?: return@LaunchedEffect
        while (true) {
            delay(ActiveThreadPollingIntervalMs)
            viewModel.refreshSelectedThread()
        }
    }
}

@Composable
private fun InboxPollingEffect(
    selectedThreadId: String?,
    viewModel: MessagesViewModel
) {
    LaunchedEffect(selectedThreadId) {
        if (selectedThreadId != null) return@LaunchedEffect
        while (true) {
            delay(InboxPollingIntervalMs)
            viewModel.refreshInboxThreads()
        }
    }
}

private fun AppwriteRealtimeEvent.messageThreadId(): String? {
    return stringValue("threadId")
        ?: if (hasPayloadKey("lastMessageText") || hasPayloadKey("lastMessageAt")) {
            stringValue("\$id")
        } else {
            null
        }
}

private fun appwriteImageHeaders(
    context: android.content.Context,
    configuration: AppwriteConfiguration
): Map<String, String> {
    val headers = mutableMapOf(
        "X-Appwrite-Project" to configuration.projectId,
        "X-Appwrite-Response-Format" to "1.8.0"
    )
    val endpointUrl = configuration.endpoint.toHttpUrlOrNull() ?: return headers
    val cookies = PersistentCookieJar(context).loadForRequest(endpointUrl)
    if (cookies.isNotEmpty()) {
        headers["Cookie"] = cookies.joinToString("; ") { cookie -> "${cookie.name}=${cookie.value}" }
    }
    return headers
}

private const val RealtimeRefreshDebounceMs = 180L
private const val ActiveThreadPollingIntervalMs = 2_500L
private const val InboxPollingIntervalMs = 6_000L
