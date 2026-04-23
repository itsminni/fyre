package com.example.fyre.events.data

import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.RegistrationStatus

interface EventsRepository {
    suspend fun getEventsForUser(
        userId: String,
        displayName: String,
        email: String?
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
        rules: List<String>
    ): Result<Unit>

    suspend fun adminSetParticipantStatus(
        eventId: String,
        participantId: String,
        status: RegistrationStatus
    ): Result<Unit>

    fun isAdminEmail(email: String?): Boolean

    suspend fun simulateMetricsTick(eventId: String?): Result<Unit>
}