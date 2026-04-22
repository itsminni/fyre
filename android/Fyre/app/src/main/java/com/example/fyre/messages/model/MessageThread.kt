package com.example.fyre.messages.model

data class MessageThread(
    val id: String,
    val avatarLabel: String,
    val displayName: String,
    val lastMessage: String,
    val lastTimestamp: Long,
    val unreadCount: Int
)

