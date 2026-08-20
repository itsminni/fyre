package minni.fyre.messages.model

enum class MessageAuthor {
    Me,
    Other
}

enum class MessageSyncStatus {
    LocalOnly,
    Synced,
    Failed
}

data class ChatMessage(
    val id: String,
    val threadId: String,
    val author: MessageAuthor,
    val text: String,
    val timestamp: Long,
    val isRead: Boolean,
    val replyToMessageId: String? = null,
    val replyPreviewText: String? = null,
    val attachments: List<MessageAttachment> = emptyList(),
    val voiceNote: VoiceNote? = null,
    val backendMessageId: String? = null,
    val syncStatus: MessageSyncStatus = MessageSyncStatus.LocalOnly
)

