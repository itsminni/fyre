package com.example.fyre.messages.data

import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageThread
import com.example.fyre.messages.model.RelationshipAction

interface MessagesRepository {
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

    suspend fun updateRelationship(threadId: String, action: RelationshipAction): Result<Unit>
}
