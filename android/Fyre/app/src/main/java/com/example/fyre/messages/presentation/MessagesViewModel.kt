package com.example.fyre.messages.presentation

import androidx.lifecycle.ViewModel
import com.example.fyre.messages.data.MockMessagesRepository
import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageThread
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MessagesViewModel : ViewModel() {
    private val repository = MockMessagesRepository

    private val _threads = MutableStateFlow<List<MessageThread>>(emptyList())
    val threads: StateFlow<List<MessageThread>> = _threads.asStateFlow()

    private val _selectedThreadId = MutableStateFlow<String?>(null)
    val selectedThreadId: StateFlow<String?> = _selectedThreadId.asStateFlow()

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    private val _replyToMessageId = MutableStateFlow<String?>(null)
    val replyToMessageId: StateFlow<String?> = _replyToMessageId.asStateFlow()

    init {
        refreshThreads()
    }

    fun showInbox() {
        _selectedThreadId.value = null
        _messages.value = emptyList()
        _replyToMessageId.value = null
        refreshThreads()
    }

    fun openThread(threadId: String) {
        repository.ensureThread(threadId)
        repository.markAsRead(threadId)
        _selectedThreadId.value = threadId
        _messages.value = repository.getMessages(threadId)
        refreshThreads()
    }

    fun updateDraft(value: String) {
        _draft.value = value
    }

    fun setReplyToMessage(messageId: String?) {
        _replyToMessageId.value = messageId
    }

    fun sendCurrentMessage() {
        val threadId = _selectedThreadId.value ?: return
        val message = _draft.value.trim()
        if (message.isEmpty()) return

        repository.sendTextMessage(
            threadId = threadId,
            text = message,
            replyToMessageId = _replyToMessageId.value
        )
        _draft.value = ""
        _replyToMessageId.value = null
        _messages.value = repository.getMessages(threadId)
        refreshThreads()
    }

    fun sendMockAttachment(type: AttachmentType) {
        val threadId = _selectedThreadId.value ?: return
        val timestamp = System.currentTimeMillis()

        val (name, uri, mime) = when (type) {
            AttachmentType.Image -> Triple("img_$timestamp.jpg", "local://image/$timestamp", "image/jpeg")
            AttachmentType.Video -> Triple("video_$timestamp.mp4", "local://video/$timestamp", "video/mp4")
            AttachmentType.File -> Triple("doc_$timestamp.pdf", "local://file/$timestamp", "application/pdf")
        }

        repository.sendAttachmentMessage(
            threadId = threadId,
            type = type,
            displayName = name,
            localUri = uri,
            mimeType = mime,
            replyToMessageId = _replyToMessageId.value
        )
        _replyToMessageId.value = null
        _messages.value = repository.getMessages(threadId)
        refreshThreads()
    }

    fun sendVoiceMessage(localPath: String, durationSec: Int) {
        val threadId = _selectedThreadId.value ?: return
        repository.sendVoiceMessage(
            threadId = threadId,
            localPath = localPath,
            durationSec = durationSec,
            replyToMessageId = _replyToMessageId.value
        )
        _replyToMessageId.value = null
        _messages.value = repository.getMessages(threadId)
        refreshThreads()
    }

    private fun refreshThreads() {
        _threads.value = repository.getThreads()
    }
}

