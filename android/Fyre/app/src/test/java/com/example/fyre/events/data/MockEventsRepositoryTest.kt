package com.example.fyre.events.data

import com.example.fyre.events.model.RegistrationStatus
import org.junit.Assert.assertEquals
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
}

