package com.example.fyre.events.model

enum class RegistrationStatus {
    NotRegistered,
    Registered,
    Waitlist,
    Promoted,
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
    Promoted,
    Closed
}

data class EventParticipant(
    val id: String,
    val displayName: String,
    val status: RegistrationStatus,
    val gender: String? = null
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
    val maleLimit: Int = 24,
    val femaleLimit: Int = 24,
    val maleCount: Int = 0,
    val femaleCount: Int = 0,
    val waitingListCount: Int = 0,
    val participants: List<EventParticipant>,
    val deadlineText: String,
    val cancellationDeadlineText: String = deadlineText,
    val adminEmails: String = "",
    val liveMetrics: LiveMetrics,
    val backendEventId: String? = null,
    val syncStatus: EventSyncStatus = EventSyncStatus.LocalOnly
)

