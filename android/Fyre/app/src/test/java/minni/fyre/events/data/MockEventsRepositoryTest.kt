package minni.fyre.events.data

import minni.fyre.events.model.EventUserRole
import minni.fyre.events.model.EventUserState
import minni.fyre.events.model.RegistrationStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MockEventsRepositoryTest {

    @Before
    fun setup() {
        MockEventsRepository.resetSeed()
    }

    @Test
    fun seed_events_have_required_fields() {
        val events = MockEventsRepository.getEvents()

        assertTrue(events.isNotEmpty())
        events.forEach { event ->
            assertTrue(event.title.isNotBlank())
            assertTrue(event.dateText.isNotBlank())
            assertTrue(event.place.isNotBlank())
            assertTrue(event.description.isNotBlank())
            assertTrue(event.rules.isNotEmpty())
            assertTrue(event.capacity > 0)
            assertTrue(event.deadlineText.isNotBlank())
        }
    }

    @Test
    fun update_registration_changes_status_and_capacity_count() {
        val before = MockEventsRepository.getEventById("ev1")
        val beforeCount = before?.registeredCount ?: 0

        MockEventsRepository.updateRegistrationStatus("ev1", RegistrationStatus.Registered)

        val after = MockEventsRepository.getEventById("ev1")
        assertEquals(RegistrationStatus.Registered, after?.registrationStatus)
        assertEquals(beforeCount + 1, after?.registeredCount)
    }

    @Test
    fun simulate_metrics_tick_increases_live_metrics() {
        val before = MockEventsRepository.getEventById("ev1") ?: return

        MockEventsRepository.simulateMetricsTick("ev1")

        val after = MockEventsRepository.getEventById("ev1") ?: return
        assertTrue(after.liveMetrics.viewersOnline > before.liveMetrics.viewersOnline)
        assertTrue(after.liveMetrics.checkIns >= before.liveMetrics.checkIns)
        assertTrue(after.liveMetrics.chatPerMinute > before.liveMetrics.chatPerMinute)
    }

    @Test
    fun user_state_is_waitlist_when_event_is_full_and_user_joins() {
        val userId = "u_new"
        val userName = "Nuovo"

        val updated = MockEventsRepository.adminUpdateEvent(
            eventId = "ev1",
            isAdminMock = true,
            title = "Aperitivo Tech Milano",
            dateText = "24/04/2026 19:30",
            place = "Navigli, Milano",
            description = "Networking serale tra developer, designer e founder.",
            deadlineText = "23/04/2026 23:59",
            capacity = 1,
            rules = listOf("Rule")
        )
        assertTrue(updated)

        MockEventsRepository.joinEvent("ev1", userId, userName)
        val event = MockEventsRepository.getEventByIdForUser("ev1", userId, userName)

        assertEquals(EventUserState.Waitlist, event?.userState)
    }

    @Test
    fun local_email_never_grants_admin_and_mock_flag_is_explicit() {
        val emailOnlyEvent = MockEventsRepository.getEventByIdForUser(
            eventId = "ev1",
            userId = "admin@example.com",
            displayName = "Admin-looking user"
        )
        val explicitMockAdminEvent = MockEventsRepository.getEventByIdForUser(
            eventId = "ev1",
            userId = "user@example.com",
            displayName = "Demo admin",
            mockAdminEnabled = true
        )

        assertEquals(EventUserRole.Participant, emailOnlyEvent?.userRole)
        assertEquals(EventUserRole.Admin, explicitMockAdminEvent?.userRole)
    }

    @Test
    fun admin_update_event_is_blocked_for_non_admin() {
        val before = MockEventsRepository.getEventById("ev2")

        val updated = MockEventsRepository.adminUpdateEvent(
            eventId = "ev2",
            isAdminMock = false,
            title = "Titolo non autorizzato",
            dateText = "xx",
            place = "yy",
            description = "zz",
            deadlineText = "dd",
            capacity = 2,
            rules = listOf("rule")
        )

        val after = MockEventsRepository.getEventById("ev2")
        assertFalse(updated)
        assertEquals(before?.title, after?.title)
    }
}
