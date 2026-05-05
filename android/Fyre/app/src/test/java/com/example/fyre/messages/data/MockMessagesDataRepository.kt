package com.example.fyre.messages.data

import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.RelationshipAction
import com.example.fyre.messages.model.MessageThread

class MockMessagesDataRepository : MessagesRepository {

    override suspend fun getThreads(): Result<List<MessageThread>> {
        return Result.success(MockMessagesRepository.getThreads())
    }

    override suspend fun getMessages(threadId: String): Result<List<ChatMessage>> {
        return Result.success(MockMessagesRepository.getMessages(threadId))
    }

    override suspend fun ensureThread(threadId: String): Result<MessageThread> {
        return Result.success(MockMessagesRepository.ensureThread(threadId))
    }

    override suspend fun sendTextMessage(
        threadId: String,
        text: String,
        replyToMessageId: String?
    ): Result<ChatMessage> {
        return Result.success(
            MockMessagesRepository.sendTextMessage(
                threadId = threadId,
                text = text,
                replyToMessageId = replyToMessageId
            )
        )
    }

    override suspend fun sendAttachmentMessage(
        threadId: String,
        type: AttachmentType,
        displayName: String,
        localUri: String,
        mimeType: String,
        replyToMessageId: String?
    ): Result<ChatMessage> {
        return Result.success(
            MockMessagesRepository.sendAttachmentMessage(
                threadId = threadId,
                type = type,
                displayName = displayName,
                localUri = localUri,
                mimeType = mimeType,
                replyToMessageId = replyToMessageId
            )
        )
    }

    override suspend fun sendVoiceMessage(
        threadId: String,
        localPath: String,
        durationSec: Int,
        replyToMessageId: String?
    ): Result<ChatMessage> {
        return Result.success(
            MockMessagesRepository.sendVoiceMessage(
                threadId = threadId,
                localPath = localPath,
                durationSec = durationSec,
                replyToMessageId = replyToMessageId
            )
        )
    }

    override suspend fun markAsRead(threadId: String): Result<Unit> {
        MockMessagesRepository.markAsRead(threadId)
        return Result.success(Unit)
    }

    override suspend fun setThreadNotifications(threadId: String, enabled: Boolean): Result<MessageThread> {
        return Result.success(MockMessagesRepository.setThreadNotifications(threadId, enabled))
    }

    override suspend fun markCurrentUserPresence(isOnline: Boolean): Result<Unit> {
        return Result.success(Unit)
    }

    override suspend fun updateRelationship(threadId: String, action: RelationshipAction): Result<Unit> {
        MockMessagesRepository.updateRelationship(threadId, action)
        return Result.success(Unit)
    }
}
