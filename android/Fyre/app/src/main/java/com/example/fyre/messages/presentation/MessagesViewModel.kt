package com.example.fyre.messages.presentation

import androidx.lifecycle.ViewModel
import com.example.fyre.messages.data.MockMessagesRepository
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

    init {
        refreshThreads()
    }

    fun showInbox() {
        _selectedThreadId.value = null
        _messages.value = emptyList()
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

    fun sendCurrentMessage() {
        val threadId = _selectedThreadId.value ?: return
        val message = _draft.value.trim()
        if (message.isEmpty()) return

        repository.sendMessage(threadId, message)
        _draft.value = ""
        _messages.value = repository.getMessages(threadId)
        refreshThreads()
    }

    private fun refreshThreads() {
        _threads.value = repository.getThreads()
    }
}

