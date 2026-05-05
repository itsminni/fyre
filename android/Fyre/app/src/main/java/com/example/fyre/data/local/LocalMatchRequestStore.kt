package com.example.fyre.data.local

import android.content.Context
import com.example.fyre.messages.model.AttachmentType
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.security.MessageDigest

class LocalMatchRequestStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PreferencesName,
        Context.MODE_PRIVATE
    )
    private val gson = Gson()

    fun dismissedProfileIds(): Set<String> {
        return preferences.getStringSet(DismissedProfilesKey, emptySet()).orEmpty().toSet()
    }

    fun markProfileDismissed(profileId: String) {
        val normalized = profileId.trim()
        if (normalized.isBlank()) return

        val next = dismissedProfileIds() + normalized
        preferences.edit()
            .putStringSet(DismissedProfilesKey, next)
            .apply()
    }

    fun upsertRequestThread(
        profileId: String,
        displayName: String,
        remoteThreadId: String? = null,
        matched: Boolean = false
    ): LocalRequestThread {
        markProfileDismissed(profileId)

        val threadId = threadIdForProfile(profileId)
        val existing = requestThread(threadId)
        val now = System.currentTimeMillis()
        val name = displayName.trim().ifBlank { existing?.displayName ?: "Match" }
        val thread = LocalRequestThread(
            threadId = threadId,
            profileId = profileId,
            displayName = name,
            avatarLabel = existing?.avatarLabel ?: name.firstOrNull()?.uppercase() ?: "M",
            createdAt = existing?.createdAt ?: now,
            lastMessage = existing?.lastMessage ?: "Richiesta inviata",
            lastTimestamp = existing?.lastTimestamp ?: now,
            remoteThreadId = remoteThreadId,
            matched = matched
        )

        val next = requestThreads()
            .filterNot { it.threadId == thread.threadId || it.profileId == profileId }
            .plus(thread)
        saveRequestThreads(next)
        return thread
    }

    fun isLocalThreadId(threadId: String): Boolean {
        return threadId.startsWith(LocalThreadPrefix)
    }

    fun requestThreads(): List<LocalRequestThread> {
        val raw = preferences.getString(RequestThreadsKey, null) ?: return emptyList()
        val type = object : TypeToken<List<LocalRequestThread>>() {}.type
        return runCatching {
            gson.fromJson<List<LocalRequestThread>>(raw, type)
        }.getOrNull().orEmpty()
    }

    fun requestThread(threadId: String): LocalRequestThread? {
        return requestThreads().firstOrNull { it.threadId == threadId || it.remoteThreadId == threadId }
    }

    fun removeRequestThread(threadId: String) {
        saveRequestThreads(requestThreads().filterNot { it.threadId == threadId || it.remoteThreadId == threadId })
        preferences.edit().remove(messagesKey(threadId)).apply()
    }

    fun messages(threadId: String): List<LocalRequestMessage> {
        val raw = preferences.getString(messagesKey(threadId), null) ?: return emptyList()
        val type = object : TypeToken<List<LocalRequestMessage>>() {}.type
        return runCatching {
            gson.fromJson<List<LocalRequestMessage>>(raw, type)
        }.getOrNull().orEmpty()
    }

    fun addTextMessage(threadId: String, text: String, replyToMessageId: String?): LocalRequestMessage {
        val now = System.currentTimeMillis()
        val message = LocalRequestMessage(
            id = "local_msg_$now",
            threadId = threadId,
            text = text,
            timestamp = now,
            replyToMessageId = replyToMessageId
        )
        appendMessage(threadId, message, text.ifBlank { "Messaggio" }, now)
        return message
    }

    fun addAttachmentMessage(
        threadId: String,
        type: AttachmentType,
        displayName: String,
        localUri: String,
        mimeType: String,
        replyToMessageId: String?
    ): LocalRequestMessage {
        val now = System.currentTimeMillis()
        val message = LocalRequestMessage(
            id = "local_msg_$now",
            threadId = threadId,
            text = "",
            timestamp = now,
            replyToMessageId = replyToMessageId,
            attachmentType = type.name,
            attachmentName = displayName,
            attachmentUri = localUri,
            attachmentMimeType = mimeType
        )
        appendMessage(threadId, message, displayName.ifBlank { "Allegato" }, now)
        return message
    }

    fun addVoiceMessage(
        threadId: String,
        localPath: String,
        durationSec: Int,
        replyToMessageId: String?
    ): LocalRequestMessage {
        val now = System.currentTimeMillis()
        val message = LocalRequestMessage(
            id = "local_msg_$now",
            threadId = threadId,
            text = "",
            timestamp = now,
            replyToMessageId = replyToMessageId,
            voicePath = localPath,
            voiceDurationSec = durationSec
        )
        appendMessage(threadId, message, "Messaggio vocale", now)
        return message
    }

    private fun appendMessage(
        threadId: String,
        message: LocalRequestMessage,
        preview: String,
        timestamp: Long
    ) {
        saveMessages(threadId, messages(threadId) + message)
        saveRequestThreads(
            requestThreads().map { thread ->
                if (thread.threadId == threadId || thread.remoteThreadId == threadId) {
                    thread.copy(lastMessage = preview, lastTimestamp = timestamp)
                } else {
                    thread
                }
            }
        )
    }

    private fun saveRequestThreads(threads: List<LocalRequestThread>) {
        preferences.edit()
            .putString(RequestThreadsKey, gson.toJson(threads))
            .apply()
    }

    private fun saveMessages(threadId: String, messages: List<LocalRequestMessage>) {
        preferences.edit()
            .putString(messagesKey(threadId), gson.toJson(messages))
            .apply()
    }

    private fun threadIdForProfile(profileId: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(profileId.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
            .take(32)
        return "$LocalThreadPrefix$digest"
    }

    private fun messagesKey(threadId: String): String = "$MessagesPrefix$threadId"

    private companion object {
        private const val PreferencesName = "fyre_local_match_requests"
        private const val DismissedProfilesKey = "dismissed_profile_ids"
        private const val RequestThreadsKey = "request_threads"
        private const val LocalThreadPrefix = "local_request_"
        private const val MessagesPrefix = "messages_"
    }
}

data class LocalRequestThread(
    val threadId: String,
    val profileId: String,
    val displayName: String,
    val avatarLabel: String,
    val createdAt: Long,
    val lastMessage: String,
    val lastTimestamp: Long,
    val remoteThreadId: String?,
    val matched: Boolean
)

data class LocalRequestMessage(
    val id: String,
    val threadId: String,
    val text: String,
    val timestamp: Long,
    val replyToMessageId: String?,
    val attachmentType: String? = null,
    val attachmentName: String? = null,
    val attachmentUri: String? = null,
    val attachmentMimeType: String? = null,
    val voicePath: String? = null,
    val voiceDurationSec: Int? = null
)
