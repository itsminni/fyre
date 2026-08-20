package minni.fyre.events.data

import minni.fyre.events.model.EventItem
import minni.fyre.events.model.RegistrationStatus

interface EventsRepository {
    suspend fun getEventsForUser(
        userId: String,
        displayName: String
    ): Result<List<EventItem>>

    suspend fun joinEvent(eventId: String, userId: String, displayName: String): Result<Unit>

    suspend fun waitlistEvent(eventId: String, userId: String, displayName: String): Result<Unit>

    suspend fun cancelEvent(eventId: String, userId: String): Result<Unit>

    suspend fun adminUpdateEvent(
        eventId: String,
        title: String,
        dateText: String,
        place: String,
        description: String,
        deadlineText: String,
        capacity: Int,
        rules: List<String>,
        maleLimit: Int = (capacity / 2).coerceAtLeast(1),
        femaleLimit: Int = (capacity / 2).coerceAtLeast(1),
        cancellationDeadlineText: String = deadlineText
    ): Result<Unit>

    suspend fun adminSetParticipantStatus(
        eventId: String,
        participantId: String,
        registrationId: String?,
        status: RegistrationStatus
    ): Result<Unit>
}
