package minni.fyre.messages.data

internal fun threadParticipantUpdatePayload(
    threadId: String,
    markRead: Boolean = false,
    notificationsEnabled: Boolean? = null,
    pinned: Boolean? = null
): Map<String, Any?> {
    require(threadId.isNotBlank()) { "threadId is required" }
    require(markRead || notificationsEnabled != null || pinned != null) {
        "At least one participant field must be updated"
    }

    return linkedMapOf<String, Any?>(
        "action" to "updateParticipant",
        "threadId" to threadId
    ).apply {
        if (markRead) put("markRead", true)
        notificationsEnabled?.let { put("notificationsEnabled", it) }
        pinned?.let { put("pinned", it) }
    }
}
