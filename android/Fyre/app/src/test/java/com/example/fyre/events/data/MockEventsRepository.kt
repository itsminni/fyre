package com.example.fyre.events.data

import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.EventParticipant
import com.example.fyre.events.model.EventUserRole
import com.example.fyre.events.model.EventUserState
import com.example.fyre.events.model.LiveMetrics
import com.example.fyre.events.model.RegistrationStatus

/** Repository locale mock per la feature Eventi. */
object MockEventsRepository {
    private const val DEFAULT_USER_ID = "user_default"
    private const val DEFAULT_USER_NAME = "Utente"

    private data class EventRecord(
        val id: String,
        var title: String,
        var dateText: String,
        var place: String,
        var description: String,
        var rules: MutableList<String>,
        var capacity: Int,
        var deadlineText: String,
        var liveMetrics: LiveMetrics,
        val participants: MutableList<EventParticipant>
    )

    private val records = mutableListOf<EventRecord>()

    init {
        resetSeed()
    }

    fun isAdminEmail(email: String?): Boolean {
        if (email.isNullOrBlank()) return false
        val normalized = email.trim().lowercase()
        return normalized.contains("admin") || normalized == "matteo@example.com"
    }

    fun getEventsForUser(userId: String, displayName: String, email: String? = null): List<EventItem> {
        return records.map { record -> mapToEventItem(record, userId, displayName, email) }
    }

    fun getEventByIdForUser(eventId: String, userId: String, displayName: String, email: String? = null): EventItem? {
        val record = records.firstOrNull { it.id == eventId } ?: return null
        return mapToEventItem(record, userId, displayName, email)
    }

    fun joinEvent(eventId: String, userId: String, displayName: String) {
        val record = records.firstOrNull { it.id == eventId } ?: return
        val current = record.participants.firstOrNull { it.id == userId }
        if (current?.status == RegistrationStatus.Registered) return

        val hasFreeSeats = record.participants.count { it.status == RegistrationStatus.Registered } < record.capacity
        val nextStatus = if (hasFreeSeats) RegistrationStatus.Registered else RegistrationStatus.Waitlist
        upsertParticipant(record, userId, displayName, nextStatus)
    }

    fun waitlistEvent(eventId: String, userId: String, displayName: String) {
        val record = records.firstOrNull { it.id == eventId } ?: return
        upsertParticipant(record, userId, displayName, RegistrationStatus.Waitlist)
    }

    fun cancelEvent(eventId: String, userId: String) {
        val record = records.firstOrNull { it.id == eventId } ?: return
        val previousStatus = record.participants.firstOrNull { it.id == userId }?.status
        val index = record.participants.indexOfFirst { it.id == userId }
        if (index >= 0) {
            record.participants[index] = record.participants[index].copy(status = RegistrationStatus.NotRegistered)
        }

        // Se un partecipante registrato annulla, promuoviamo il primo utente in waitlist.
        if (previousStatus == RegistrationStatus.Registered) {
            val waitlistIndex = record.participants.indexOfFirst { it.status == RegistrationStatus.Waitlist }
            if (waitlistIndex >= 0) {
                record.participants[waitlistIndex] = record.participants[waitlistIndex].copy(status = RegistrationStatus.Registered)
            }
        }
    }

    fun adminUpdateEvent(
        eventId: String,
        isAdminMock: Boolean,
        title: String,
        dateText: String,
        place: String,
        description: String,
        deadlineText: String,
        capacity: Int,
        rules: List<String>
    ): Boolean {
        if (!isAdminMock) return false
        val record = records.firstOrNull { it.id == eventId } ?: return false
        record.title = title
        record.dateText = dateText
        record.place = place
        record.description = description
        record.deadlineText = deadlineText
        record.capacity = capacity.coerceAtLeast(1)
        record.rules = rules.map { it.trim() }.filter { it.isNotBlank() }.toMutableList()
        rebalanceParticipantsAfterCapacityChange(record)
        return true
    }

