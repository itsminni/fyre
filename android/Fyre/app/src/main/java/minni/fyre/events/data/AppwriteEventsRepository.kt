package minni.fyre.events.data

import minni.fyre.data.appwrite.AppwriteConfiguration
import minni.fyre.data.appwrite.AppwriteConfigurationException
import minni.fyre.data.appwrite.AppwriteApiException
import minni.fyre.data.appwrite.AppwriteGateway
import minni.fyre.data.appwrite.booleanOrNull
import minni.fyre.data.appwrite.intOrNull
import minni.fyre.data.appwrite.stringOrNull
import minni.fyre.events.model.EventItem
import minni.fyre.events.model.EventParticipant
import minni.fyre.events.model.EventSyncStatus
import minni.fyre.events.model.EventUserRole
import minni.fyre.events.model.EventUserState
import minni.fyre.events.model.LiveMetrics
import minni.fyre.events.model.RegistrationStatus
import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle
import java.util.Locale

internal data class EventServerProjection(
    val maleCount: Int,
    val femaleCount: Int,
    val waitingListCount: Int,
    val registrationClosesAt: Instant?,
    val cancellationClosesAt: Instant?
) {
    val registeredCount: Int = maleCount + femaleCount
}

internal fun eventServerProjection(eventRow: JsonObject): EventServerProjection {
    return EventServerProjection(
        maleCount = (eventRow.intOrNull("maleCount") ?: 0).coerceAtLeast(0),
        femaleCount = (eventRow.intOrNull("femaleCount") ?: 0).coerceAtLeast(0),
        waitingListCount = (eventRow.intOrNull("waitingListCount") ?: 0).coerceAtLeast(0),
        registrationClosesAt = eventRow.stringOrNull("registrationClosesAt")?.let(::parseEventInstant),
        cancellationClosesAt = eventRow.stringOrNull("cancellationClosesAt")?.let(::parseEventInstant)
    )
}

internal fun eventRoleFromAdminBootstrap(payload: JsonObject?, eventId: String): EventUserRole {
    if (payload?.booleanOrNull("isAdmin") != true) return EventUserRole.Participant
    val event = payload.get("event")
        ?.takeIf { it.isJsonObject }
        ?.asJsonObject
        ?: return EventUserRole.Participant
    val responseEventId = event.stringOrNull("\$id") ?: event.stringOrNull("eventId")
    return if (responseEventId == eventId) EventUserRole.Admin else EventUserRole.Participant
}

internal fun eventAdminUpdatePayload(
    eventId: String,
    title: String,
    startsAt: String,
    place: String,
    description: String,
    registrationClosesAt: String?,
    cancellationClosesAt: String?,
    capacity: Int,
    maleLimit: Int,
    femaleLimit: Int,
    rules: List<String>
): Map<String, Any?> = mapOf(
    "action" to "updateEvent",
    "eventId" to eventId,
    "title" to title,
    "startsAt" to startsAt,
    "maxParticipants" to capacity.coerceAtLeast(2),
    "maleLimit" to maleLimit.coerceAtLeast(0),
    "femaleLimit" to femaleLimit.coerceAtLeast(0),
    "registrationClosesAt" to registrationClosesAt,
    "cancellationClosesAt" to cancellationClosesAt,
    "place" to place.trim(),
    "description" to description.trim(),
    "rules" to rules.map { it.trim() }.filter { it.isNotBlank() }
)

internal fun eventAdminRemoveParticipantPayload(
    eventId: String,
    registrationId: String
): Map<String, Any?> = mapOf(
    "action" to "removeParticipant",
    "eventId" to eventId,
    "registrationId" to registrationId
)

private const val EVENT_ADMIN_PARTICIPANT_PAGE_SIZE = 100
private const val MAX_EVENT_ADMIN_PARTICIPANTS = 1_000
private const val MAX_EVENT_ADMIN_PARTICIPANT_PAGES =
    MAX_EVENT_ADMIN_PARTICIPANTS / EVENT_ADMIN_PARTICIPANT_PAGE_SIZE

