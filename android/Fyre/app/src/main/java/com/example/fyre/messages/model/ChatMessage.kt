package com.example.fyre.messages.model

enum class MessageAuthor {
    Me,
    Other
}

data class ChatMessage(
    val id: String,
    val threadId: String,
    val author: MessageAuthor,
    val text: String,
    val timestamp: Long,
    val isRead: Boolean
)

