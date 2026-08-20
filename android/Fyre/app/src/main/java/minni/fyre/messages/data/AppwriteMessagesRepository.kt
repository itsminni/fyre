package minni.fyre.messages.data

import minni.fyre.data.appwrite.AppwriteConfiguration
import minni.fyre.data.appwrite.AppwriteConfigurationException
import minni.fyre.data.appwrite.AppwriteApiException
import minni.fyre.data.appwrite.AppwriteGateway
import minni.fyre.data.appwrite.ManageProfilePayload
import minni.fyre.data.appwrite.booleanOrNull
import minni.fyre.data.appwrite.intOrNull
import minni.fyre.data.appwrite.stringOrNull
import minni.fyre.data.appwrite.tokenizedFileViewUrl
import minni.fyre.data.local.LocalRecentChatStore
import minni.fyre.messages.model.AttachmentType
import minni.fyre.messages.model.ChatMessage
import minni.fyre.messages.model.MessageAttachment
import minni.fyre.messages.model.MessageAuthor
import minni.fyre.messages.model.MessageSyncStatus
import minni.fyre.messages.model.MessageThread
import minni.fyre.messages.model.RelationshipAction
import minni.fyre.messages.model.VoiceNote
import com.google.gson.JsonObject
import kotlinx.coroutines.delay

class AppwriteMessagesRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration,
    private val localRecentChatStore: LocalRecentChatStore
) : MessagesRepository {

    override suspend fun getThreads(): Result<List<MessageThread>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = false)
                ?: return@runCatching emptyList<MessageThread>().also {
                    localRecentChatStore.clearAll()
                }

            try {
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

                localRecentChatStore.mergeThreads(
                    currentUserId = currentUserId,
                    fetchedThreads = items.sortedByDescending { it.lastTimestamp }
                )
            } catch (api: AppwriteApiException) {
                if (api.statusCode == 401 || api.statusCode == 403 || api.statusCode == 404) {
                    localRecentChatStore.clearAccount(currentUserId)
                    emptyList()
                } else {
                    localRecentChatStore.threads(currentUserId)
                        .takeIf { it.isNotEmpty() }
                        ?: throw api
                }
            } catch (throwable: Throwable) {
                localRecentChatStore.threads(currentUserId).takeIf { it.isNotEmpty() } ?: throw throwable
            }
        }
    }

    override suspend fun getMessages(threadId: String): Result<List<ChatMessage>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = false)
                ?: return@runCatching emptyList<ChatMessage>().also {
                    localRecentChatStore.clearAll()
                }

            try {
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

                val replyLookup = rows.mapNotNull { row ->
                    val id = row.stringOrNull("\$id") ?: return@mapNotNull null
                    id to previewTextForRow(row)
                }.toMap()

                val mapped = rows.mapNotNull { row ->
                    mapRowToMessage(
                        row = row,
                        currentUserId = currentUserId,
                        threadId = threadId,
                        otherReadAt = otherReadAt,
                        replyPreviewText = row.stringOrNull("replyPreviewText")
                            ?: row.stringOrNull("replyToPreviewText")
                            ?: row.stringOrNull("replyToMessageId")?.let(replyLookup::get)
                    )
                }

                markAsRead(threadId)
                localRecentChatStore.mergeMessages(currentUserId, threadId, mapped)
            } catch (api: AppwriteApiException) {
                if (api.statusCode == 401 || api.statusCode == 403 || api.statusCode == 404) {
                    localRecentChatStore.removeThread(currentUserId, threadId)
                    emptyList()
                } else {
                    localRecentChatStore.messages(currentUserId, threadId)
                        .takeIf { it.isNotEmpty() }
                        ?: throw api
                }
            } catch (throwable: Throwable) {
                localRecentChatStore.messages(currentUserId, threadId).takeIf { it.isNotEmpty() } ?: throw throwable
            }
        }
    }

    override suspend fun ensureThread(threadId: String): Result<MessageThread> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = false)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val cachedThread = localRecentChatStore.thread(currentUserId, threadId)
            if (cachedThread != null) {
                return@runCatching cachedThread
            }
            val thread = runCatching {
                fetchThreadPreviewAfterWrite(threadId, currentUserId)
            }.getOrElse { throwable ->
                cachedThread ?: throw throwable
            }
            localRecentChatStore.upsertThread(currentUserId, thread)
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
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val payload = mutableMapOf<String, Any?>(
                "currentUserId" to currentUserId,
                "threadId" to threadId,
                "text" to trimmed
            )
            if (!replyToMessageId.isNullOrBlank()) {
                payload["replyToMessageId"] = replyToMessageId
            }

            val message = sendMessageViaFunction(
                threadId = threadId,
                payload = payload,
                fallbackText = trimmed,
                replyToMessageId = replyToMessageId
            )
            localRecentChatStore.upsertMessage(currentUserId, message)
            message
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
            requiredSendMessageFunctionId()
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
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
                "currentUserId" to currentUserId,
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

            val message = sendMessageViaFunction(
                threadId = threadId,
                payload = payload,
                fallbackText = "",
                replyToMessageId = replyToMessageId,
                uploadedAttachment = UploadedAttachmentPayload(
                    fileId = uploaded.fileId,
                    name = uploaded.fileName,
                    mimeType = uploaded.mimeType,
                    type = type,
                    durationSec = null,
                    localUri = localUri
                )
            )
            localRecentChatStore.upsertMessage(currentUserId, message)
            message
        }
    }

    override suspend fun sendVoiceMessage(
        threadId: String,
        localPath: String,
        durationSec: Int,
        replyToMessageId: String?
    ): Result<ChatMessage> {
        return runCatching {
            requiredSendMessageFunctionId()
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
            val uploaded = gateway.uploadChatAttachment(
                threadId = threadId,
                displayName = "voice_${System.currentTimeMillis()}.m4a",
                localUri = localPath,
                mimeType = "audio/mp4"
            )

            val payload = mutableMapOf<String, Any?>(
                "currentUserId" to currentUserId,
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

            val message = sendMessageViaFunction(
                threadId = threadId,
                payload = payload,
                fallbackText = "",
                replyToMessageId = replyToMessageId,
                uploadedAttachment = UploadedAttachmentPayload(
                    fileId = uploaded.fileId,
                    name = uploaded.fileName,
                    mimeType = uploaded.mimeType,
                    type = AttachmentType.File,
                    durationSec = durationSec,
                    localUri = localPath
                ),
                forceVoice = true
            )
            localRecentChatStore.upsertMessage(currentUserId, message)
            message
        }
    }

    private suspend fun sendMessageViaFunction(
        threadId: String,
        payload: Map<String, Any?>,
        fallbackText: String,
        replyToMessageId: String?,
        uploadedAttachment: UploadedAttachmentPayload? = null,
        forceVoice: Boolean = false
    ): ChatMessage {
        val functionId = requiredSendMessageFunctionId()
        val response = gateway.executeFunction(
            functionId = functionId,
            payload = payload
        )
        return mapOutgoingResponse(
            threadId = threadId,
            response = response,
            fallbackText = fallbackText,
            replyToMessageId = replyToMessageId,
            uploadedAttachment = uploadedAttachment,
            forceVoice = forceVoice
        )
    }

    private fun requiredSendMessageFunctionId(): String {
        return configuration.sendMessageFunctionId.takeIf { it.isNotBlank() }
            ?: throw AppwriteConfigurationException(
                "APPWRITE_SEND_MESSAGE_FUNCTION_ID non configurato"
            )
    }

    override suspend fun markAsRead(threadId: String): Result<Unit> {
        return runCatching {
            gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
            val response = gateway.executeFunction(
                functionId = requiredSendMessageFunctionId(),
                payload = threadParticipantUpdatePayload(
                    threadId = threadId,
                    markRead = true
                )
            )
            validateParticipantUpdateResponse(response, threadId)
            Unit
        }
    }

    override suspend fun setThreadNotifications(threadId: String, enabled: Boolean): Result<MessageThread> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
            val response = gateway.executeFunction(
                functionId = requiredSendMessageFunctionId(),
                payload = threadParticipantUpdatePayload(
                    threadId = threadId,
                    notificationsEnabled = enabled
                )
            )
            validateParticipantUpdateResponse(response, threadId)
            val resolvedEnabled = response.booleanOrNull("notificationsEnabled") ?: enabled

            val updated = fetchThreadPreviewAfterWrite(threadId, currentUserId)
                .copy(notificationsEnabled = resolvedEnabled)
            localRecentChatStore.upsertThread(currentUserId, updated)
        }
    }

    private fun validateParticipantUpdateResponse(response: JsonObject, expectedThreadId: String) {
        if (response.booleanOrNull("ok") != true || response.stringOrNull("threadId") != expectedThreadId) {
            throw AppwriteConfigurationException("Risposta aggiornamento partecipante non valida")
        }
    }

    override suspend fun markCurrentUserPresence(isOnline: Boolean): Result<Unit> {
        return runCatching {
            gateway.fetchCurrentAccountId(required = false) ?: return@runCatching
            gateway.executeFunction(
                functionId = configuration.manageProfileFunctionId,
                payload = ManageProfilePayload.presence(isOnline)
            )
            Unit
        }
    }

    override suspend fun updateRelationship(threadId: String, action: RelationshipAction): Result<Unit> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = false)
            val functionId = configuration.manageRelationshipFunctionId
                ?: throw AppwriteConfigurationException("Funzione relazione Appwrite non configurata")

            gateway.executeFunction(
                functionId = functionId,
                payload = mapOf(
                    "threadId" to threadId,
                    "action" to action.apiValue
                )
            )
            if (!currentUserId.isNullOrBlank()) {
                localRecentChatStore.removeThread(currentUserId, threadId)
            }
            Unit
        }
    }

    private suspend fun fetchThreadPreview(threadId: String, currentUserId: String): MessageThread? {
        val threadRow = gateway.getRowIfAccessible(configuration.threadsTableId, threadId) ?: return null

        val participantRows = gateway.listRows(
            tableId = configuration.threadParticipantsTableId,
            queries = listOf(gateway.queryEqual("threadId", listOf(threadId)))
        )

        val participantUserIds = participantRows.mapNotNull { it.stringOrNull("userId") }.distinct().sorted()
        val otherUserId = participantUserIds.firstOrNull { it != currentUserId } ?: return null
        val peer = fetchPeerProjection(threadId, otherUserId)

        val messageRows = gateway.listRows(
            tableId = configuration.messagesTableId,
            queries = listOf(
                gateway.queryEqual("threadId", listOf(threadId)),
                gateway.queryOrderAsc("createdAt")
            )
        )

        val currentParticipantRow = participantRows.firstOrNull { it.stringOrNull("userId") == currentUserId }
        val readAt = currentParticipantRow
            ?.stringOrNull("lastReadAt")
            ?.let(::parseTimestamp)
            ?: 0L
        val otherReadAt = participantRows
            .filter { row -> row.stringOrNull("userId") != currentUserId }
            .mapNotNull { row -> parseTimestamp(row.stringOrNull("lastReadAt")) }
            .maxOrNull()

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
        val presenceUpdatedAt = peer.presenceUpdatedAt
        val isOnline = presenceUpdatedAt?.let { System.currentTimeMillis() - it <= PresenceOnlineWindowMs } ?: false
        val notificationsEnabled = currentParticipantRow
            ?.let(::threadNotificationsEnabled)
            ?: true

        return MessageThread(
            id = threadId,
            avatarLabel = peer.displayName.firstOrNull()?.uppercase() ?: "?",
            displayName = peer.displayName,
            lastMessage = lastMessage,
            lastTimestamp = lastTimestamp,
            unreadCount = unreadCount,
            backendThreadId = threadId,
            participantsBackendIds = participantUserIds,
            avatarUrl = peer.avatarUrl,
            isOnline = isOnline,
            lastSeenAt = peer.lastSeenAt,
            currentUserReadAt = currentParticipantRow?.stringOrNull("lastReadAt")?.let(::parseTimestamp),
            otherParticipantReadAt = otherReadAt,
            notificationsEnabled = notificationsEnabled,
            relationshipState = "matched"
        )
    }

    private suspend fun fetchPeerProjection(
        threadId: String,
        otherUserId: String
    ): ChatPeerProjection {
        val functionId = configuration.createOrGetThreadFunctionId.takeIf { it.isNotBlank() }
            ?: throw AppwriteConfigurationException(
                "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID non configurato"
            )
        val response = gateway.executeFunction(
            functionId = functionId,
            payload = mapOf(
                "action" to "peerProjection",
                "otherUserId" to otherUserId
            )
        )
        return chatPeerProjectionFromResponse(
            response = response,
            expectedThreadId = threadId,
            expectedUserId = otherUserId
        ) ?: throw AppwriteConfigurationException("Proiezione peer Appwrite non valida")
    }

    private suspend fun fetchThreadPreviewAfterWrite(
        threadId: String,
        currentUserId: String
    ): MessageThread {
        var lastFailure: Throwable? = null

        repeat(THREAD_FETCH_RETRY_COUNT) { attempt ->
            try {
                val thread = fetchThreadPreview(threadId, currentUserId)
                if (thread != null) {
                    return thread
                }
            } catch (throwable: Throwable) {
                lastFailure = throwable
            }

            if (attempt < THREAD_FETCH_RETRY_COUNT - 1) {
                delay(if (attempt < 2) SHORT_RETRY_DELAY_MS else LONG_RETRY_DELAY_MS)
            }
        }

        lastFailure?.let { throw it }
        throw AppwriteConfigurationException("Thread Appwrite non disponibile")
    }

    private fun mapRowToMessage(
        row: JsonObject,
        currentUserId: String,
        threadId: String,
        otherReadAt: Long?,
        replyPreviewText: String?
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
            replyPreviewText = replyPreviewText,
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
                    localPath = uploadedAttachment.localUri ?: url ?: uploadedAttachment.name,
                    durationSec = uploadedAttachment.durationSec ?: 0,
                    backendUrl = url
                )
            } else {
                attachments += MessageAttachment(
                    id = uploadedAttachment.fileId,
                    type = uploadedAttachment.type,
                    displayName = uploadedAttachment.name,
                    localUri = uploadedAttachment.localUri ?: url ?: uploadedAttachment.name,
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
            replyPreviewText = response.stringOrNull("replyPreviewText")
                ?: response.stringOrNull("replyToPreviewText"),
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

    private fun previewTextForRow(row: JsonObject): String {
        val text = row.stringOrNull("text")?.trim()
        if (!text.isNullOrBlank()) return text

        return when (row.stringOrNull("messageType")) {
            "image" -> "Immagine"
            "video" -> "Video"
            "audio" -> "Messaggio vocale"
            "file" -> row.stringOrNull("attachmentName") ?: "File"
            else -> row.stringOrNull("attachmentName") ?: "Messaggio"
        }
    }

    private fun threadNotificationsEnabled(participantRow: JsonObject): Boolean {
        participantRow.booleanOrNull("notificationsEnabled")?.let { return it }
        participantRow.booleanOrNull("muted")?.let { return !it }
        return true
    }

    private fun parseTimestamp(raw: String?): Long? {
        if (raw.isNullOrBlank()) return null
        return runCatching { java.time.Instant.parse(raw).toEpochMilli() }.getOrNull()
    }

    private data class UploadedAttachmentPayload(
        val fileId: String,
        val name: String,
        val mimeType: String,
        val type: AttachmentType,
        val durationSec: Int?,
        val localUri: String?
    )

    private companion object {
        private const val THREAD_FETCH_RETRY_COUNT = 6
        private const val SHORT_RETRY_DELAY_MS = 250L
        private const val LONG_RETRY_DELAY_MS = 500L
        private const val PresenceOnlineWindowMs = 70_000L
    }

}

internal data class ChatPeerProjection(
    val userId: String,
    val displayName: String,
    val avatarUrl: String?,
    val presenceUpdatedAt: Long?,
    val lastSeenAt: Long?
)

internal fun chatPeerProjectionFromResponse(
    response: JsonObject,
    expectedThreadId: String,
    expectedUserId: String
): ChatPeerProjection? {
    if (response.stringOrNull("threadId") != expectedThreadId) return null
    val peerElement = response.get("peer") ?: return null
    if (!peerElement.isJsonObject) return null
    val peer = peerElement.asJsonObject
    if (peer.stringOrNull("userId") != expectedUserId) return null
    val displayName = peer.stringOrNull("displayName")?.takeIf { it.isNotBlank() } ?: return null

    return ChatPeerProjection(
        userId = expectedUserId,
        displayName = displayName,
        avatarUrl = tokenizedFileViewUrl(peer.stringOrNull("avatarUrl")),
        presenceUpdatedAt = parsePeerTimestamp(peer.stringOrNull("presenceUpdatedAt")),
        lastSeenAt = parsePeerTimestamp(peer.stringOrNull("lastSeenAt"))
    )
}

private fun parsePeerTimestamp(value: String?): Long? {
    return value?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }
}
