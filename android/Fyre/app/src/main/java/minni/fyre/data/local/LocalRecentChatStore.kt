package minni.fyre.data.local

import minni.fyre.messages.model.ChatMessage
import minni.fyre.messages.model.MessageSyncStatus
import minni.fyre.messages.model.MessageThread

internal fun cachedThreadIdsAllowedAfterAuthoritativeFetch(
    cachedThreadIds: Set<String>,
    fetchedThreadIds: Set<String>,
    optimisticPendingThreadIds: Set<String>
): Set<String> {
    return (cachedThreadIds - fetchedThreadIds).intersect(optimisticPendingThreadIds)
}

internal fun cachedMessageIdsAllowedAfterAuthoritativeFetch(
    cachedMessageIds: Set<String>,
    fetchedMessageIds: Set<String>,
    optimisticPendingMessageIds: Set<String>
): Set<String> {
    return cachedMessageIds.intersect(fetchedMessageIds) +
        (cachedMessageIds - fetchedMessageIds).intersect(optimisticPendingMessageIds)
}

internal class AccountScopedMemoryStore<T> {
    private val lock = Any()
    private val valuesByAccount = mutableMapOf<String, MutableMap<String, T>>()

    fun get(accountId: String, key: String): T? = synchronized(lock) {
        valuesByAccount[accountId.trim()]?.get(key)
    }

    fun put(accountId: String, key: String, value: T) {
        val normalizedAccountId = accountId.trim()
        if (normalizedAccountId.isBlank()) return
        synchronized(lock) {
            valuesByAccount.getOrPut(normalizedAccountId) { linkedMapOf() }[key] = value
        }
    }

    fun remove(accountId: String, key: String) {
        synchronized(lock) {
            val normalizedAccountId = accountId.trim()
            val accountValues = valuesByAccount[normalizedAccountId] ?: return@synchronized
            accountValues.remove(key)
            if (accountValues.isEmpty()) {
                valuesByAccount.remove(normalizedAccountId)
            }
        }
    }

    fun clearAccount(accountId: String) {
        val normalizedAccountId = accountId.trim()
        if (normalizedAccountId.isBlank()) return
        synchronized(lock) {
            valuesByAccount.remove(normalizedAccountId)
        }
    }

    fun clearAll() {
        synchronized(lock) {
            valuesByAccount.clear()
        }
    }
}

class LocalRecentChatStore {
    fun mergeThreads(currentUserId: String, fetchedThreads: List<MessageThread>): List<MessageThread> {
        val cachedById = threads(currentUserId).associateBy { it.id }
        val mergedById = linkedMapOf<String, MessageThread>()
        val fetchedThreadIds = fetchedThreads.mapTo(mutableSetOf()) { thread -> thread.id }
        val optimisticPendingThreadIds = cachedById.keys.filterTo(mutableSetOf()) { threadId ->
            messages(currentUserId, threadId).any { message ->
                message.syncStatus == MessageSyncStatus.LocalOnly
            }
        }
        val retainedCachedThreadIds = cachedThreadIdsAllowedAfterAuthoritativeFetch(
            cachedThreadIds = cachedById.keys,
            fetchedThreadIds = fetchedThreadIds,
            optimisticPendingThreadIds = optimisticPendingThreadIds
        )

        fetchedThreads.forEach { fetched ->
            val cached = cachedById[fetched.id]
            mergedById[fetched.id] = cached?.let { mergedThread(incoming = fetched, existing = it) } ?: fetched
        }

        cachedById.values
            .filter { cached -> cached.id in retainedCachedThreadIds }
            .forEach { cached -> mergedById[cached.id] = cached }

        (cachedById.keys - fetchedThreadIds - retainedCachedThreadIds).forEach { revokedThreadId ->
            MessagesByAccount.remove(currentUserId, revokedThreadId)
        }

        val merged = mergedById.values
            .sortedByDescending { it.lastTimestamp }
            .take(MaxThreads)
        saveThreads(currentUserId, merged)
        return merged
    }

    fun threads(currentUserId: String): List<MessageThread> {
        return ThreadsByAccount.get(currentUserId, ThreadsEntryKey).orEmpty()
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
        MessagesByAccount.remove(currentUserId, threadId)
    }

    fun clearAccount(currentUserId: String): Boolean {
        ThreadsByAccount.clearAccount(currentUserId)
        MessagesByAccount.clearAccount(currentUserId)
        return true
    }

    fun clearAll(): Boolean {
        ThreadsByAccount.clearAll()
        MessagesByAccount.clearAll()
        return true
    }

    fun mergeMessages(
        currentUserId: String,
        threadId: String,
        fetchedMessages: List<ChatMessage>
    ): List<ChatMessage> {
        val cachedMessages = messages(currentUserId, threadId)
        val fetchedMessageIds = fetchedMessages.mapTo(mutableSetOf()) { message -> message.cacheKey() }
        val optimisticMessageIds = cachedMessages
            .filter { message ->
                message.syncStatus == MessageSyncStatus.LocalOnly && message.backendMessageId == null
            }
            .mapTo(mutableSetOf()) { message -> message.cacheKey() }
        val retainedMessageIds = cachedMessageIdsAllowedAfterAuthoritativeFetch(
            cachedMessageIds = cachedMessages.mapTo(mutableSetOf()) { message -> message.cacheKey() },
            fetchedMessageIds = fetchedMessageIds,
            optimisticPendingMessageIds = optimisticMessageIds
        )
        val retainedCachedMessages = cachedMessages.filter { message ->
            message.cacheKey() in retainedMessageIds
        }
        val merged = mergeMessageLists(retainedCachedMessages, fetchedMessages)
        saveMessages(currentUserId, threadId, merged)
        return merged
    }

    fun messages(currentUserId: String, threadId: String): List<ChatMessage> {
        return MessagesByAccount.get(currentUserId, threadId).orEmpty()
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
            val key = message.cacheKey()
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

    private fun ChatMessage.cacheKey(): String = backendMessageId ?: id

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
            normalized.equals("Match", ignoreCase = true)
    }

    private fun saveThreads(currentUserId: String, threads: List<MessageThread>) {
        ThreadsByAccount.put(currentUserId, ThreadsEntryKey, threads.toList())
    }

    private fun saveMessages(currentUserId: String, threadId: String, messages: List<ChatMessage>) {
        MessagesByAccount.put(
            currentUserId,
            threadId,
            messages.takeLast(MaxMessagesPerThread)
        )
    }

    private companion object {
        private const val ThreadsEntryKey = "threads"
        private const val MaxThreads = 80
        private const val MaxMessagesPerThread = 200
        private val ThreadsByAccount = AccountScopedMemoryStore<List<MessageThread>>()
        private val MessagesByAccount = AccountScopedMemoryStore<List<ChatMessage>>()
    }
}
