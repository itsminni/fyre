package com.example.fyre.messages.presentation

import androidx.compose.runtime.Composable
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
import com.example.fyre.data.AppGraphProvider

/**
 * Entry point della feature Messaggi.
 */
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

    LaunchedEffect(openThreadId) {
        if (openThreadId.isNullOrBlank()) {
            viewModel.showInbox()
        } else {
            viewModel.openThread(openThreadId)
        }
    }

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
        onDraftChange = viewModel::updateDraft,
        onSend = viewModel::sendCurrentMessage,
        onReply = { messageId -> viewModel.setReplyToMessage(messageId) },
        onCancelReply = { viewModel.setReplyToMessage(null) },
        onSendAttachment = viewModel::sendAttachment,
        onSendVoice = viewModel::sendVoiceMessage,
        compactBubbles = chatSettings.compactBubbles,
        showTimestamps = chatSettings.showTimestamps,
        onBack = onBackToInbox
    )
}
