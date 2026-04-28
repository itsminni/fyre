package com.example.fyre.messages.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.fyre.messages.data.MessagesRepository
import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageAuthor
import com.example.fyre.messages.model.MessageAttachment
import com.example.fyre.messages.model.MessageSyncStatus
import com.example.fyre.messages.model.MessageThread
import com.example.fyre.messages.model.RelationshipAction
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MessagesViewModel(
    private val repository: MessagesRepository
) : ViewModel() {

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

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    init {
        refreshThreads()
    }

    fun showInbox() {
        _selectedThreadId.value = null
        _messages.value = emptyList()
        _replyToMessageId.value = null
        _errorMessage.value = null
        refreshThreads()
    }

    fun openThread(threadId: String) {
        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            repository.ensureThread(threadId)
            repository.markAsRead(threadId)
            val messagesResult = repository.getMessages(threadId)
            messagesResult.fold(
                onSuccess = { loadedMessages ->
                    _selectedThreadId.value = threadId
                    _messages.value = loadedMessages
                    _errorMessage.value = null
                },
                onFailure = { throwable ->
                    _errorMessage.value = throwable.message ?: "Impossibile aprire la chat"
                }
            )
            refreshThreadsInternal()
            _isLoading.value = false
        }
    }

    fun updateDraft(value: String) {
        _draft.value = value
        _errorMessage.value = null
    }

    fun setReplyToMessage(messageId: String?) {
        _replyToMessageId.value = messageId
    }

    fun sendCurrentMessage() {
        val threadId = _selectedThreadId.value ?: return
        val message = _draft.value.trim()
        if (message.isEmpty()) return

        val temporaryMessage = optimisticMessage(
            threadId = threadId,
            text = message,
            replyToMessageId = _replyToMessageId.value
        )
        appendOptimisticMessage(temporaryMessage)

        _draft.value = ""
        _replyToMessageId.value = null
        _isLoading.value = true
        _errorMessage.value = null

        viewModelScope.launch {
            val result = repository.sendTextMessage(
                threadId = threadId,
                text = message,
                replyToMessageId = temporaryMessage.replyToMessageId
            )
            result.fold(
                onSuccess = { syncedMessage ->
                    replaceMessage(temporaryMessage.id, syncedMessage)
                },
                onFailure = { throwable ->
                    markMessageAsFailed(temporaryMessage.id)
                    _errorMessage.value = throwable.message ?: "Invio messaggio non riuscito"
                }
            )
            refreshThreadsInternal()
            _isLoading.value = false
        }
    }

    fun sendAttachment(
        type: AttachmentType,
        displayName: String,
        localUri: String,
        mimeType: String
    ) {
        val threadId = _selectedThreadId.value ?: return
        val optimistic = optimisticMessage(
            threadId = threadId,
            text = "",
            replyToMessageId = _replyToMessageId.value
        ).copy(
            attachments = listOf(
                MessageAttachment(
                    id = "local_attachment_${System.currentTimeMillis()}",
                    type = type,
                    displayName = displayName,
                    localUri = localUri,
                    mimeType = mimeType
                )
            )
        )
        appendOptimisticMessage(optimistic)
        _replyToMessageId.value = null
        _isLoading.value = true
        _errorMessage.value = null

        viewModelScope.launch {
            val result = repository.sendAttachmentMessage(
                threadId = threadId,
                type = type,
                displayName = displayName,
                localUri = localUri,
                mimeType = mimeType,
                replyToMessageId = optimistic.replyToMessageId
            )
            result.fold(
                onSuccess = { syncedMessage ->
                    replaceMessage(optimistic.id, syncedMessage)
                },
                onFailure = { throwable ->
                    markMessageAsFailed(optimistic.id)
                    _errorMessage.value = throwable.message ?: "Invio allegato non riuscito"
                }
            )
            refreshThreadsInternal()
            _isLoading.value = false
        }
    }

    fun sendVoiceMessage(localPath: String, durationSec: Int) {
        val threadId = _selectedThreadId.value ?: return
        val optimistic = optimisticMessage(
            threadId = threadId,
            text = "",
            replyToMessageId = _replyToMessageId.value
        )
        appendOptimisticMessage(optimistic)
        _replyToMessageId.value = null
        _isLoading.value = true
        _errorMessage.value = null

        viewModelScope.launch {
            val result = repository.sendVoiceMessage(
                threadId = threadId,
                localPath = localPath,
                durationSec = durationSec,
                replyToMessageId = optimistic.replyToMessageId
            )
            result.fold(
                onSuccess = { syncedMessage ->
                    replaceMessage(optimistic.id, syncedMessage)
                },
                onFailure = { throwable ->
                    markMessageAsFailed(optimistic.id)
                    _errorMessage.value = throwable.message ?: "Invio vocale non riuscito"
                }
            )
            refreshThreadsInternal()
            _isLoading.value = false
        }
    }

    fun updateRelationship(action: RelationshipAction) {
        val threadId = _selectedThreadId.value ?: return

        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            val result = repository.updateRelationship(threadId, action)
            result.fold(
                onSuccess = {
                    _threads.value = _threads.value.filterNot { it.id == threadId }
                    _selectedThreadId.value = null
                    _messages.value = emptyList()
                    _draft.value = ""
                    _replyToMessageId.value = null
                },
                onFailure = { throwable ->
                    _errorMessage.value = throwable.message ?: "Azione chat non riuscita"
                }
            )
            _isLoading.value = false
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }

    private fun refreshThreads() {
        _isLoading.value = true
        viewModelScope.launch {
            refreshThreadsInternal()
            _isLoading.value = false
        }
    }

    private suspend fun refreshThreadsInternal() {
        val result = repository.getThreads()
        result.fold(
            onSuccess = { loadedThreads ->
                _threads.value = loadedThreads
            },
            onFailure = { throwable ->
                _errorMessage.value = throwable.message ?: "Impossibile caricare l'inbox"
            }
        )
    }

    private fun optimisticMessage(
        threadId: String,
        text: String,
        replyToMessageId: String?
    ): ChatMessage {
        val now = System.currentTimeMillis()
        return ChatMessage(
            id = "local_$now",
            threadId = threadId,
            author = MessageAuthor.Me,
            text = text,
            timestamp = now,
            isRead = false,
            replyToMessageId = replyToMessageId,
            syncStatus = MessageSyncStatus.LocalOnly
        )
    }

    private fun appendOptimisticMessage(message: ChatMessage) {
        _messages.value = _messages.value + message
    }

    private fun replaceMessage(temporaryId: String, syncedMessage: ChatMessage) {
        _messages.value = _messages.value.map { existing ->
            if (existing.id == temporaryId) syncedMessage else existing
        }
    }

    private fun markMessageAsFailed(messageId: String) {
        _messages.value = _messages.value.map { message ->
            if (message.id == messageId) {
                message.copy(syncStatus = MessageSyncStatus.Failed)
            } else {
                message
            }
        }
    }
}

class MessagesViewModelFactory(
    private val repository: MessagesRepository
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(MessagesViewModel::class.java)) {
            return MessagesViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
