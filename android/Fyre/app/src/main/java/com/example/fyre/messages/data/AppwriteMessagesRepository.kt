package com.example.fyre.messages.data

import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteApiException
import com.example.fyre.data.appwrite.AppwriteConfigurationException
import com.example.fyre.data.appwrite.AppwriteGateway
import com.example.fyre.data.appwrite.booleanOrNull
import com.example.fyre.data.appwrite.intOrNull
import com.example.fyre.data.appwrite.stringOrNull
import com.example.fyre.data.local.LocalRecentChatStore
import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageAttachment
import com.example.fyre.messages.model.MessageAuthor
import com.example.fyre.messages.model.MessageSyncStatus
import com.example.fyre.messages.model.MessageThread
import com.example.fyre.messages.model.RelationshipAction
import com.example.fyre.messages.model.VoiceNote
import com.google.gson.JsonObject
import java.security.MessageDigest
import kotlinx.coroutines.delay

class AppwriteMessagesRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration,
    private val localRecentChatStore: LocalRecentChatStore
) : MessagesRepository {

    override suspend fun getThreads(): Result<List<MessageThread>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

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

                val existingThreadIds = items.map { it.id }.toSet()
                val ensuredThreads = ensureMatchedThreads(
                    currentUserId = currentUserId,
                    existingThreadIds = existingThreadIds
                )
                items += ensuredThreads.filterNot { it.id in existingThreadIds }

                localRecentChatStore.mergeThreads(
                    currentUserId = currentUserId,
                    fetchedThreads = items.sortedByDescending { it.lastTimestamp }
                )
            } catch (throwable: Throwable) {
                localRecentChatStore.threads(currentUserId).takeIf { it.isNotEmpty() } ?: throw throwable
            }
        }
    }

    override suspend fun getMessages(threadId: String): Result<List<ChatMessage>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

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

            val message = sendMessageWithFallback(
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

            val message = sendMessageWithFallback(
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

            val message = sendMessageWithFallback(
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

    private suspend fun sendMessageWithFallback(
        threadId: String,
        payload: Map<String, Any?>,
        fallbackText: String,
        replyToMessageId: String?,
        uploadedAttachment: UploadedAttachmentPayload? = null,
        forceVoice: Boolean = false
    ): ChatMessage {
        val responseResult = runCatching {
            gateway.executeFunction(
                functionId = configuration.sendMessageFunctionId,
                payload = payload
            )
        }

        return responseResult.fold(
            onSuccess = { response ->
                mapOutgoingResponse(
                    threadId = threadId,
                    response = response,
                    fallbackText = fallbackText,
                    replyToMessageId = replyToMessageId,
                    uploadedAttachment = uploadedAttachment,
                    forceVoice = forceVoice
                )
            },
            onFailure = { throwable ->
                if (!shouldUseDirectMessageFallback(threadId, throwable)) {
                    throw throwable
                }

                createDirectMessage(
                    threadId = threadId,
                    payload = payload,
                    fallbackText = fallbackText,
                    replyToMessageId = replyToMessageId,
                    uploadedAttachment = uploadedAttachment,
                    forceVoice = forceVoice
                )
            }
        )
    }

    private suspend fun shouldUseDirectMessageFallback(
        threadId: String,
        throwable: Throwable
    ): Boolean {
        val api = throwable as? AppwriteApiException ?: return false
        if (api.statusCode != 403) return false

        val currentUserId = gateway.fetchCurrentAccountId(required = false) ?: return false
        val participantRows = gateway.listRows(
            tableId = configuration.threadParticipantsTableId,
            queries = listOf(gateway.queryEqual("threadId", listOf(threadId)))
        )
        val participantIds = participantRows.mapNotNull { it.stringOrNull("userId") }
        if (currentUserId !in participantIds) return false

        val otherUserId = participantIds.firstOrNull { it != currentUserId } ?: return false
        return relationshipAllowsMatchedConversation(currentUserId, otherUserId)
    }

    private suspend fun createDirectMessage(
        threadId: String,
        payload: Map<String, Any?>,
        fallbackText: String,
        replyToMessageId: String?,
        uploadedAttachment: UploadedAttachmentPayload?,
        forceVoice: Boolean
    ): ChatMessage {
        val currentUserId = gateway.fetchCurrentAccountId(required = true)
            ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
        val participantRows = gateway.listRows(
            tableId = configuration.threadParticipantsTableId,
            queries = listOf(gateway.queryEqual("threadId", listOf(threadId)))
        )
        val participantIds = participantRows
            .mapNotNull { it.stringOrNull("userId") }
            .distinct()
        if (currentUserId !in participantIds) {
            throw AppwriteConfigurationException("Thread non disponibile")
        }

        val now = gateway.nowIso()
        val messageId = gateway.randomIdentifier()
        val messageType = payload["messageType"]?.toString()
            ?: if (forceVoice) "audio" else uploadedAttachment?.let { mapAttachmentType(it.type) }
            ?: "text"
        val text = payload["text"]?.toString()?.trim().orEmpty()
        val response = JsonObject().apply {
            addProperty("messageId", messageId)
            addProperty("text", text)
            addProperty("messageType", messageType)
            addProperty("createdAt", now)
            addNullableString("replyToMessageId", replyToMessageId)
            addNullableString("attachmentFileId", uploadedAttachment?.fileId)
            addNullableString("attachmentName", uploadedAttachment?.name)
            addNullableString("attachmentMimeType", uploadedAttachment?.mimeType)
            uploadedAttachment?.durationSec?.let { addProperty("attachmentDuration", it) }
        }

        gateway.createRow(
            tableId = configuration.messagesTableId,
            rowId = messageId,
            data = JsonObject().apply {
                addProperty("threadId", threadId)
                addProperty("senderUserId", currentUserId)
                addProperty("text", text)
                addProperty("messageType", messageType)
                addNullableString("attachmentFileId", uploadedAttachment?.fileId)
                addNullableString("attachmentName", uploadedAttachment?.name)
                addNullableString("attachmentMimeType", uploadedAttachment?.mimeType)
                addNullableNumber("attachmentSize", payload["attachmentSize"])
                uploadedAttachment?.durationSec?.let { addProperty("attachmentDuration", it) }
                addNullableString("replyToMessageId", replyToMessageId)
                addProperty("createdAt", now)
            },
            permissions = clientOwnedRowPermissions(currentUserId)
        )

        updateThreadPreviewAfterDirectMessage(
            threadId = threadId,
            currentUserId = currentUserId,
            previewText = text.ifBlank { uploadedAttachment?.name ?: defaultAttachmentPreview(messageType) },
            createdAt = now
        )
        updateCurrentParticipantReadAt(
            threadId = threadId,
            currentUserId = currentUserId,
            participantRows = participantRows,
            readAt = now
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

    private suspend fun relationshipAllowsMatchedConversation(
        currentUserId: String,
        otherUserId: String
    ): Boolean {
        val relationship = runCatching {
            fetchRelationshipRow(currentUserId, otherUserId)
        }.getOrNull()
            ?: return true

        val currentState = relationshipStateForUser(relationship, currentUserId)
        val otherState = relationshipStateForUser(relationship, otherUserId)
        if (currentState == "blocked" || otherState == "blocked" || currentState == "archived") {
            return false
        }

        return currentState == "matched" ||
            otherState == "matched" ||
            relationship.hasNonNull("matchedAt") ||
            currentState == "liked" ||
            otherState == "liked"
    }

    private suspend fun fetchRelationshipRow(
        currentUserId: String,
        otherUserId: String
    ): JsonObject? {
        val relationshipsTableId = configuration.relationshipsTableId ?: return null
        val userIds = listOf(currentUserId, otherUserId).sorted()
        val stableRelationship = gateway.getRowIfAccessible(
            tableId = relationshipsTableId,
            rowId = stableRelationshipRowId(userIds)
        )
        if (stableRelationship != null) {
            return stableRelationship
        }

        val pairKey = userIds.joinToString(":")
        return gateway.listRows(
            tableId = relationshipsTableId,
            queries = listOf(
                gateway.queryEqual("pairKey", listOf(pairKey)),
                gateway.queryLimit(1)
            )
        ).firstOrNull()
    }

    private suspend fun hasLegacyMatch(
        currentUserId: String,
        otherUserId: String
    ): Boolean {
        val matchesTableId = configuration.matchesTableId ?: return false
        val userIds = listOf(currentUserId, otherUserId).sorted()
        val stableMatch = gateway.getRowIfAccessible(
            tableId = matchesTableId,
            rowId = stableMatchRowId(userIds)
        )
        if (stableMatch != null) {
            return true
        }

        val matchKey = userIds.joinToString(":")
        return gateway.listRows(
            tableId = matchesTableId,
            queries = listOf(
                gateway.queryEqual("matchKey", listOf(matchKey)),
                gateway.queryLimit(1)
            )
        ).isNotEmpty()
    }

    private fun JsonObject.hasNonNull(key: String): Boolean {
        val element = get(key) ?: return false
        return !element.isJsonNull
    }

    private suspend fun updateThreadPreviewAfterDirectMessage(
        threadId: String,
        currentUserId: String,
        previewText: String,
        createdAt: String
    ) {
        val threadRow = gateway.getRowIfAccessible(configuration.threadsTableId, threadId) ?: return
        gateway.updateRow(
            tableId = configuration.threadsTableId,
            rowId = threadId,
            data = JsonObject().apply {
                addProperty("threadId", threadId)
                addProperty("createdByUserId", threadRow.stringOrNull("createdByUserId") ?: currentUserId)
                addNullableString("subject", threadRow.stringOrNull("subject"))
                addProperty("status", threadRow.stringOrNull("status") ?: "active")
                addProperty("lastMessageText", previewText)
                addProperty("lastMessageAt", createdAt)
            }
        )
    }

    private suspend fun updateCurrentParticipantReadAt(
        threadId: String,
        currentUserId: String,
        participantRows: List<JsonObject>,
        readAt: String
    ) {
        val participantRow = participantRows.firstOrNull { it.stringOrNull("userId") == currentUserId } ?: return
        val rowId = participantRow.stringOrNull("\$id") ?: return
        gateway.updateRow(
            tableId = configuration.threadParticipantsTableId,
            rowId = rowId,
            data = JsonObject().apply {
                addProperty("threadId", threadId)
                addProperty("userId", currentUserId)
                addProperty("role", participantRow.stringOrNull("role") ?: "participant")
                addProperty("lastReadAt", readAt)
                addProperty("muted", participantRow.booleanOrNull("muted") ?: false)
                addProperty("pinned", participantRow.booleanOrNull("pinned") ?: false)
                addProperty("notificationsEnabled", participantRow.booleanOrNull("notificationsEnabled") ?: true)
            }
        )
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

    override suspend fun setThreadNotifications(threadId: String, enabled: Boolean): Result<MessageThread> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val participantRows = gateway.listRows(
                tableId = configuration.threadParticipantsTableId,
                queries = listOf(
                    gateway.queryEqual("threadId", listOf(threadId)),
                    gateway.queryEqual("userId", listOf(currentUserId))
                )
            )
            val currentParticipant = participantRows.firstOrNull()
                ?: throw AppwriteConfigurationException("Partecipante chat non trovato")
            val rowId = currentParticipant.stringOrNull("\$id")
                ?: throw AppwriteConfigurationException("Partecipante chat non aggiornabile")

            gateway.updateRow(
                tableId = configuration.threadParticipantsTableId,
                rowId = rowId,
                data = JsonObject().apply {
                    addProperty("threadId", threadId)
                    addProperty("userId", currentUserId)
                    addProperty("role", currentParticipant.stringOrNull("role") ?: "participant")
                    addNullableString("lastReadAt", currentParticipant.stringOrNull("lastReadAt"))
                    addProperty("muted", !enabled)
                    addProperty("pinned", currentParticipant.booleanOrNull("pinned") ?: false)
                    addProperty("notificationsEnabled", enabled)
                }
            )

            val updated = fetchThreadPreviewAfterWrite(threadId, currentUserId)
                .copy(notificationsEnabled = enabled)
            localRecentChatStore.upsertThread(currentUserId, updated)
        }
    }

    override suspend fun markCurrentUserPresence(isOnline: Boolean): Result<Unit> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = false) ?: return@runCatching
            val profileRow = gateway.fetchProfileRow(currentUserId) ?: return@runCatching
            val rowId = profileRow.stringOrNull("\$id") ?: currentUserId
            val now = gateway.nowIso()

            gateway.updateRow(
                tableId = configuration.profilesTableId,
                rowId = rowId,
                data = JsonObject().apply {
                    addProperty("presenceUpdatedAt", now)
                    if (!isOnline) {
                        addProperty("lastSeenAt", now)
                    }
                }
            )
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

        val participantUserIds = participantRows.mapNotNull { it.stringOrNull("userId") }
        val otherUserId = participantUserIds.firstOrNull { it != currentUserId } ?: return null
        if (!relationshipAllowsMatchedConversation(currentUserId, otherUserId)) {
            return null
        }
        val profileRow = gateway.fetchProfileRow(otherUserId)
        val otherParticipantRow = participantRows.firstOrNull { it.stringOrNull("userId") == otherUserId }

        val fallbackName = listOfNotNull(
            threadRow.stringOrNull("subject"),
            threadRow.stringOrNull("otherUserName"),
            threadRow.stringOrNull("displayName"),
            threadRow.stringOrNull("name"),
            otherParticipantRow?.stringOrNull("displayName"),
            otherParticipantRow?.stringOrNull("name"),
            otherParticipantRow?.stringOrNull("userName"),
            otherParticipantRow?.stringOrNull("otherUserName")
        ).firstOrNull().orEmpty().ifBlank { "Match" }

        val displayName = resolveDisplayName(
            firstName = profileRow?.stringOrNull("firstName"),
            lastName = profileRow?.stringOrNull("lastName"),
            email = profileRow?.stringOrNull("email"),
            fallback = fallbackName
        )

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
        val avatarFileId = profileRow?.stringOrNull("avatarFileId")
        val presenceUpdatedAt = parseTimestamp(profileRow?.stringOrNull("presenceUpdatedAt"))
        val isOnline = presenceUpdatedAt?.let { System.currentTimeMillis() - it <= PresenceOnlineWindowMs } ?: false
        val lastSeenAt = parseTimestamp(profileRow?.stringOrNull("lastSeenAt"))
        val relationship = fetchRelationshipRow(currentUserId, otherUserId)
        val relationshipState = relationship?.let { relationshipStateForUser(it, currentUserId) }
        val notificationsEnabled = currentParticipantRow
            ?.let(::threadNotificationsEnabled)
            ?: true

        return MessageThread(
            id = threadId,
            avatarLabel = displayName.firstOrNull()?.uppercase() ?: "?",
            displayName = displayName,
            lastMessage = lastMessage,
            lastTimestamp = lastTimestamp,
            unreadCount = unreadCount,
            backendThreadId = threadId,
            participantsBackendIds = participantUserIds,
            avatarUrl = gateway.avatarUrl(avatarFileId),
            isOnline = isOnline,
            lastSeenAt = lastSeenAt,
            currentUserReadAt = currentParticipantRow?.stringOrNull("lastReadAt")?.let(::parseTimestamp),
            otherParticipantReadAt = otherReadAt,
            notificationsEnabled = notificationsEnabled,
            relationshipState = relationshipState
        )
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
        return MessageThread(
            id = threadId,
            avatarLabel = "M",
            displayName = "Match",
            lastMessage = "Inizia la conversazione",
            lastTimestamp = System.currentTimeMillis(),
            unreadCount = 0,
            backendThreadId = threadId,
            participantsBackendIds = listOf(currentUserId)
        )
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

    private fun relationshipStateForUser(relationship: JsonObject, userId: String): String {
        return when (userId) {
            relationship.stringOrNull("userAId") -> relationship.stringOrNull("userAState") ?: "none"
            relationship.stringOrNull("userBId") -> relationship.stringOrNull("userBState") ?: "none"
            else -> "none"
        }
    }

    private fun stableRelationshipRowId(userIds: List<String>): String =
        stableRowId("rl", userIds.joinToString(":"))

    private fun stableMatchRowId(userIds: List<String>): String =
        stableRowId("mt", userIds.joinToString(":"))

    private fun stableRowId(prefix: String, seed: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(seed.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
            .take(32)
        return "${prefix}_$digest"
    }

    private fun clientOwnedRowPermissions(currentUserId: String): List<String> {
        return listOf(
            "read(\"user:$currentUserId\")",
            "update(\"user:$currentUserId\")",
            "delete(\"user:$currentUserId\")"
        )
    }

    private fun defaultAttachmentPreview(messageType: String): String {
        return when (messageType) {
            "image" -> "Immagine"
            "video" -> "Video"
            "audio" -> "Messaggio vocale"
            "file" -> "File"
            else -> "Allegato"
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

    private fun JsonObject.addNullableString(key: String, value: String?) {
        if (value.isNullOrBlank()) {
            add(key, null)
        } else {
            addProperty(key, value)
        }
    }

    private fun JsonObject.addNullableNumber(key: String, value: Any?) {
        when (value) {
            is Number -> addProperty(key, value)
            is String -> value.toLongOrNull()?.let { addProperty(key, it) } ?: add(key, null)
            else -> add(key, null)
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
        val durationSec: Int?,
        val localUri: String?
    )

    private companion object {
        private const val THREAD_FETCH_RETRY_COUNT = 6
        private const val SHORT_RETRY_DELAY_MS = 250L
        private const val LONG_RETRY_DELAY_MS = 500L
        private const val PresenceOnlineWindowMs = 70_000L
    }

    private suspend fun ensureMatchedThreads(
        currentUserId: String,
        existingThreadIds: Set<String>
    ): List<MessageThread> {
        val functionId = configuration.createOrGetThreadFunctionId
        if (functionId.isBlank()) return emptyList()

        val matchedUserIds = fetchMatchedUserIds(currentUserId)
        if (matchedUserIds.isEmpty()) return emptyList()

        val ensured = mutableListOf<MessageThread>()
        matchedUserIds.forEach { otherUserId ->
            val threadId = runCatching {
                val otherProfile = gateway.fetchProfileRow(otherUserId)
                val otherName = resolveDisplayName(
                    firstName = otherProfile?.stringOrNull("firstName"),
                    lastName = otherProfile?.stringOrNull("lastName"),
                    email = otherProfile?.stringOrNull("email"),
                    fallback = "Match"
                )
                val payload = mapOf(
                    "currentUserId" to currentUserId,
                    "otherUserId" to otherUserId,
                    "otherUserName" to otherName
                )
                gateway.executeFunction(
                    functionId = functionId,
                    payload = payload
                ).stringOrNull("threadId")
                    ?.also {
                        updateThreadDisplayNameIfMissing(it, otherName)
                        seedLocalThreadName(currentUserId, it, otherUserId, otherName)
                    }
            }.getOrNull()

            if (!threadId.isNullOrBlank()) {
                ensureCurrentUserParticipant(threadId, currentUserId)
            }

            if (!threadId.isNullOrBlank() && threadId !in existingThreadIds) {
                runCatching {
                    ensured += fetchThreadPreviewAfterWrite(threadId, currentUserId)
                }
            }
        }

        return ensured
    }

    private fun seedLocalThreadName(
        currentUserId: String,
        threadId: String,
        otherUserId: String,
        otherName: String
    ) {
        if (otherName.isBlank() || otherName == "Match") return

        localRecentChatStore.upsertThread(
            currentUserId = currentUserId,
            thread = MessageThread(
                id = threadId,
                avatarLabel = otherName.firstOrNull()?.uppercase() ?: "?",
                displayName = otherName,
                lastMessage = "Inizia la conversazione",
                lastTimestamp = System.currentTimeMillis(),
                unreadCount = 0,
                backendThreadId = threadId,
                participantsBackendIds = listOf(currentUserId, otherUserId)
            )
        )
    }

    private suspend fun updateThreadDisplayNameIfMissing(threadId: String, displayName: String) {
        if (displayName.isBlank() || displayName == "Match") return

        runCatching {
            val threadRow = gateway.getRowIfAccessible(configuration.threadsTableId, threadId) ?: return@runCatching
            val existing = listOf(
                threadRow.stringOrNull("subject"),
                threadRow.stringOrNull("otherUserName"),
                threadRow.stringOrNull("displayName"),
                threadRow.stringOrNull("name")
            ).firstOrNull { !it.isNullOrBlank() }
            if (!existing.isNullOrBlank() && existing != "Match") return@runCatching

            gateway.updateRow(
                tableId = configuration.threadsTableId,
                rowId = threadId,
                data = JsonObject().apply {
                    addProperty("threadId", threadId)
                    addNullableString("subject", displayName)
                    addNullableString("otherUserName", displayName)
                    addNullableString("displayName", displayName)
                    addNullableString("name", displayName)
                }
            )
        }
    }

    private suspend fun ensureCurrentUserParticipant(threadId: String, currentUserId: String) {
        runCatching {
            val existing = gateway.listRows(
                tableId = configuration.threadParticipantsTableId,
                queries = listOf(
                    gateway.queryEqual("threadId", listOf(threadId)),
                    gateway.queryEqual("userId", listOf(currentUserId))
                )
            )
            if (existing.isNotEmpty()) return

            gateway.createRow(
                tableId = configuration.threadParticipantsTableId,
                rowId = gateway.randomIdentifier(),
                data = JsonObject().apply {
                    addProperty("threadId", threadId)
                    addProperty("userId", currentUserId)
                    addProperty("role", "participant")
                    addNullableString("lastReadAt", null)
                    addProperty("muted", false)
                    addProperty("pinned", false)
                    addProperty("notificationsEnabled", true)
                }
            )
        }
    }

    private suspend fun fetchMatchedUserIds(currentUserId: String): Set<String> {
        val matched = mutableSetOf<String>()

        configuration.relationshipsTableId?.let { tableId ->
            val relationshipRows = gateway.listRows(
                tableId = tableId,
                queries = listOf(gateway.queryEqual("userAId", listOf(currentUserId)))
            ) + gateway.listRows(
                tableId = tableId,
                queries = listOf(gateway.queryEqual("userBId", listOf(currentUserId)))
            )

            relationshipRows.forEach { row ->
                val otherUserId = when (currentUserId) {
                    row.stringOrNull("userAId") -> row.stringOrNull("userBId")
                    row.stringOrNull("userBId") -> row.stringOrNull("userAId")
                    else -> null
                }
                if (!otherUserId.isNullOrBlank() && relationshipIsMatched(row, currentUserId)) {
                    matched += otherUserId
                }
            }
        }

        if (matched.isNotEmpty()) return matched

        configuration.matchesTableId?.let { tableId ->
            gateway.listRows(
                tableId = tableId,
                queries = listOf(gateway.queryEqual("userAId", listOf(currentUserId)))
            ).mapNotNullTo(matched) { row -> row.stringOrNull("userBId") }

            gateway.listRows(
                tableId = tableId,
                queries = listOf(gateway.queryEqual("userBId", listOf(currentUserId)))
            ).mapNotNullTo(matched) { row -> row.stringOrNull("userAId") }
        }

        return matched
    }

    private fun relationshipIsMatched(row: JsonObject, currentUserId: String): Boolean {
        val currentState = relationshipStateForUser(row, currentUserId)
        val otherState = when (currentUserId) {
            row.stringOrNull("userAId") -> row.stringOrNull("userBState")
            row.stringOrNull("userBId") -> row.stringOrNull("userAState")
            else -> null
        } ?: "none"

        if (currentState == "blocked" || otherState == "blocked") return false
        if (currentState == "archived") return false

        return row.hasNonNull("matchedAt") || currentState == "matched" || otherState == "matched"
    }
}
