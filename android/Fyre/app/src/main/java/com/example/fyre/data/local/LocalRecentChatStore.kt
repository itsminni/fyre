package com.example.fyre.data.local

import android.content.Context
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageThread
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class LocalRecentChatStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PreferencesName,
        Context.MODE_PRIVATE
    )
    private val gson = Gson()

    fun mergeThreads(currentUserId: String, fetchedThreads: List<MessageThread>): List<MessageThread> {
        val cachedById = threads(currentUserId).associateBy { it.id }
        val mergedById = linkedMapOf<String, MessageThread>()

        fetchedThreads.forEach { fetched ->
            val cached = cachedById[fetched.id]
            mergedById[fetched.id] = cached?.let { mergedThread(incoming = fetched, existing = it) } ?: fetched
        }

        cachedById.values
            .filterNot { mergedById.containsKey(it.id) }
            .forEach { cached -> mergedById[cached.id] = cached }

        val merged = mergedById.values
            .sortedByDescending { it.lastTimestamp }
            .take(MaxThreads)
        saveThreads(currentUserId, merged)
        return merged
    }

    fun threads(currentUserId: String): List<MessageThread> {
        val raw = preferences.getString(threadsKey(currentUserId), null) ?: return emptyList()
        val type = object : TypeToken<List<MessageThread>>() {}.type
        return runCatching {
            gson.fromJson<List<MessageThread>>(raw, type)
        }.getOrNull().orEmpty()
    }

    fun thread(currentUserId: String, threadId: String): MessageThread? {
        return threads(currentUserId).firstOrNull { it.id == threadId || it.backendThreadId == threadId }
    }

    fun upsertThread(currentUserId: String, thread: MessageThread): MessageThread {
        val existing = thread(currentUserId, thread.id)
        val resolved = existing?.let { mergedThread(incoming = thread, existing = it) } ?: thread
        saveThreads(
            currentUserId = currentUserId,
            threads = (threads(currentUserId).filterNot { it.id == resolved.id } + resolved)
                .sortedByDescending { it.lastTimestamp }
                .take(MaxThreads)
        )
        return resolved
    }

    fun removeThread(currentUserId: String, threadId: String) {
        saveThreads(currentUserId, threads(currentUserId).filterNot { it.id == threadId || it.backendThreadId == threadId })
        preferences.edit().remove(messagesKey(currentUserId, threadId)).apply()
    }

    fun mergeMessages(
        currentUserId: String,
        threadId: String,
        fetchedMessages: List<ChatMessage>
    ): List<ChatMessage> {
        if (fetchedMessages.isEmpty()) {
            return messages(currentUserId, threadId)
        }

        val merged = mergeMessageLists(messages(currentUserId, threadId), fetchedMessages)
        saveMessages(currentUserId, threadId, merged)
        return merged
    }

    fun messages(currentUserId: String, threadId: String): List<ChatMessage> {
        val raw = preferences.getString(messagesKey(currentUserId, threadId), null) ?: return emptyList()
        val type = object : TypeToken<List<ChatMessage>>() {}.type
        return runCatching {
            gson.fromJson<List<ChatMessage>>(raw, type)
        }.getOrNull().orEmpty()
    }

    fun upsertMessage(currentUserId: String, message: ChatMessage) {
        val merged = mergeMessageLists(messages(currentUserId, message.threadId), listOf(message))
        saveMessages(currentUserId, message.threadId, merged)
        updateThreadPreview(
            currentUserId = currentUserId,
            threadId = message.threadId,
            preview = messagePreview(message),
            timestamp = message.timestamp
        )
    }

    private fun updateThreadPreview(
        currentUserId: String,
        threadId: String,
        preview: String,
        timestamp: Long
    ) {
        val existing = thread(currentUserId, threadId)
        val resolved = existing?.copy(
            lastMessage = preview,
            lastTimestamp = timestamp
        ) ?: MessageThread(
            id = threadId,
            avatarLabel = "M",
            displayName = "Match",
            lastMessage = preview,
            lastTimestamp = timestamp,
            unreadCount = 0,
            backendThreadId = threadId
        )
        upsertThread(currentUserId, resolved)
    }

    private fun mergeMessageLists(
        cachedMessages: List<ChatMessage>,
        fetchedMessages: List<ChatMessage>
    ): List<ChatMessage> {
        val mergedById = linkedMapOf<String, ChatMessage>()
        (cachedMessages + fetchedMessages).forEach { message ->
            val key = message.backendMessageId ?: message.id
            val existing = mergedById[key]
            mergedById[key] = when {
                existing == null -> message
                existing.syncStatus == message.syncStatus -> message
                message.backendMessageId != null -> message
                else -> existing
            }
        }
        return mergedById.values
            .sortedBy { it.timestamp }
            .takeLast(MaxMessagesPerThread)
    }

    private fun messagePreview(message: ChatMessage): String {
        if (message.text.isNotBlank()) return message.text
        message.voiceNote?.let { return "Messaggio vocale" }
        return message.attachments.firstOrNull()?.displayName ?: "Nuovo messaggio"
    }

    private fun mergedThread(incoming: MessageThread, existing: MessageThread): MessageThread {
        val keepExistingName = isPlaceholderThreadName(incoming.displayName) &&
            !isPlaceholderThreadName(existing.displayName)
        val previewSource = when {
            incoming.lastMessage == "Inizia la conversazione" &&
                existing.lastMessage != incoming.lastMessage -> existing
            existing.lastTimestamp > incoming.lastTimestamp -> existing
            else -> incoming
        }

        return incoming.copy(
            avatarLabel = if (keepExistingName) existing.avatarLabel else incoming.avatarLabel,
            displayName = if (keepExistingName) existing.displayName else incoming.displayName,
            lastMessage = previewSource.lastMessage,
            lastTimestamp = previewSource.lastTimestamp,
            participantsBackendIds = (existing.participantsBackendIds + incoming.participantsBackendIds).distinct(),
            avatarUrl = incoming.avatarUrl ?: existing.avatarUrl,
            isOnline = incoming.isOnline,
            lastSeenAt = incoming.lastSeenAt ?: existing.lastSeenAt,
            currentUserReadAt = incoming.currentUserReadAt ?: existing.currentUserReadAt,
            otherParticipantReadAt = incoming.otherParticipantReadAt ?: existing.otherParticipantReadAt,
            notificationsEnabled = incoming.notificationsEnabled,
            relationshipState = incoming.relationshipState ?: existing.relationshipState
        )
    }

    private fun isPlaceholderThreadName(value: String): Boolean {
        val normalized = value.trim()
        return normalized.isBlank() ||
            normalized.equals("Match", ignoreCase = true) ||
            normalized.equals("Fyre match", ignoreCase = true)
    }

    private fun saveThreads(currentUserId: String, threads: List<MessageThread>) {
        preferences.edit()
            .putString(threadsKey(currentUserId), gson.toJson(threads))
            .apply()
    }

    private fun saveMessages(currentUserId: String, threadId: String, messages: List<ChatMessage>) {
        preferences.edit()
            .putString(messagesKey(currentUserId, threadId), gson.toJson(messages.takeLast(MaxMessagesPerThread)))
            .apply()
    }

    private fun threadsKey(currentUserId: String): String = "threads_${currentUserId.safeKey()}"

    private fun messagesKey(currentUserId: String, threadId: String): String =
        "messages_${currentUserId.safeKey()}_${threadId.safeKey()}"

    private fun String.safeKey(): String = replace(Regex("[^A-Za-z0-9_.-]"), "_")

    private companion object {
        private const val PreferencesName = "fyre_recent_chats"
        private const val MaxThreads = 80
        private const val MaxMessagesPerThread = 200
    }
}