    fun adminSetParticipantStatus(
        eventId: String,
        isAdminMock: Boolean,
        participantId: String,
        status: RegistrationStatus
    ): Boolean {
        if (!isAdminMock) return false
        val record = records.firstOrNull { it.id == eventId } ?: return false
        val index = record.participants.indexOfFirst { it.id == participantId }
        if (index >= 0) {
            record.participants[index] = record.participants[index].copy(status = status)
            rebalanceParticipantsAfterCapacityChange(record)
            return true
        }
        return false
    }

    fun simulateMetricsTick(eventId: String? = null) {
        for (i in records.indices) {
            val record = records[i]
            if (eventId != null && record.id != eventId) continue

            record.liveMetrics = record.liveMetrics.copy(
                viewersOnline = (record.liveMetrics.viewersOnline + 2).coerceAtMost(9999),
                checkIns = (record.liveMetrics.checkIns + 1).coerceAtMost(record.capacity),
                chatPerMinute = (record.liveMetrics.chatPerMinute + 1).coerceAtMost(999)
            )
        }
    }

    // Compatibility API used by existing tests/callers.
    fun getEvents(): List<EventItem> = getEventsForUser(DEFAULT_USER_ID, DEFAULT_USER_NAME, null)

    fun getEventById(eventId: String): EventItem? =
        getEventByIdForUser(eventId, DEFAULT_USER_ID, DEFAULT_USER_NAME, null)

    fun updateRegistrationStatus(eventId: String, status: RegistrationStatus) {
        when (status) {
            RegistrationStatus.Registered -> joinEvent(eventId, DEFAULT_USER_ID, DEFAULT_USER_NAME)
            RegistrationStatus.Waitlist -> waitlistEvent(eventId, DEFAULT_USER_ID, DEFAULT_USER_NAME)
            RegistrationStatus.NotRegistered -> cancelEvent(eventId, DEFAULT_USER_ID)
            RegistrationStatus.Closed -> cancelEvent(eventId, DEFAULT_USER_ID)
        }
    }

    fun resetSeed() {
        records.clear()
        records.addAll(initialSeed())
    }

    private fun mapToEventItem(record: EventRecord, userId: String, displayName: String, email: String?): EventItem {
        ensureParticipantExists(record, userId, displayName)
        val userStatus = record.participants.firstOrNull { it.id == userId }?.status
            ?: RegistrationStatus.NotRegistered
        val registeredCount = record.participants.count { it.status == RegistrationStatus.Registered }
        val userState = when {
            userStatus == RegistrationStatus.Registered -> EventUserState.Registered
            userStatus == RegistrationStatus.Waitlist -> EventUserState.Waitlist
            userStatus == RegistrationStatus.Closed -> EventUserState.Closed
            registeredCount >= record.capacity -> EventUserState.Closed
            else -> EventUserState.NotRegistered
        }
        val userRole = if (isAdminEmail(email)) {
            EventUserRole.Admin
        } else {
            EventUserRole.Participant
        }

        return EventItem(
            id = record.id,
            title = record.title,
            dateText = record.dateText,
            place = record.place,
            description = record.description,
            rules = record.rules.toList(),
            registrationStatus = userStatus,
            userState = userState,
            userRole = userRole,
            capacity = record.capacity,
            registeredCount = registeredCount,
            participants = record.participants.toList(),
            deadlineText = record.deadlineText,
            liveMetrics = record.liveMetrics
        )
    }

