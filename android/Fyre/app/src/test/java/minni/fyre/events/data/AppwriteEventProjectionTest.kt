package minni.fyre.events.data

import minni.fyre.data.appwrite.AppwriteConfigurationException
import minni.fyre.events.model.EventUserRole
import com.google.gson.JsonArray
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AppwriteEventProjectionTest {
    @Test
    fun `event projection uses server counters and deadlines`() {
        val row = JsonObject().apply {
            addProperty("maleCount", 17)
            addProperty("femaleCount", 19)
            addProperty("waitingListCount", 4)
            addProperty("registrationClosesAt", "2026-08-19T20:00:00Z")
            addProperty("cancellationClosesAt", "2026-08-18T20:00:00Z")
        }

        val projection = eventServerProjection(row)

        assertEquals(17, projection.maleCount)
        assertEquals(19, projection.femaleCount)
        assertEquals(36, projection.registeredCount)
        assertEquals(4, projection.waitingListCount)
        assertEquals(Instant.parse("2026-08-19T20:00:00Z"), projection.registrationClosesAt)
        assertEquals(Instant.parse("2026-08-18T20:00:00Z"), projection.cancellationClosesAt)
    }

    @Test
    fun `event projection never invents missing server data`() {
        val projection = eventServerProjection(JsonObject())

        assertEquals(0, projection.maleCount)
        assertEquals(0, projection.femaleCount)
        assertEquals(0, projection.waitingListCount)
        assertNull(projection.registrationClosesAt)
        assertNull(projection.cancellationClosesAt)
    }

    @Test
    fun `only an explicit authenticated bootstrap grants admin`() {
        val event = JsonObject().apply { addProperty("\$id", "event-1") }
        val authorized = JsonObject().apply {
            addProperty("isAdmin", true)
            add("event", event)
        }
        val localEmailOnly = JsonObject().apply {
            addProperty("email", "admin@example.com")
            add("event", event)
        }

        assertEquals(EventUserRole.Admin, eventRoleFromAdminBootstrap(authorized, "event-1"))
        assertEquals(EventUserRole.Participant, eventRoleFromAdminBootstrap(localEmailOnly, "event-1"))
        assertEquals(EventUserRole.Participant, eventRoleFromAdminBootstrap(authorized, "other-event"))
    }

    @Test
    fun `admin update payload cannot mutate authorization scope`() {
        val payload = eventAdminUpdatePayload(
            eventId = "event-1",
            title = "Event",
            startsAt = "2026-08-20T20:00:00Z",
            place = "Venue",
            description = "Description",
            registrationClosesAt = "2026-08-19T20:00:00Z",
            cancellationClosesAt = "2026-08-18T20:00:00Z",
            capacity = 48,
            maleLimit = 24,
            femaleLimit = 24,
            rules = listOf("Rule")
        )

        assertEquals("updateEvent", payload["action"])
        assertEquals(false, payload.keys.any { it.contains("admin", ignoreCase = true) })
    }

    @Test
    fun `admin removal forwards the function registration id directly`() {
        val payload = eventAdminRemoveParticipantPayload("event-1", "registration-42")

        assertEquals("removeParticipant", payload["action"])
        assertEquals("event-1", payload["eventId"])
        assertEquals("registration-42", payload["registrationId"])
        assertEquals(false, payload.containsKey("userId"))
    }

    @Test
    fun `admin dates use the Rome timezone including daylight saving time`() {
        assertEquals(
            "2026-07-21T19:00:00Z",
            normalizeRequiredEventDateTime("21/07/2026 21:00")
        )
        assertEquals(
            "2026-01-21T20:00:00Z",
            normalizeRequiredEventDateTime("21/01/2026 21:00")
        )
    }

    @Test
    fun `optional admin deadlines stay null and invalid dates fail closed`() {
        assertNull(normalizeOptionalEventDateTime("  "))
        assertNull(normalizeOptionalEventDateTime("-"))
        assertTrue(runCatching { normalizeRequiredEventDateTime("") }.isFailure)
        assertTrue(runCatching { normalizeOptionalEventDateTime("31/02/2026 21:00") }.isFailure)
    }

    @Test
    fun `admin payload preserves explicit null deadlines`() {
        val payload = eventAdminUpdatePayload(
            eventId = "event-1",
            title = "Event",
            startsAt = "2026-08-20T20:00:00Z",
            place = "Venue",
            description = "Description",
            registrationClosesAt = null,
            cancellationClosesAt = null,
            capacity = 48,
            maleLimit = 24,
            femaleLimit = 24,
            rules = emptyList()
        )

        assertTrue(payload.containsKey("registrationClosesAt"))
        assertTrue(payload.containsKey("cancellationClosesAt"))
        assertNull(payload["registrationClosesAt"])
        assertNull(payload["cancellationClosesAt"])
    }

    @Test
    fun `admin participant pages are merged without dropping rows`() {
        val accumulator = EventAdminParticipantPageAccumulator()
        val firstIds = (1..100).map { index -> "registration-$index" }

        assertEquals("registration-100", accumulator.append(adminParticipantPage(firstIds, "registration-100")))
        assertNull(accumulator.append(adminParticipantPage(listOf("registration-101"), null)))

        val participants = accumulator.mergedPage().getAsJsonArray("participants")
        assertEquals(101, participants.size())
        assertEquals("registration-1", participants.first().asJsonObject["registrationId"].asString)
        assertEquals("registration-101", participants.last().asJsonObject["registrationId"].asString)
    }

    @Test
    fun `admin participant pagination rejects a repeated cursor`() {
        val accumulator = EventAdminParticipantPageAccumulator()

        accumulator.append(adminParticipantPage(emptyList(), "repeated-cursor"))

        assertThrows(AppwriteConfigurationException::class.java) {
            accumulator.append(adminParticipantPage(emptyList(), "repeated-cursor"))
        }
    }

    private fun adminParticipantPage(registrationIds: List<String>, nextCursor: String?): JsonObject {
        return JsonObject().apply {
            add("participants", JsonArray().apply {
                registrationIds.forEach { registrationId ->
                    add(JsonObject().apply { addProperty("registrationId", registrationId) })
                }
            })
            add("participantPage", JsonObject().apply {
                if (nextCursor == null) {
                    add("nextCursor", JsonNull.INSTANCE)
                } else {
                    addProperty("nextCursor", nextCursor)
                }
            })
        }
    }
}
