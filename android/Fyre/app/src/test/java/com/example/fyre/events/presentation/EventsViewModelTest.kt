package com.example.fyre.events.presentation

import com.example.fyre.events.data.MockEventsRepository
import com.example.fyre.events.model.RegistrationStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
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
}