    private fun rebalanceParticipantsAfterCapacityChange(record: EventRecord) {
        val registeredIndexes = record.participants
            .mapIndexedNotNull { index, participant -> if (participant.status == RegistrationStatus.Registered) index else null }

        if (registeredIndexes.size > record.capacity) {
            val overflow = registeredIndexes.drop(record.capacity)
            overflow.forEach { index ->
                record.participants[index] = record.participants[index].copy(status = RegistrationStatus.Waitlist)
            }
        }

        val currentRegistered = record.participants.count { it.status == RegistrationStatus.Registered }
        val seatsLeft = (record.capacity - currentRegistered).coerceAtLeast(0)
        if (seatsLeft == 0) return

        var promoted = 0
        for (index in record.participants.indices) {
            if (promoted >= seatsLeft) break
            if (record.participants[index].status == RegistrationStatus.Waitlist) {
                record.participants[index] = record.participants[index].copy(status = RegistrationStatus.Registered)
                promoted += 1
            }
        }
    }

    private fun upsertParticipant(
        record: EventRecord,
        userId: String,
        displayName: String,
        status: RegistrationStatus
    ) {
        val index = record.participants.indexOfFirst { it.id == userId }
        if (index >= 0) {
            record.participants[index] = record.participants[index].copy(status = status)
        } else {
            record.participants.add(
                EventParticipant(
                    id = userId,
                    displayName = displayName,
                    status = status
                )
            )
        }
    }

    private fun ensureParticipantExists(record: EventRecord, userId: String, displayName: String) {
        if (record.participants.none { it.id == userId }) {
            record.participants.add(
                EventParticipant(
                    id = userId,
                    displayName = displayName,
                    status = RegistrationStatus.NotRegistered
                )
            )
        }
    }

    private fun initialSeed(): List<EventRecord> {
        return listOf(
            EventRecord(
                id = "ev1",
                title = "Aperitivo Tech Milano",
                dateText = "24/04/2026 19:30",
                place = "Navigli, Milano",
                description = "Networking serale tra developer, designer e founder.",
                rules = mutableListOf("Dress code smart casual", "No spam", "Rispetta i tempi di speech"),
                capacity = 120,
                deadlineText = "23/04/2026 23:59",
                liveMetrics = LiveMetrics(viewersOnline = 41, checkIns = 12, chatPerMinute = 8),
                participants = mutableListOf(
                    EventParticipant("u_alice", "Alice", RegistrationStatus.Registered),
                    EventParticipant("u_bruno", "Bruno", RegistrationStatus.Registered),
                    EventParticipant("u_carla", "Carla", RegistrationStatus.Waitlist)
                )
            ),
            EventRecord(
                id = "ev2",
                title = "Sunset Rooftop Party",
                dateText = "27/04/2026 18:00",
                place = "Porta Nuova, Milano",
                description = "DJ set, drink menu dedicato e social game live.",
                rules = mutableListOf("Solo maggiorenni", "Documento richiesto", "No ingresso dopo le 21:30"),
                capacity = 200,
                deadlineText = "27/04/2026 12:00",
                liveMetrics = LiveMetrics(viewersOnline = 63, checkIns = 29, chatPerMinute = 15),
                participants = mutableListOf(
                    EventParticipant("u_diego", "Diego", RegistrationStatus.Registered),
                    EventParticipant("u_elisa", "Elisa", RegistrationStatus.Registered)
                )
            ),
            EventRecord(
                id = "ev3",
                title = "Hiking Day Lago di Como",
                dateText = "01/05/2026 08:30",
                place = "Como, meeting point stazione",
                description = "Escursione guidata con gruppo misto e pranzo al sacco.",
                rules = mutableListOf("Scarpe trekking obbligatorie", "Rispettare la guida", "Conferma meteo il giorno prima"),
                capacity = 40,
                deadlineText = "29/04/2026 20:00",
                liveMetrics = LiveMetrics(viewersOnline = 19, checkIns = 4, chatPerMinute = 3),
                participants = mutableListOf(
                    EventParticipant("u_federico", "Federico", RegistrationStatus.Registered),
                    EventParticipant("u_giulia", "Giulia", RegistrationStatus.Waitlist)
                )
            )
        )
    }
}
