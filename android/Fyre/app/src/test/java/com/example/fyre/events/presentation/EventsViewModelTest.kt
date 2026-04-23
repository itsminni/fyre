package com.example.fyre.events.presentation

import com.example.fyre.events.data.MockEventsRepository
import com.example.fyre.events.model.EventUserState
import com.example.fyre.events.model.RegistrationStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EventsViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
        MockEventsRepository.resetSeed()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun open_event_selects_detail_item() = runTest {
        val viewModel = EventsViewModel(autoSimulateMetrics = false)
        advanceUntilIdle()

        viewModel.openEvent("ev2")
        advanceUntilIdle()

        val selected = viewModel.selectedEvent()
        assertNotNull(selected)
        assertEquals("ev2", selected?.id)
    }

    @Test
    fun update_registration_for_selected_changes_status() = runTest {
        val viewModel = EventsViewModel(autoSimulateMetrics = false)
        advanceUntilIdle()
        viewModel.openEvent("ev1")
        advanceUntilIdle()

        viewModel.updateRegistrationForSelected(RegistrationStatus.Registered)
        advanceUntilIdle()

        val selected = viewModel.selectedEvent()
        assertEquals(RegistrationStatus.Registered, selected?.registrationStatus)
    }

    @Test
    fun join_and_cancel_update_user_state() = runTest {
        val viewModel = EventsViewModel(autoSimulateMetrics = false)
        advanceUntilIdle()
        viewModel.openEvent("ev2")
        advanceUntilIdle()

        viewModel.joinSelected()
        advanceUntilIdle()
        assertEquals(EventUserState.Registered, viewModel.selectedEvent()?.userState)

        viewModel.cancelSelected()
        advanceUntilIdle()
        assertEquals(EventUserState.NotRegistered, viewModel.selectedEvent()?.userState)
    }

    @Test
    fun waitlist_selected_sets_waitlist_state() = runTest {
        val viewModel = EventsViewModel(autoSimulateMetrics = false)
        advanceUntilIdle()
        viewModel.openEvent("ev3")
        advanceUntilIdle()

        viewModel.waitlistSelected()
        advanceUntilIdle()

        assertEquals(EventUserState.Waitlist, viewModel.selectedEvent()?.userState)
    }

    @Test
    fun admin_controls_are_disabled_for_non_admin_user() = runTest {
        val viewModel = EventsViewModel(
            currentUserEmail = "user@example.com",
            autoSimulateMetrics = false
        )
        advanceUntilIdle()
        viewModel.openEvent("ev1")
        advanceUntilIdle()

        val changed = viewModel.adminUpdateSelectedEvent(
            title = "Titolo nuovo",
            dateText = "01/01/2027",
            place = "Roma",
            description = "Desc",
            deadlineText = "31/12/2026",
            capacity = 50,
            rules = listOf("Rule")
        )
        advanceUntilIdle()

        assertFalse(changed)
        assertFalse(viewModel.canShowAdminSection())
    }

    @Test
    fun admin_controls_are_enabled_for_admin_user() = runTest {
        val viewModel = EventsViewModel(
            currentUserEmail = "admin@example.com",
            autoSimulateMetrics = false
        )
        advanceUntilIdle()
        viewModel.openEvent("ev1")
        advanceUntilIdle()

        val changed = viewModel.adminUpdateSelectedEvent(
            title = "Evento Admin Edit",
            dateText = "24/04/2026 19:30",
            place = "Milano",
            description = "Nuova descrizione",
            deadlineText = "23/04/2026 23:59",
            capacity = 88,
            rules = listOf("Regola 1")
        )
        advanceUntilIdle()

        assertTrue(changed)
        assertTrue(viewModel.canShowAdminSection())
        assertEquals("Evento Admin Edit", viewModel.selectedEvent()?.title)
    }
}
