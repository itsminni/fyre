package com.example.fyre.events.model

enum class RegistrationStatus {
    NotRegistered,
    Registered,
    Waitlist,
    Closed
}

enum class EventUserRole {
    Participant,
    Admin
}

enum class EventUserState {
    NotRegistered,
    Registered,
    Waitlist,
    Closed
}

data class EventParticipant(
    val id: String,
    val displayName: String,
    val status: RegistrationStatus
)

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
    val userState: EventUserState,
    val userRole: EventUserRole,
    val capacity: Int,
    val registeredCount: Int,
    val participants: List<EventParticipant>,
    val deadlineText: String,
    val liveMetrics: LiveMetrics,
    val backendEventId: String? = null,
    val syncStatus: EventSyncStatus = EventSyncStatus.LocalOnly
)

