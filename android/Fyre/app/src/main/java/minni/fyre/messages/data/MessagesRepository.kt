package minni.fyre.messages.data

import minni.fyre.messages.model.AttachmentType
import minni.fyre.messages.model.ChatMessage
import minni.fyre.messages.model.MessageThread
import minni.fyre.messages.model.RelationshipAction

data class MessagePage(val messages: List<ChatMessage>, val nextCursor: String?)

interface MessagesRepository {
    val uploadProgress: kotlinx.coroutines.flow.Flow<Map<String, Float>>
        get() = kotlinx.coroutines.flow.flowOf(emptyMap())

    fun pendingMessageId(threadId: String, operationId: String): String? = null

    suspend fun sendMessage(request: MessageSendRequest): Result<ChatMessage> = when {
        request.voiceDurationSec != null -> sendVoiceMessage(request.threadId, request.localUri, request.voiceDurationSec, request.replyToMessageId)
        request.attachmentType != null -> sendAttachmentMessage(request.threadId, request.attachmentType, request.displayName, request.localUri, request.mimeType, request.replyToMessageId)
        else -> sendTextMessage(request.threadId, request.text, request.replyToMessageId)
    }

    suspend fun cancelSend(request: MessageSendRequest) {}

    suspend fun getMessagePage(threadId: String, beforeCursor: String? = null): Result<MessagePage> =
        getMessages(threadId).map { all ->
            val end = beforeCursor?.let { cursor -> all.indexOfFirst { it.backendMessageId == cursor || it.id == cursor }.coerceAtLeast(0) } ?: all.size
            val start = (end - 50).coerceAtLeast(0)
            val page = all.subList(start, end)
            MessagePage(page, page.firstOrNull()?.takeIf { start > 0 }?.let { it.backendMessageId ?: it.id })
        }

    suspend fun getThreads(): Result<List<MessageThread>>

    suspend fun getMessages(threadId: String): Result<List<ChatMessage>>

    suspend fun ensureThread(threadId: String): Result<MessageThread>

    suspend fun sendTextMessage(
        threadId: String,
        text: String,
        replyToMessageId: String? = null
    ): Result<ChatMessage>

    suspend fun sendAttachmentMessage(
        threadId: String,
        type: AttachmentType,
        displayName: String,
        localUri: String,
        mimeType: String,
        replyToMessageId: String? = null
    ): Result<ChatMessage>

    suspend fun sendVoiceMessage(
        threadId: String,
        localPath: String,
        durationSec: Int,
        replyToMessageId: String? = null
    ): Result<ChatMessage>

    suspend fun markAsRead(threadId: String): Result<Unit>

    suspend fun setThreadNotifications(threadId: String, enabled: Boolean): Result<MessageThread>

    suspend fun markCurrentUserPresence(isOnline: Boolean): Result<Unit>

    suspend fun updateRelationship(threadId: String, action: RelationshipAction): Result<Unit>
}
