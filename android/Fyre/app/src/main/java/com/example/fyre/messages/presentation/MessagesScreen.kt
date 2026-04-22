package com.example.fyre.messages.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * Entry point della feature Messaggi.
 */
@Composable
fun MessagesScreen(
    openThreadId: String? = null,
    onOpenThread: (String) -> Unit = {},
    onBackToInbox: () -> Unit = {}
) {
    val viewModel: MessagesViewModel = viewModel()
    val threads by viewModel.threads.collectAsState()
    val selectedThreadId by viewModel.selectedThreadId.collectAsState()
    val messages by viewModel.messages.collectAsState()
    val draft by viewModel.draft.collectAsState()
    val replyToMessageId by viewModel.replyToMessageId.collectAsState()

    LaunchedEffect(openThreadId) {
        if (openThreadId.isNullOrBlank()) {
            viewModel.showInbox()
        } else {
            viewModel.openThread(openThreadId)
        }
    }

    if (selectedThreadId == null) {
        MessagesInboxScreen(
            threads = threads,
            onOpenThread = onOpenThread
        )
        return
    }

    val currentThread = threads.firstOrNull { it.id == selectedThreadId }
    if (currentThread == null) {
        MessagesInboxScreen(
            threads = threads,
            onOpenThread = onOpenThread
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
        onSendAttachment = viewModel::sendMockAttachment,
        onSendVoice = viewModel::sendVoiceMessage,
        onBack = onBackToInbox
    )
}
