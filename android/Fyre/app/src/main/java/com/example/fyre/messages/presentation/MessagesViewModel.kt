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
import com.example.fyre.messages.model.VoiceNote
import kotlin.math.abs
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
        val immediateThread = _threads.value.firstOrNull {
            it.id == threadId || it.backendThreadId == threadId
        }
        if (immediateThread != null) {
            if (_selectedThreadId.value != immediateThread.id) {
                _messages.value = emptyList()
            }
            _selectedThreadId.value = immediateThread.id
            upsertThread(immediateThread.copy(unreadCount = 0))
        } else {
            val placeholder = MessageThread(
                id = threadId,
                avatarLabel = "M",
                displayName = "Match",
                lastMessage = "Inizia la conversazione",
                lastTimestamp = System.currentTimeMillis(),
                unreadCount = 0,
                backendThreadId = threadId
            )
            _selectedThreadId.value = threadId
            upsertThread(placeholder)
        }

        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            var openedThread: MessageThread? = null
            val ensuredThreadResult = repository.ensureThread(threadId)
            ensuredThreadResult.fold(
                onSuccess = { thread ->
                    openedThread = thread
                    upsertThread(thread)
                    _selectedThreadId.value = thread.id
                },
                onFailure = { throwable ->
                    _errorMessage.value = throwable.message ?: "Impossibile aprire la chat"
                    _isLoading.value = false
                    return@launch
                }
            )

            repository.markAsRead(threadId)
            val messagesResult = repository.getMessages(threadId)
            messagesResult.fold(
                onSuccess = { loadedMessages ->
                    _selectedThreadId.value = openedThread?.id ?: threadId
                    _messages.value = loadedMessages
                    loadedMessages.lastOrNull()?.let(::upsertThreadPreviewFromMessage)
                    _errorMessage.value = null
                },
                onFailure = { throwable ->
                    _selectedThreadId.value = threadId
                    _messages.value = emptyList()
                    _errorMessage.value = throwable.message ?: "Impossibile aprire la chat"
                }
            )
            refreshThreadsInternal()
            openedThread?.let { thread ->
                if (_selectedThreadId.value == thread.id && _threads.value.none { it.id == thread.id }) {
                    upsertThread(thread)
                }
            }
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
        upsertThreadPreviewFromMessage(temporaryMessage)

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
                    upsertThreadPreviewFromMessage(syncedMessage)
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
        upsertThreadPreviewFromMessage(optimistic)
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
                    upsertThreadPreviewFromMessage(syncedMessage)
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
        ).copy(
            voiceNote = VoiceNote(
                localPath = localPath,
                durationSec = durationSec
            )
        )
        appendOptimisticMessage(optimistic)
        upsertThreadPreviewFromMessage(optimistic)
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
                    upsertThreadPreviewFromMessage(syncedMessage)
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

    fun setThreadNotifications(enabled: Boolean) {
        val threadId = _selectedThreadId.value ?: return
        setThreadNotifications(threadId, enabled)
    }

    fun setThreadNotifications(threadId: String, enabled: Boolean) {
        val currentThread = _threads.value.firstOrNull { it.id == threadId } ?: return
        upsertThread(currentThread.copy(notificationsEnabled = enabled))
        _errorMessage.value = null

        viewModelScope.launch {
            repository.setThreadNotifications(threadId, enabled).fold(
                onSuccess = { updatedThread -> upsertThread(updatedThread) },
                onFailure = { throwable ->
                    upsertThread(currentThread)
                    _errorMessage.value = throwable.message ?: "Aggiornamento notifiche chat non riuscito"
                }
            )
        }
    }

    fun markPresence(isOnline: Boolean) {
        viewModelScope.launch {
            repository.markCurrentUserPresence(isOnline)
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }

    fun refreshInboxThreads() {
        viewModelScope.launch {
            refreshThreadsInternal(showErrors = false)
        }
    }

    fun refreshSelectedThread() {
        val threadId = _selectedThreadId.value ?: return
        viewModelScope.launch {
            refreshMessagesInternal(threadId, showErrors = false)
            refreshThreadsInternal(showErrors = false)
        }
    }

    private fun refreshThreads() {
        _isLoading.value = true
        viewModelScope.launch {
            refreshThreadsInternal()
            _isLoading.value = false
        }
    }

    private suspend fun refreshMessagesInternal(
        threadId: String,
        showErrors: Boolean
    ) {
        val messagesResult = repository.getMessages(threadId)
        messagesResult.fold(
            onSuccess = { loadedMessages ->
                if (_selectedThreadId.value != threadId) return
                val mergedMessages = mergeMessagesKeepingLocalPending(loadedMessages)
                _messages.value = mergedMessages
                mergedMessages.lastOrNull()?.let(::upsertThreadPreviewFromMessage)
                repository.markAsRead(threadId)
                if (showErrors) {
                    _errorMessage.value = null
                }
            },
            onFailure = { throwable ->
                if (showErrors) {
                    _errorMessage.value = throwable.message ?: "Impossibile aggiornare la chat"
                }
            }
        )
    }

    private suspend fun refreshThreadsInternal(showErrors: Boolean = true) {
        val result = repository.getThreads()
        result.fold(
            onSuccess = { loadedThreads ->
                val selectedThread = _selectedThreadId.value
                    ?.let { selectedId -> _threads.value.firstOrNull { it.id == selectedId } }
                _threads.value = if (
                    selectedThread != null &&
                    loadedThreads.none { it.id == selectedThread.id }
                ) {
                    listOf(selectedThread) + loadedThreads
                } else {
                    loadedThreads
                }
            },
            onFailure = { throwable ->
                if (showErrors) {
                    _errorMessage.value = throwable.message ?: "Impossibile caricare l'inbox"
                }
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
        ).copy(
            replyPreviewText = replyToMessageId?.let { replyId ->
                _messages.value.firstOrNull { it.id == replyId || it.backendMessageId == replyId }
                    ?.let(::previewForMessage)
            }
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

    private fun mergeMessagesKeepingLocalPending(remoteMessages: List<ChatMessage>): List<ChatMessage> {
        val remoteKeys = remoteMessages.map { it.backendMessageId ?: it.id }.toSet()
        val merged = remoteMessages.toMutableList()

        _messages.value.forEach { localMessage ->
            if (localMessage.syncStatus == MessageSyncStatus.Synced) return@forEach
            val localKey = localMessage.backendMessageId ?: localMessage.id
            if (localKey in remoteKeys) return@forEach

            val hasMatchingRemote = remoteMessages.any { remoteMessage ->
                    remoteMessage.author == localMessage.author &&
                    remoteMessage.text == localMessage.text &&
                    remoteMessage.replyToMessageId == localMessage.replyToMessageId &&
                    remoteMessage.replyPreviewText == localMessage.replyPreviewText &&
                    abs(remoteMessage.timestamp - localMessage.timestamp) < PendingMessageMatchWindowMs
            }
            if (!hasMatchingRemote) {
                merged += localMessage
            }
        }

        return merged.sortedBy { it.timestamp }
    }

    private fun upsertThread(thread: MessageThread) {
        val currentThreads = _threads.value.toMutableList()
        val existingIndex = currentThreads.indexOfFirst { it.id == thread.id }
        if (existingIndex >= 0) {
            currentThreads[existingIndex] = thread
        } else {
            currentThreads.add(0, thread)
        }
        _threads.value = currentThreads.sortedByDescending { it.lastTimestamp }
    }

    private fun upsertThreadPreviewFromMessage(message: ChatMessage) {
        val thread = _threads.value.firstOrNull {
            it.id == message.threadId || it.backendThreadId == message.threadId
        } ?: return

        upsertThread(
            thread.copy(
                lastMessage = previewForMessage(message),
                lastTimestamp = message.timestamp
            )
        )
    }

    private fun previewForMessage(message: ChatMessage): String {
        if (message.text.isNotBlank()) {
            return message.text
        }

        if (message.voiceNote != null) {
            return "Messaggio vocale"
        }

        val attachment = message.attachments.firstOrNull() ?: return "Nuovo messaggio"
        return when (attachment.type) {
            AttachmentType.Image -> "Ha inviato un'immagine"
            AttachmentType.Video -> "Ha inviato un video"
            AttachmentType.File -> attachment.displayName.ifBlank { "Ha inviato un file" }
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

    private companion object {
        private const val PendingMessageMatchWindowMs = 30_000L
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
