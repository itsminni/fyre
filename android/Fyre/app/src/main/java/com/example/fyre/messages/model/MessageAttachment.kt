package com.example.fyre.messages.model

enum class AttachmentType {
    Image,
    Video,
    File
}

data class MessageAttachment(
    val id: String,
    val type: AttachmentType,
    val displayName: String,
    val localUri: String,
    val mimeType: String,
    val backendUrl: String? = null
)

data class VoiceNote(
    val localPath: String,
    val durationSec: Int,
    val backendUrl: String? = null
)

