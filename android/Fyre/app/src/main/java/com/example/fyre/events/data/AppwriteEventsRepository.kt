package com.example.fyre.events.data

import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteConfigurationException
import com.example.fyre.data.appwrite.AppwriteGateway
import com.example.fyre.data.appwrite.intOrNull
import com.example.fyre.data.appwrite.stringOrNull
import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.EventParticipant
import com.example.fyre.events.model.EventSyncStatus
import com.example.fyre.events.model.EventUserRole
import com.example.fyre.events.model.EventUserState
import com.example.fyre.events.model.LiveMetrics
import com.example.fyre.events.model.RegistrationStatus
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Date
import java.util.Locale

class AppwriteEventsRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration
) : EventsRepository {

    override suspend fun getEventsForUser(
        userId: String,
        displayName: String,
        email: String?
    ): Result<List<EventItem>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
            val currentUserEmail = email?.trim()?.lowercase()

            val eventRows = gateway.listRows(
                tableId = configuration.eventsTableId,
                queries = listOf(gateway.queryOrderAsc("startsAt"))
            )

            eventRows.mapNotNull { eventRow ->
                mapEventRow(
                    eventRow = eventRow,
                    currentUserId = currentUserId,
                    currentUserEmail = currentUserEmail,
                    fallbackDisplayName = displayName
                )
            }
        }
    }

    override suspend fun joinEvent(eventId: String, userId: String, displayName: String): Result<Unit> {
        return runCatching {
            gateway.executeFunction(
                functionId = configuration.registerForEventFunctionId,
                payload = mapOf("eventId" to eventId)
            )
        }
    }

    override suspend fun waitlistEvent(eventId: String, userId: String, displayName: String): Result<Unit> {
        
        return joinEvent(eventId, userId, displayName)
    }

    override suspend fun cancelEvent(eventId: String, userId: String): Result<Unit> {
        return runCatching {
            gateway.executeFunction(
                functionId = configuration.cancelEventRegistrationFunctionId,
                payload = mapOf("eventId" to eventId)
            )
        }
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
        cancellationDeadlineText: String,
        adminEmails: String
    ): Result<Unit> {
        return runCatching {
            val functionId = configuration.eventAdminFunctionId
                ?: throw AppwriteConfigurationException("Funzione admin evento non configurata")

            val startsAt = normalizeDateTime(dateText)
            val deadline = normalizeDateTime(deadlineText)
            val cancellationDeadline = normalizeDateTime(cancellationDeadlineText)

            gateway.executeFunction(
                functionId = functionId,
                payload = mapOf(
                    "action" to "updateEvent",
                    "eventId" to eventId,
                    "title" to title,
                    "startsAt" to startsAt,
                    "maxParticipants" to capacity.coerceAtLeast(2),
                    "maleLimit" to maleLimit.coerceAtLeast(0),
                    "femaleLimit" to femaleLimit.coerceAtLeast(0),
                    "registrationClosesAt" to deadline,
                    "cancellationClosesAt" to cancellationDeadline,
                    "adminUserIds" to "",
                    "adminEmails" to adminEmails.trim()
                )
            )

            gateway.updateRow(
                tableId = configuration.eventsTableId,
                rowId = eventId,
                data = JsonObject().apply {
                    addProperty("place", place)
                    addProperty("description", description)
                    add("rules", com.example.fyre.data.appwrite.toJsonArray(rules))
                }
            )
        }
    }

    override suspend fun adminSetParticipantStatus(
        eventId: String,
        participantId: String,
        status: RegistrationStatus
    ): Result<Unit> {
        return runCatching {
            val functionId = configuration.eventAdminFunctionId
                ?: throw AppwriteConfigurationException("Funzione admin evento non configurata")

            when (status) {
                RegistrationStatus.NotRegistered -> {
                    val registrations = gateway.listRows(
                        tableId = configuration.eventRegistrationsTableId,
                        queries = listOf(
                            gateway.queryEqual("eventId", listOf(eventId)),
                            gateway.queryEqual("userId", listOf(participantId)),
                            gateway.queryLimit(1)
                        )
                    )
                    val registrationId = registrations.firstOrNull()?.stringOrNull("\$id")
                        ?: return@runCatching

                    gateway.executeFunction(
                        functionId = functionId,
                        payload = mapOf(
                            "action" to "removeParticipant",
                            "eventId" to eventId,
                            "registrationId" to registrationId
                        )
                    )
                }

                RegistrationStatus.Registered,
                RegistrationStatus.Promoted,
                RegistrationStatus.Waitlist -> {
                    val mappedStatus = when (status) {
                        RegistrationStatus.Registered -> "confirmed"
                        RegistrationStatus.Promoted -> "promoted"
                        RegistrationStatus.Waitlist -> "waitlisted"
                        else -> "confirmed"
                    }

                    gateway.executeFunction(
                        functionId = functionId,
                        payload = mapOf(
                            "action" to "addParticipant",
                            "eventId" to eventId,
                            "userLookup" to participantId,
                            "status" to mappedStatus
                        )
                    )
                }

                RegistrationStatus.Closed -> Unit
            }
        }
    }

    override fun isAdminEmail(email: String?): Boolean {
        return false
    }

    private suspend fun mapEventRow(
        eventRow: JsonObject,
        currentUserId: String,
        currentUserEmail: String?,
        fallbackDisplayName: String
    ): EventItem? {
        val eventId = eventRow.stringOrNull("\$id") ?: return null

        val registrations = gateway.listRows(
            tableId = configuration.eventRegistrationsTableId,
            queries = listOf(gateway.queryEqual("eventId", listOf(eventId)))
        )

        val activeRegistrations = registrations.filter {
            val status = normalizeStatus(it.stringOrNull("status"))
            status == "confirmed" || status == "promoted" || status == "waitlisted"
        }

        val registeredCount = activeRegistrations.count {
            val status = normalizeStatus(it.stringOrNull("status"))
            status == "confirmed" || status == "promoted"
        }
        val confirmedRegistrations = activeRegistrations.filter {
            val status = normalizeStatus(it.stringOrNull("status"))
            status == "confirmed" || status == "promoted"
        }
        val maleCount = confirmedRegistrations.count { it.stringOrNull("gender") == "male" }
        val femaleCount = confirmedRegistrations.count { it.stringOrNull("gender") == "female" }
        val waitingListCount = activeRegistrations.count {
            normalizeStatus(it.stringOrNull("status")) == "waitlisted"
        }

        val capacity = eventRow.intOrNull("maxParticipants") ?: 48
        val maleLimit = eventRow.intOrNull("maleLimit") ?: (capacity / 2).coerceAtLeast(1)
        val femaleLimit = eventRow.intOrNull("femaleLimit") ?: (capacity / 2).coerceAtLeast(1)

        val userRegistration = activeRegistrations.firstOrNull { row ->
            row.stringOrNull("userId") == currentUserId
        }

        val registrationStatus = mapRegistrationStatus(userRegistration?.stringOrNull("status"))
        val userState = when {
            registrationStatus == RegistrationStatus.Registered -> EventUserState.Registered
            registrationStatus == RegistrationStatus.Promoted -> EventUserState.Promoted
            registrationStatus == RegistrationStatus.Waitlist -> EventUserState.Waitlist
            registeredCount >= capacity -> EventUserState.Closed
            else -> EventUserState.NotRegistered
        }

        val participants = activeRegistrations.map { row ->
            val participantUserId = row.stringOrNull("userId")
                ?: row.stringOrNull("userid")
                ?: gateway.randomIdentifier()

            EventParticipant(
                id = participantUserId,
                displayName = resolveParticipantDisplayName(participantUserId, fallbackDisplayName),
                status = mapRegistrationStatus(row.stringOrNull("status")),
                gender = row.stringOrNull("gender")
            )
        }

        val role = resolveRole(eventRow, currentUserId, currentUserEmail)

        return EventItem(
            id = eventId,
            title = eventRow.stringOrNull("title") ?: "Evento Fyre",
            dateText = formatDate(eventRow.stringOrNull("startsAt")),
            place = resolveEventPlace(eventRow),
            description = eventRow.stringOrNull("description") ?: "Dettagli in aggiornamento",
            rules = parseRules(eventRow["rules"]),
            registrationStatus = registrationStatus,
            userState = userState,
            userRole = role,
            capacity = capacity,
            registeredCount = registeredCount,
            maleLimit = maleLimit,
            femaleLimit = femaleLimit,
            maleCount = maleCount,
            femaleCount = femaleCount,
            waitingListCount = waitingListCount,
            participants = participants,
            deadlineText = formatDate(eventRow.stringOrNull("registrationClosesAt")),
            cancellationDeadlineText = formatDate(eventRow.stringOrNull("cancellationClosesAt")),
            adminEmails = eventRow.stringOrNull("adminEmails").orEmpty(),
            liveMetrics = LiveMetrics(
                viewersOnline = eventRow.intOrNull("viewersOnline") ?: (registeredCount * 2),
                checkIns = eventRow.intOrNull("checkIns") ?: registeredCount,
                chatPerMinute = eventRow.intOrNull("chatPerMinute") ?: (registeredCount / 2)
            ),
            backendEventId = eventId,
            syncStatus = EventSyncStatus.Synced
        )
    }

    private fun resolveEventPlace(eventRow: JsonObject): String {
        val backendPlace = listOf(
            "place",
            "location",
            "venue",
            "venueName",
            "club",
            "clubName"
        ).firstNotNullOfOrNull { key ->
            eventRow.stringOrNull(key)?.takeUnless { it.isPlaceholderPlace() }
        }

        return backendPlace ?: DefaultMainEventVenue
    }

    private suspend fun resolveParticipantDisplayName(userId: String, fallback: String): String {
        val profile = gateway.fetchProfileRow(userId)
        val firstName = profile?.stringOrNull("firstName")
        val lastName = profile?.stringOrNull("lastName")
        val email = profile?.stringOrNull("email")

        val fullName = listOfNotNull(firstName, lastName)
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .joinToString(" ")
        if (fullName.isNotBlank()) return fullName

        val prefix = email?.substringBefore("@")?.trim()
        if (!prefix.isNullOrBlank()) return prefix

        return fallback
    }

    private fun resolveRole(
        eventRow: JsonObject,
        currentUserId: String,
        currentUserEmail: String?
    ): EventUserRole {
        val adminUserIds = parseCsv(eventRow.stringOrNull("adminUserIds"))
        val adminEmails = parseCsv(eventRow.stringOrNull("adminEmails")).map { it.lowercase() }

        val isAdmin = adminUserIds.contains(currentUserId) ||
            (!currentUserEmail.isNullOrBlank() && adminEmails.contains(currentUserEmail))

        return if (isAdmin) EventUserRole.Admin else EventUserRole.Participant
    }

    private fun parseRules(value: JsonElement?): List<String> {
        if (value == null || value.isJsonNull) {
            return listOf("Rispetta le linee guida dell'evento")
        }

        if (value.isJsonArray) {
            val fromArray = value.asJsonArray.mapNotNull { element ->
                if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                    element.asString.trim().takeIf { it.isNotBlank() }
                } else {
                    null
                }
            }
            if (fromArray.isNotEmpty()) {
                return fromArray
            }
        }

        val text = if (value.isJsonPrimitive && value.asJsonPrimitive.isString) value.asString else ""
        val parsed = text
            .split(',', '|', '\n')
            .map { it.trim() }
            .filter { it.isNotBlank() }

        return parsed.ifEmpty { listOf("Rispetta le linee guida dell'evento") }
    }

    private fun parseCsv(value: String?): List<String> {
        if (value.isNullOrBlank()) return emptyList()
        return value.split(',', '\n', '|').map { it.trim() }.filter { it.isNotBlank() }
    }

    private fun mapRegistrationStatus(raw: String?): RegistrationStatus {
        return when (normalizeStatus(raw)) {
            "confirmed" -> RegistrationStatus.Registered
            "promoted" -> RegistrationStatus.Promoted
            "waitlisted" -> RegistrationStatus.Waitlist
            "closed" -> RegistrationStatus.Closed
            else -> RegistrationStatus.NotRegistered
        }
    }

    private fun normalizeStatus(raw: String?): String {
        return raw?.trim()?.lowercase().orEmpty()
    }

    private fun normalizeDateTime(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isBlank()) return gateway.nowIso()

        val patterns = listOf(
            "dd/MM/yyyy HH:mm",
            "yyyy-MM-dd HH:mm",
            "yyyy-MM-dd'T'HH:mm:ss'Z'"
        )

        for (pattern in patterns) {
            runCatching {
                val formatter = DateTimeFormatter.ofPattern(pattern)
                val parsed = LocalDateTime.parse(trimmed, formatter)
                return parsed.toInstant(ZoneOffset.UTC).toString()
            }
        }

        return runCatching { Instant.parse(trimmed).toString() }
            .getOrElse { gateway.nowIso() }
    }

    private fun formatDate(raw: String?): String {
        if (raw.isNullOrBlank()) return "-"
        val timestamp = runCatching { Instant.parse(raw).toEpochMilli() }.getOrNull()
            ?: return raw

        return SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.ITALY).format(Date(timestamp))
    }

    private fun String.isPlaceholderPlace(): Boolean {
        val normalized = trim().lowercase(Locale.ROOT)
        return normalized == "location da definire" ||
            normalized == "luogo da definire" ||
            normalized == "da definire" ||
            normalized == "tbd"
    }

    private companion object {
        private const val DefaultMainEventVenue = "EVENT_VENUE_REDACTED"
    }
}
