package com.example.fyre.messages.model

data class MessageThread(
    val id: String,
    val avatarLabel: String,
    val displayName: String,
    val lastMessage: String,
    val lastTimestamp: Long,
    val unreadCount: Int,
    val backendThreadId: String? = null,
    val participantsBackendIds: List<String> = emptyList(),
    val avatarUrl: String? = null,
    val isOnline: Boolean = false,
    val lastSeenAt: Long? = null,
    val currentUserReadAt: Long? = null,
    val otherParticipantReadAt: Long? = null,
    val notificationsEnabled: Boolean = true,
    val relationshipState: String? = null
)

