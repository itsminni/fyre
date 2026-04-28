package com.example.fyre.messages.data

import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteConfigurationException
import com.example.fyre.data.appwrite.AppwriteGateway
import com.example.fyre.data.appwrite.arrayOrEmpty
import com.example.fyre.data.appwrite.booleanOrNull
import com.example.fyre.data.appwrite.intOrNull
import com.example.fyre.data.appwrite.stringOrNull
import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageAttachment
import com.example.fyre.messages.model.MessageAuthor
import com.example.fyre.messages.model.MessageSyncStatus
import com.example.fyre.messages.model.MessageThread
import com.example.fyre.messages.model.RelationshipAction
import com.example.fyre.messages.model.VoiceNote
import com.google.gson.JsonObject

class AppwriteMessagesRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration
) : MessagesRepository {

    override suspend fun getThreads(): Result<List<MessageThread>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val participantRows = gateway.listRows(
                tableId = configuration.threadParticipantsTableId,
                queries = listOf(gateway.queryEqual("userId", listOf(currentUserId)))
            )

            val items = mutableListOf<MessageThread>()
            for (participantRow in participantRows) {
                val threadId = participantRow.stringOrNull("threadId") ?: continue
                val thread = fetchThreadPreview(threadId, currentUserId) ?: continue
                items += thread
            }

            items.sortedByDescending { it.lastTimestamp }
        }
    }

    override suspend fun getMessages(threadId: String): Result<List<ChatMessage>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val participantRows = gateway.listRows(
                tableId = configuration.threadParticipantsTableId,
                queries = listOf(gateway.queryEqual("threadId", listOf(threadId)))
            )
            val otherReadAt = participantRows
                .filter { row -> row.stringOrNull("userId") != currentUserId }
                .mapNotNull { row -> parseTimestamp(row.stringOrNull("lastReadAt")) }
                .maxOrNull()

            val rows = gateway.listRows(
                tableId = configuration.messagesTableId,
                queries = listOf(
                    gateway.queryEqual("threadId", listOf(threadId)),
                    gateway.queryOrderAsc("createdAt")
                )
            )

            val mapped = rows.mapNotNull { row ->
                mapRowToMessage(
                    row = row,
                    currentUserId = currentUserId,
                    threadId = threadId,
                    otherReadAt = otherReadAt
                )
            }

            markAsRead(threadId)
            mapped
        }
    }

    override suspend fun ensureThread(threadId: String): Result<MessageThread> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = false)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            fetchThreadPreview(threadId, currentUserId)
                ?: throw AppwriteConfigurationException("Thread non trovato nel database")
        }
    }

    override suspend fun sendTextMessage(
        threadId: String,
        text: String,
        replyToMessageId: String?
    ): Result<ChatMessage> {
        return runCatching {
            val trimmed = text.trim()
            if (trimmed.isBlank()) {
                throw AppwriteConfigurationException("Il messaggio non puo essere vuoto")
            }

            val payload = mutableMapOf<String, Any?>(
                "threadId" to threadId,
                "text" to trimmed
            )
            if (!replyToMessageId.isNullOrBlank()) {
                payload["replyToMessageId"] = replyToMessageId
            }

            val response = gateway.executeFunction(
                functionId = configuration.sendMessageFunctionId,
                payload = payload
            )

            mapOutgoingResponse(
                threadId = threadId,
                response = response,
                fallbackText = trimmed,
                replyToMessageId = replyToMessageId
            )
        }
    }

    override suspend fun sendAttachmentMessage(
        threadId: String,
        type: AttachmentType,
        displayName: String,
        localUri: String,
        mimeType: String,
        replyToMessageId: String?
    ): Result<ChatMessage> {
        return runCatching {
            val uploaded = gateway.uploadChatAttachment(
                threadId = threadId,
                displayName = displayName,
                localUri = localUri,
                mimeType = mimeType
            )

            val messageType = when (type) {
                AttachmentType.Image -> "image"
                AttachmentType.Video -> "video"
                AttachmentType.File -> "file"
            }

            val payload = mutableMapOf<String, Any?>(
                "threadId" to threadId,
                "text" to "",
                "messageType" to messageType,
                "attachmentFileId" to uploaded.fileId,
                "attachmentName" to uploaded.fileName,
                "attachmentMimeType" to uploaded.mimeType,
                "attachmentSize" to uploaded.sizeBytes
            )
            if (!replyToMessageId.isNullOrBlank()) {
                payload["replyToMessageId"] = replyToMessageId
            }

            val response = gateway.executeFunction(
                functionId = configuration.sendMessageFunctionId,
                payload = payload
            )

            mapOutgoingResponse(
                threadId = threadId,
                response = response,
                fallbackText = "",
                replyToMessageId = replyToMessageId,
                uploadedAttachment = UploadedAttachmentPayload(
                    fileId = uploaded.fileId,
                    name = uploaded.fileName,
                    mimeType = uploaded.mimeType,
                    type = type,
                    durationSec = null
                )
            )
        }
    }

    override suspend fun sendVoiceMessage(
        threadId: String,
        localPath: String,
        durationSec: Int,
        replyToMessageId: String?
    ): Result<ChatMessage> {
        return runCatching {
            val uploaded = gateway.uploadChatAttachment(
                threadId = threadId,
                displayName = "voice_${System.currentTimeMillis()}.m4a",
                localUri = localPath,
                mimeType = "audio/mp4"
            )

            val payload = mutableMapOf<String, Any?>(
                "threadId" to threadId,
                "text" to "",
                "messageType" to "audio",
                "attachmentFileId" to uploaded.fileId,
                "attachmentName" to uploaded.fileName,
                "attachmentMimeType" to uploaded.mimeType,
                "attachmentSize" to uploaded.sizeBytes,
                "attachmentDuration" to durationSec
            )
            if (!replyToMessageId.isNullOrBlank()) {
                payload["replyToMessageId"] = replyToMessageId
            }

            val response = gateway.executeFunction(
                functionId = configuration.sendMessageFunctionId,
                payload = payload
            )

            mapOutgoingResponse(
                threadId = threadId,
                response = response,
                fallbackText = "",
                replyToMessageId = replyToMessageId,
                uploadedAttachment = UploadedAttachmentPayload(
                    fileId = uploaded.fileId,
                    name = uploaded.fileName,
                    mimeType = uploaded.mimeType,
                    type = AttachmentType.File,
                    durationSec = durationSec
                ),
                forceVoice = true
            )
        }
    }

    override suspend fun markAsRead(threadId: String): Result<Unit> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val participants = gateway.listRows(
                tableId = configuration.threadParticipantsTableId,
                queries = listOf(
                    gateway.queryEqual("threadId", listOf(threadId)),
                    gateway.queryEqual("userId", listOf(currentUserId))
                )
            )

            val row = participants.firstOrNull() ?: return@runCatching
            val rowId = row.stringOrNull("\$id") ?: return@runCatching

            gateway.updateRow(
                tableId = configuration.threadParticipantsTableId,
                rowId = rowId,
                data = JsonObject().apply {
                    addProperty("threadId", threadId)
                    addProperty("userId", currentUserId)
                    addProperty("role", row.stringOrNull("role") ?: "participant")
                    addProperty("lastReadAt", gateway.nowIso())
                    addProperty("muted", row.booleanOrNull("muted") ?: false)
                    addProperty("pinned", row.booleanOrNull("pinned") ?: false)
                    addProperty("notificationsEnabled", row.booleanOrNull("notificationsEnabled") ?: true)
                }
            )
        }
    }

    override suspend fun updateRelationship(threadId: String, action: RelationshipAction): Result<Unit> {
        return runCatching {
            val functionId = configuration.manageRelationshipFunctionId
                ?: throw AppwriteConfigurationException("Funzione relazione Appwrite non configurata")

            gateway.executeFunction(
                functionId = functionId,
                payload = mapOf(
                    "threadId" to threadId,
                    "action" to action.apiValue
                )
            )
            Unit
        }
    }

    private suspend fun fetchThreadPreview(threadId: String, currentUserId: String): MessageThread? {
        val threadRow = gateway.getRowIfAccessible(configuration.threadsTableId, threadId) ?: return null

        val participantRows = gateway.listRows(
            tableId = configuration.threadParticipantsTableId,
            queries = listOf(gateway.queryEqual("threadId", listOf(threadId)))
        )

        val participantUserIds = participantRows.mapNotNull { it.stringOrNull("userId") }
        val otherUserId = participantUserIds.firstOrNull { it != currentUserId }
        val profileRow = otherUserId?.let { gateway.fetchProfileRow(it) }

        val displayName = resolveDisplayName(
            firstName = profileRow?.stringOrNull("firstName"),
            lastName = profileRow?.stringOrNull("lastName"),
            email = profileRow?.stringOrNull("email"),
            fallback = threadRow.stringOrNull("subject") ?: "Match"
        )

        val messageRows = gateway.listRows(
            tableId = configuration.messagesTableId,
            queries = listOf(
                gateway.queryEqual("threadId", listOf(threadId)),
                gateway.queryOrderAsc("createdAt")
            )
        )

        val readAt = participantRows.firstOrNull { it.stringOrNull("userId") == currentUserId }
            ?.stringOrNull("lastReadAt")
            ?.let(::parseTimestamp)
            ?: 0L

        val unreadCount = messageRows.count { row ->
            val senderId = row.stringOrNull("senderUserId")
            val createdAt = parseTimestamp(row.stringOrNull("createdAt")) ?: 0L
            senderId != currentUserId && createdAt > readAt
        }

        val lastMessage = threadRow.stringOrNull("lastMessageText")
            ?: messageRows.lastOrNull()?.let { row ->
                when (row.stringOrNull("messageType")) {
                    "image" -> "Ha inviato un'immagine"
                    "video" -> "Ha inviato un video"
                    "audio" -> "Messaggio vocale"
                    else -> row.stringOrNull("text") ?: row.stringOrNull("attachmentName") ?: "Nuovo messaggio"
                }
            }
            ?: "Inizia la conversazione"

        val lastTimestamp = parseTimestamp(threadRow.stringOrNull("lastMessageAt"))
            ?: parseTimestamp(threadRow.stringOrNull("\$updatedAt"))
            ?: parseTimestamp(threadRow.stringOrNull("\$createdAt"))
            ?: System.currentTimeMillis()

        return MessageThread(
            id = threadId,
            avatarLabel = displayName.firstOrNull()?.uppercase() ?: "?",
            displayName = displayName,
            lastMessage = lastMessage,
            lastTimestamp = lastTimestamp,
            unreadCount = unreadCount,
            backendThreadId = threadId,
            participantsBackendIds = participantUserIds
        )
    }

    private fun mapRowToMessage(
        row: JsonObject,
        currentUserId: String,
        threadId: String,
        otherReadAt: Long?
    ): ChatMessage? {
        val messageId = row.stringOrNull("\$id") ?: return null
        val senderId = row.stringOrNull("senderUserId")
        val messageType = row.stringOrNull("messageType") ?: "text"
        val attachmentFileId = row.stringOrNull("attachmentFileId")
        val attachmentName = row.stringOrNull("attachmentName") ?: "allegato"
        val attachmentMimeType = row.stringOrNull("attachmentMimeType") ?: "application/octet-stream"

        val attachments = mutableListOf<MessageAttachment>()
        var voiceNote: VoiceNote? = null

        if (!attachmentFileId.isNullOrBlank()) {
            val url = gateway.attachmentUrl(attachmentFileId)
            if (messageType == "audio" || attachmentMimeType.startsWith("audio/")) {
                voiceNote = VoiceNote(
                    localPath = url ?: attachmentName,
                    durationSec = row.intOrNull("attachmentDuration") ?: 0,
                    backendUrl = url
                )
            } else {
                attachments += MessageAttachment(
                    id = attachmentFileId,
                    type = when {
                        messageType == "image" || attachmentMimeType.startsWith("image/") -> AttachmentType.Image
                        messageType == "video" || attachmentMimeType.startsWith("video/") -> AttachmentType.Video
                        else -> AttachmentType.File
                    },
                    displayName = attachmentName,
                    localUri = url ?: attachmentName,
                    mimeType = attachmentMimeType,
                    backendUrl = url
                )
            }
        }

        val timestamp = parseTimestamp(row.stringOrNull("createdAt"))
            ?: parseTimestamp(row.stringOrNull("\$createdAt"))
            ?: System.currentTimeMillis()
        val isMine = senderId == currentUserId

        return ChatMessage(
            id = messageId,
            threadId = threadId,
            author = if (isMine) MessageAuthor.Me else MessageAuthor.Other,
            text = row.stringOrNull("text") ?: "",
            timestamp = timestamp,
            isRead = if (isMine) otherReadAt != null && timestamp <= otherReadAt else true,
            replyToMessageId = row.stringOrNull("replyToMessageId"),
            attachments = attachments,
            voiceNote = voiceNote,
            backendMessageId = messageId,
            syncStatus = MessageSyncStatus.Synced
        )
    }

    private fun mapOutgoingResponse(
        threadId: String,
        response: JsonObject,
        fallbackText: String,
        replyToMessageId: String?,
        uploadedAttachment: UploadedAttachmentPayload? = null,
        forceVoice: Boolean = false
    ): ChatMessage {
        val messageId = response.stringOrNull("messageId") ?: gateway.randomIdentifier()
        val messageType = response.stringOrNull("messageType")
            ?: if (forceVoice) "audio" else uploadedAttachment?.let { mapAttachmentType(it.type) }
            ?: "text"

        val attachments = mutableListOf<MessageAttachment>()
        var voiceNote: VoiceNote? = null

        if (uploadedAttachment != null) {
            val url = gateway.attachmentUrl(uploadedAttachment.fileId)
            if (forceVoice || messageType == "audio") {
                voiceNote = VoiceNote(
                    localPath = url ?: uploadedAttachment.name,
                    durationSec = uploadedAttachment.durationSec ?: 0,
                    backendUrl = url
                )
            } else {
                attachments += MessageAttachment(
                    id = uploadedAttachment.fileId,
                    type = uploadedAttachment.type,
                    displayName = uploadedAttachment.name,
                    localUri = url ?: uploadedAttachment.name,
                    mimeType = uploadedAttachment.mimeType,
                    backendUrl = url
                )
            }
        }

        return ChatMessage(
            id = messageId,
            threadId = threadId,
            author = MessageAuthor.Me,
            text = response.stringOrNull("text") ?: fallbackText,
            timestamp = parseTimestamp(response.stringOrNull("createdAt"))
                ?: System.currentTimeMillis(),
            isRead = false,
            replyToMessageId = response.stringOrNull("replyToMessageId") ?: replyToMessageId,
            attachments = attachments,
            voiceNote = voiceNote,
            backendMessageId = messageId,
            syncStatus = MessageSyncStatus.Synced
        )
    }

    private fun mapAttachmentType(type: AttachmentType): String {
        return when (type) {
            AttachmentType.Image -> "image"
            AttachmentType.Video -> "video"
            AttachmentType.File -> "file"
        }
    }

    private fun parseTimestamp(raw: String?): Long? {
        if (raw.isNullOrBlank()) return null
        return runCatching { java.time.Instant.parse(raw).toEpochMilli() }.getOrNull()
    }

    private fun resolveDisplayName(
        firstName: String?,
        lastName: String?,
        email: String?,
        fallback: String
    ): String {
        val fullName = listOfNotNull(firstName, lastName)
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .joinToString(" ")

        if (fullName.isNotBlank()) {
            return fullName
        }

        val emailPrefix = email?.substringBefore("@")?.trim()
        if (!emailPrefix.isNullOrBlank()) {
            return emailPrefix
        }

        return fallback
    }

    private data class UploadedAttachmentPayload(
        val fileId: String,
        val name: String,
        val mimeType: String,
        val type: AttachmentType,
        val durationSec: Int?
    )
}
