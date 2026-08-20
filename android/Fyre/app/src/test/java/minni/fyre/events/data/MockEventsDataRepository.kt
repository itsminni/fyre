package minni.fyre.events.data

import minni.fyre.events.model.EventItem
import minni.fyre.events.model.RegistrationStatus

class MockEventsDataRepository(
    private val mockAdminEnabled: Boolean = false
) : EventsRepository {

    override suspend fun getEventsForUser(
        userId: String,
        displayName: String
    ): Result<List<EventItem>> {
        return Result.success(
            MockEventsRepository.getEventsForUser(
                userId = userId,
                displayName = displayName,
                mockAdminEnabled = mockAdminEnabled
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
        rules: List<String>,
        maleLimit: Int,
        femaleLimit: Int,
        cancellationDeadlineText: String
    ): Result<Unit> {
        val updated = MockEventsRepository.adminUpdateEvent(
            eventId = eventId,
            isAdminMock = mockAdminEnabled,
            title = title,
            dateText = dateText,
            place = place,
            description = description,
            deadlineText = deadlineText,
            capacity = capacity,
            rules = rules,
            maleLimit = maleLimit,
            femaleLimit = femaleLimit,
            cancellationDeadlineText = cancellationDeadlineText
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
        registrationId: String?,
        status: RegistrationStatus
    ): Result<Unit> {
        val updated = MockEventsRepository.adminSetParticipantStatus(
            eventId = eventId,
            isAdminMock = mockAdminEnabled,
            participantId = participantId,
            status = status
        )

        return if (updated) {
            Result.success(Unit)
        } else {
            Result.failure(IllegalStateException("Aggiornamento partecipante non riuscito"))
        }
    }
}
