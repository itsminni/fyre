package com.example.fyre.events.model

enum class RegistrationStatus {
    NotRegistered,
    Registered,
    Waitlist,
    Closed
}

enum class EventSyncStatus {
    LocalOnly,
    Synced,
    Failed
}

data class LiveMetrics(
    val viewersOnline: Int,
    val checkIns: Int,
    val chatPerMinute: Int
)

data class EventItem(
    val id: String,
    val title: String,
    val dateText: String,
    val place: String,
    val description: String,
    val rules: List<String>,
    val registrationStatus: RegistrationStatus,
    val capacity: Int,
    val registeredCount: Int,
    val deadlineText: String,
    val liveMetrics: LiveMetrics,
    val backendEventId: String? = null,
    val syncStatus: EventSyncStatus = EventSyncStatus.LocalOnly
)

