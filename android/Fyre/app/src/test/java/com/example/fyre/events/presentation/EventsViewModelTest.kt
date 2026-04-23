package com.example.fyre.events.presentation

import com.example.fyre.events.data.MockEventsRepository
import com.example.fyre.events.model.EventUserState
import com.example.fyre.events.model.RegistrationStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class EventsViewModelTest {

    @Before
    fun setup() {
        MockEventsRepository.resetSeed()
    }

    @Test
    fun open_event_selects_detail_item() {
        val viewModel = EventsViewModel(autoSimulateMetrics = false)

        viewModel.openEvent("ev2")

        val selected = viewModel.selectedEvent()
        assertNotNull(selected)
        assertEquals("ev2", selected?.id)
    }

    @Test
    fun update_registration_for_selected_changes_status() {
        val viewModel = EventsViewModel(autoSimulateMetrics = false)
        viewModel.openEvent("ev1")

        viewModel.updateRegistrationForSelected(RegistrationStatus.Registered)

        val selected = viewModel.selectedEvent()
        assertEquals(RegistrationStatus.Registered, selected?.registrationStatus)
    }

    @Test
    fun join_and_cancel_update_user_state() {
        val viewModel = EventsViewModel(autoSimulateMetrics = false)
        viewModel.openEvent("ev2")

        viewModel.joinSelected()
        assertEquals(EventUserState.Registered, viewModel.selectedEvent()?.userState)

        viewModel.cancelSelected()
        assertEquals(EventUserState.NotRegistered, viewModel.selectedEvent()?.userState)
    }

    @Test
    fun waitlist_selected_sets_waitlist_state() {
        val viewModel = EventsViewModel(autoSimulateMetrics = false)
        viewModel.openEvent("ev3")

        viewModel.waitlistSelected()

        assertEquals(EventUserState.Waitlist, viewModel.selectedEvent()?.userState)
    }

    @Test
    fun admin_controls_are_disabled_for_non_admin_user() {
        val viewModel = EventsViewModel(
            currentUserEmail = "user@example.com",
            autoSimulateMetrics = false
        )
        viewModel.openEvent("ev1")

        val changed = viewModel.adminUpdateSelectedEvent(
            title = "Titolo nuovo",
            dateText = "01/01/2027",
            place = "Roma",
            description = "Desc",
            deadlineText = "31/12/2026",
            capacity = 50,
            rules = listOf("Rule")
        )

        assertFalse(changed)
        assertFalse(viewModel.canShowAdminSection())
    }

    @Test
    fun admin_controls_are_enabled_for_admin_user() {
        val viewModel = EventsViewModel(
            currentUserEmail = "admin@example.com",
            autoSimulateMetrics = false
        )
        viewModel.openEvent("ev1")

        val changed = viewModel.adminUpdateSelectedEvent(
            title = "Evento Admin Edit",
            dateText = "24/04/2026 19:30",
            place = "Milano",
            description = "Nuova descrizione",
            deadlineText = "23/04/2026 23:59",
            capacity = 88,
            rules = listOf("Regola 1")
        )

        assertTrue(changed)
        assertTrue(viewModel.canShowAdminSection())
        assertEquals("Evento Admin Edit", viewModel.selectedEvent()?.title)
    }
}
