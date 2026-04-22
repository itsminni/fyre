package com.example.fyre.messages.data

import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageAuthor
import com.example.fyre.messages.model.MessageThread

/**
 * Repository locale in-memory per inbox/chat.
 * Nessun backend: i dati restano mock durante la vita del processo.
 */
object MockMessagesRepository {
    private val threads = mutableListOf<MessageThread>()
    private val messagesByThread = mutableMapOf<String, MutableList<ChatMessage>>()

    init {
        resetLocalState()
    }

    /** Ripristina il seed mock locale (utile anche nei test). */
    fun resetLocalState() {
        val baseNow = System.currentTimeMillis()
        threads.clear()
        threads.addAll(
            listOf(
                MessageThread(
                    id = "thread_p2",
                    avatarLabel = "L",
                    displayName = "Lorenzo",
                    lastMessage = "Ci vediamo dopo lavoro?",
                    lastTimestamp = baseNow - 1000L * 60 * 15,
                    unreadCount = 2
                ),
                MessageThread(
                    id = "thread_p4",
                    avatarLabel = "M",
                    displayName = "Matteo",
                    lastMessage = "Grande! A che ora parti?",
                    lastTimestamp = baseNow - 1000L * 60 * 60 * 3,
                    unreadCount = 0
                ),
                MessageThread(
                    id = "thread_p5",
                    avatarLabel = "E",
                    displayName = "Elena",
                    lastMessage = "Ho preso i biglietti del live",
                    lastTimestamp = baseNow - 1000L * 60 * 60 * 26,
                    unreadCount = 1
                )
            )
        )

        messagesByThread.clear()
        messagesByThread.putAll(
            mapOf(
                "thread_p2" to mutableListOf(
                    ChatMessage("m1", "thread_p2", MessageAuthor.Other, "Ehi! Tutto bene?", baseNow - 1000L * 60 * 60, false),
                    ChatMessage("m2", "thread_p2", MessageAuthor.Me, "Si, tu?", baseNow - 1000L * 60 * 45, true),
                    ChatMessage("m3", "thread_p2", MessageAuthor.Other, "Ci vediamo dopo lavoro?", baseNow - 1000L * 60 * 15, false)
                ),
                "thread_p4" to mutableListOf(
                    ChatMessage("m4", "thread_p4", MessageAuthor.Me, "Domani giro in centro?", baseNow - 1000L * 60 * 60 * 4, true),
                    ChatMessage("m5", "thread_p4", MessageAuthor.Other, "Grande! A che ora parti?", baseNow - 1000L * 60 * 60 * 3, true)
                ),
                "thread_p5" to mutableListOf(
                    ChatMessage("m6", "thread_p5", MessageAuthor.Other, "Ho preso i biglietti del live", baseNow - 1000L * 60 * 60 * 26, false)
                )
            )
        )
    }

    fun getThreads(): List<MessageThread> = threads
        .sortedByDescending { it.lastTimestamp }
        .toList()

    fun getMessages(threadId: String): List<ChatMessage> = messagesByThread[threadId].orEmpty().toList()

    fun ensureThread(threadId: String): MessageThread {
        val existing = threads.firstOrNull { it.id == threadId }
        if (existing != null) return existing

        val suffix = threadId.removePrefix("thread_").uppercase()
        val created = MessageThread(
            id = threadId,
            avatarLabel = suffix.take(1).ifBlank { "?" },
            displayName = "Nuovo match $suffix",
            lastMessage = "Inizia la conversazione",
            lastTimestamp = System.currentTimeMillis(),
            unreadCount = 0
        )
        threads.add(created)
        messagesByThread[threadId] = mutableListOf()
        return created
    }

    fun sendMessage(threadId: String, text: String): ChatMessage {
        ensureThread(threadId)
        val timestamp = System.currentTimeMillis()
        val message = ChatMessage(
            id = "m_$timestamp",
            threadId = threadId,
            author = MessageAuthor.Me,
            text = text,
            timestamp = timestamp,
            isRead = true
        )

        val list = messagesByThread.getOrPut(threadId) { mutableListOf() }
        list.add(message)
        updateThreadPreview(threadId, text, message.timestamp)
        return message
    }

    fun markAsRead(threadId: String) {
        val list = messagesByThread[threadId] ?: return
        messagesByThread[threadId] = list.map { msg ->
            if (msg.author == MessageAuthor.Other) msg.copy(isRead = true) else msg
        }.toMutableList()

        val index = threads.indexOfFirst { it.id == threadId }
        if (index >= 0) {
            threads[index] = threads[index].copy(unreadCount = 0)
        }
    }

    private fun updateThreadPreview(threadId: String, preview: String, timestamp: Long) {
        val index = threads.indexOfFirst { it.id == threadId }
        if (index >= 0) {
            threads[index] = threads[index].copy(
                lastMessage = preview,
                lastTimestamp = timestamp
            )
        }
    }
}