internal class EventAdminParticipantPageAccumulator {
    private val participants = JsonArray()
    private val seenCursors = mutableSetOf<String>()
    private var firstPage: JsonObject? = null

    fun append(page: JsonObject): String? {
        val pageRows = page.get("participants")
            ?.takeIf { it.isJsonArray }
            ?.asJsonArray
            ?: throw AppwriteConfigurationException("Risposta partecipanti admin non valida")

        if (participants.size() + pageRows.size() > MAX_EVENT_ADMIN_PARTICIPANTS) {
            throw AppwriteConfigurationException("Limite partecipanti admin superato")
        }
        if (firstPage == null) {
            firstPage = page.deepCopy()
        }
        pageRows.forEach { participant -> participants.add(participant.deepCopy()) }

        val pageMetadataElement = page.get("participantPage") ?: return null
        if (!pageMetadataElement.isJsonObject) {
            throw AppwriteConfigurationException("Paginazione partecipanti admin non valida")
        }
        val nextCursorElement = pageMetadataElement.asJsonObject.get("nextCursor") ?: return null
        if (nextCursorElement.isJsonNull) return null
        val nextCursor = pageMetadataElement.asJsonObject.stringOrNull("nextCursor")
            ?: throw AppwriteConfigurationException("Paginazione partecipanti admin non valida")

        if (
            participants.size() >= MAX_EVENT_ADMIN_PARTICIPANTS
            || !seenCursors.add(nextCursor)
        ) {
            throw AppwriteConfigurationException("Paginazione partecipanti admin non valida")
        }
        return nextCursor
    }

    fun mergedPage(): JsonObject {
        val merged = firstPage?.deepCopy()
            ?: throw AppwriteConfigurationException("Risposta partecipanti admin non valida")
        merged.add("participants", participants.deepCopy())
        return merged
    }
}

private fun parseEventInstant(rawValue: String): Instant? {
    return runCatching { Instant.parse(rawValue) }.getOrNull()
}

class AppwriteEventsRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration
) : EventsRepository {

    override suspend fun getEventsForUser(
        userId: String,
        displayName: String
    ): Result<List<EventItem>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val eventRows = gateway.listRows(
                tableId = configuration.eventsTableId,
                queries = listOf(gateway.queryOrderAsc("startsAt"))
            )

            eventRows.mapNotNull { eventRow ->
                val eventId = eventRow.stringOrNull("\$id")
                val adminBootstrap = eventId?.let { fetchEventAdminStateIfAuthorized(it) }
                mapEventRow(
                    eventRow = eventRow,
                    currentUserId = currentUserId,
                    fallbackDisplayName = displayName,
                    adminBootstrap = adminBootstrap
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
        cancellationDeadlineText: String
    ): Result<Unit> {
        return runCatching {
            val functionId = configuration.eventAdminFunctionId
                ?: throw AppwriteConfigurationException("Funzione admin evento non configurata")

            val startsAt = normalizeRequiredEventDateTime(dateText)
            val deadline = normalizeOptionalEventDateTime(deadlineText)
            val cancellationDeadline = normalizeOptionalEventDateTime(cancellationDeadlineText)

            gateway.executeFunction(
                functionId = functionId,
                payload = eventAdminUpdatePayload(
                    eventId = eventId,
                    title = title,
                    startsAt = startsAt,
                    place = place,
                    description = description,
                    registrationClosesAt = deadline,
                    cancellationClosesAt = cancellationDeadline,
                    capacity = capacity,
                    maleLimit = maleLimit,
                    femaleLimit = femaleLimit,
                    rules = rules
                )
            )
        }
    }

    override suspend fun adminSetParticipantStatus(
        eventId: String,
        participantId: String,
        registrationId: String?,
        status: RegistrationStatus
    ): Result<Unit> {
        return runCatching {
            val functionId = configuration.eventAdminFunctionId
                ?: throw AppwriteConfigurationException("Funzione admin evento non configurata")

            when (status) {
                RegistrationStatus.NotRegistered -> {
                    val canonicalRegistrationId = registrationId
                        ?.trim()
                        ?.takeIf { it.isNotBlank() }
                        ?: throw AppwriteConfigurationException("Registrazione partecipante non disponibile")

                    gateway.executeFunction(
                        functionId = functionId,
                        payload = eventAdminRemoveParticipantPayload(eventId, canonicalRegistrationId)
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

    private suspend fun mapEventRow(
        eventRow: JsonObject,
        currentUserId: String,
        fallbackDisplayName: String,
        adminBootstrap: JsonObject?
    ): EventItem? {
        val eventId = eventRow.stringOrNull("\$id") ?: return null

        val registrations = gateway.listRows(
            tableId = configuration.eventRegistrationsTableId,
            queries = listOf(
                gateway.queryEqual("eventId", listOf(eventId)),
                gateway.queryEqual("userId", listOf(currentUserId))
            )
        )

        val activeRegistrations = registrations.filter {
            val status = normalizeStatus(it.stringOrNull("status"))
            status == "confirmed" || status == "promoted" || status == "waitlisted"
        }

        val serverProjection = eventServerProjection(eventRow)
        val registeredCount = serverProjection.registeredCount

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

        val userParticipants = activeRegistrations.map { row ->
            val participantUserId = row.stringOrNull("userId")
                ?: row.stringOrNull("userid")
                ?: gateway.randomIdentifier()

            EventParticipant(
                id = participantUserId,
                displayName = fallbackDisplayName,
                status = mapRegistrationStatus(row.stringOrNull("status")),
                gender = row.stringOrNull("gender"),
                registrationId = row.stringOrNull("\$id")
            )
        }

        val role = eventRoleFromAdminBootstrap(adminBootstrap, eventId)
        val participants = if (role == EventUserRole.Admin) {
            parseAdminParticipants(adminBootstrap).ifEmpty { userParticipants }
        } else {
            userParticipants
        }

        return EventItem(
            id = eventId,
            title = eventRow.stringOrNull("title") ?: "Evento Fyre",
            dateText = formatDate(eventRow.stringOrNull("startsAt")),
            place = eventRow.stringOrNull("place").orEmpty(),
            description = eventRow.stringOrNull("description").orEmpty(),
            rules = parseRules(eventRow["rules"]),
            registrationStatus = registrationStatus,
            userState = userState,
            userRole = role,
            capacity = capacity,
            registeredCount = registeredCount,
            maleLimit = maleLimit,
            femaleLimit = femaleLimit,
            maleCount = serverProjection.maleCount,
            femaleCount = serverProjection.femaleCount,
            waitingListCount = serverProjection.waitingListCount,
            participants = participants,
            deadlineText = formatDate(eventRow.stringOrNull("registrationClosesAt")),
            cancellationDeadlineText = formatDate(eventRow.stringOrNull("cancellationClosesAt")),
            liveMetrics = LiveMetrics(
                viewersOnline = eventRow.intOrNull("viewersOnline") ?: (registeredCount * 2),
                checkIns = eventRow.intOrNull("checkIns") ?: registeredCount,
                chatPerMinute = eventRow.intOrNull("chatPerMinute") ?: (registeredCount / 2)
            ),
            backendEventId = eventId,
            syncStatus = EventSyncStatus.Synced,
            startsAt = eventRow.stringOrNull("startsAt")?.let { rawValue ->
                runCatching { Instant.parse(rawValue) }.getOrNull()
            },
            registrationClosesAt = serverProjection.registrationClosesAt,
            cancellationClosesAt = serverProjection.cancellationClosesAt
        )
    }

    private suspend fun fetchEventAdminStateIfAuthorized(eventId: String): JsonObject? {
        val functionId = configuration.eventAdminFunctionId ?: return null
        return try {
            val accumulator = EventAdminParticipantPageAccumulator()
            var participantCursor: String? = null

            repeat(MAX_EVENT_ADMIN_PARTICIPANT_PAGES) {
                val payload = buildMap<String, Any?> {
                    put("action", "fetch")
                    put("eventId", eventId)
                    put("participantLimit", EVENT_ADMIN_PARTICIPANT_PAGE_SIZE)
                    participantCursor?.let { cursor -> put("participantCursor", cursor) }
                }
                val response = gateway.executeFunction(
                    functionId = functionId,
                    payload = payload
                )
                if (eventRoleFromAdminBootstrap(response, eventId) != EventUserRole.Admin) {
                    return null
                }

                participantCursor = accumulator.append(response)
                if (participantCursor == null) {
                    return accumulator.mergedPage()
                }
            }

            throw AppwriteConfigurationException("Paginazione partecipanti admin non valida")
        } catch (api: AppwriteApiException) {
            if (api.statusCode == 401 || api.statusCode == 403 || api.statusCode == 404) {
                null
            } else {
                throw api
            }
        }
    }

    private fun parseAdminParticipants(payload: JsonObject?): List<EventParticipant> {
        val rows = payload?.get("participants")
            ?.takeIf { it.isJsonArray }
            ?.asJsonArray
            ?: return emptyList()

        return rows.mapNotNull { element ->
            if (!element.isJsonObject) return@mapNotNull null
            val row = element.asJsonObject
            val userId = row.stringOrNull("userId") ?: return@mapNotNull null
            EventParticipant(
                id = userId,
                displayName = row.stringOrNull("displayName") ?: userId,
                status = mapRegistrationStatus(row.stringOrNull("status")),
                gender = row.stringOrNull("gender"),
                registrationId = row.stringOrNull("registrationId")
            )
        }
    }

    private fun parseRules(value: JsonElement?): List<String> {
        if (value == null || value.isJsonNull) {
            return emptyList()
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

        return parsed
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

    private fun formatDate(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val instant = runCatching { Instant.parse(raw) }.getOrNull() ?: return raw
        return EventDisplayFormatter.format(instant)
    }

}

private val EventTimeZone: ZoneId = ZoneId.of("Europe/Rome")
private val EventDisplayFormatter: DateTimeFormatter = DateTimeFormatter
    .ofPattern("dd/MM/uuuu HH:mm", Locale.ITALY)
    .withZone(EventTimeZone)
private val EventLocalDateTimeFormatters: List<DateTimeFormatter> = listOf(
    DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm", Locale.ITALY),
    DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm", Locale.ROOT),
    DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss", Locale.ROOT)
).map { formatter -> formatter.withResolverStyle(ResolverStyle.STRICT) }

internal fun normalizeRequiredEventDateTime(raw: String): String {
    return normalizeEventDateTime(raw)
        ?: throw AppwriteConfigurationException("Data e ora evento non valide")
}

internal fun normalizeOptionalEventDateTime(raw: String): String? {
    val trimmed = raw.trim()
    if (trimmed.isBlank() || trimmed == "-") return null
    return normalizeEventDateTime(trimmed)
        ?: throw AppwriteConfigurationException("Data e ora limite non valide")
}

private fun normalizeEventDateTime(raw: String): String? {
    val trimmed = raw.trim()
    if (trimmed.isBlank()) return null

    runCatching { Instant.parse(trimmed) }
        .getOrNull()
        ?.let { instant -> return instant.toString() }

    EventLocalDateTimeFormatters.forEach { formatter ->
        runCatching { LocalDateTime.parse(trimmed, formatter) }
            .getOrNull()
            ?.let { localDateTime ->
                return localDateTime.atZone(EventTimeZone).toInstant().toString()
            }
    }
    return null
}
