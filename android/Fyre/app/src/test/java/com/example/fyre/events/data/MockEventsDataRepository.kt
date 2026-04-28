package com.example.fyre.events.data

import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.RegistrationStatus

class MockEventsDataRepository : EventsRepository {

    override suspend fun getEventsForUser(
        userId: String,
        displayName: String,
        email: String?
    ): Result<List<EventItem>> {
        return Result.success(
            MockEventsRepository.getEventsForUser(
                userId = userId,
                displayName = displayName,
                email = email
            )
        )
    }

    override suspend fun joinEvent(eventId: String, userId: String, displayName: String): Result<Unit> {
        MockEventsRepository.joinEvent(eventId, userId, displayName)
        return Result.success(Unit)
    }

    override suspend fun waitlistEvent(eventId: String, userId: String, displayName: String): Result<Unit> {
        MockEventsRepository.waitlistEvent(eventId, userId, displayName)
        return Result.success(Unit)
    }

    override suspend fun cancelEvent(eventId: String, userId: String): Result<Unit> {
        MockEventsRepository.cancelEvent(eventId, userId)
        return Result.success(Unit)
    }

    override suspend fun adminUpdateEvent(
        eventId: String,
        title: String,
        dateText: String,
        place: String,
        description: String,
        deadlineText: String,
        capacity: Int,
        rules: List<String>
    ): Result<Unit> {
        val updated = MockEventsRepository.adminUpdateEvent(
            eventId = eventId,
            isAdminMock = true,
            title = title,
            dateText = dateText,
            place = place,
            description = description,
            deadlineText = deadlineText,
            capacity = capacity,
            rules = rules
        )

        return if (updated) {
            Result.success(Unit)
        } else {
            Result.failure(IllegalStateException("Aggiornamento evento non autorizzato"))
        }
    }

    override suspend fun adminSetParticipantStatus(
        eventId: String,
        participantId: String,
        status: RegistrationStatus
    ): Result<Unit> {
        val updated = MockEventsRepository.adminSetParticipantStatus(
            eventId = eventId,
            isAdminMock = true,
            participantId = participantId,
            status = status
        )

        return if (updated) {
            Result.success(Unit)
        } else {
            Result.failure(IllegalStateException("Aggiornamento partecipante non riuscito"))
        }
    }

    override fun isAdminEmail(email: String?): Boolean {
        return MockEventsRepository.isAdminEmail(email)
    }

}
