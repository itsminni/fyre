package minni.fyre.events.presentation

import minni.fyre.events.data.MockEventsDataRepository
import minni.fyre.events.data.MockEventsRepository
import minni.fyre.events.data.EventsRepository
import minni.fyre.events.model.EventUserState
import minni.fyre.events.model.RegistrationStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
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

    private fun viewModel(mockAdminEnabled: Boolean = false): EventsViewModel {
        return EventsViewModel(
            repository = MockEventsDataRepository(mockAdminEnabled = mockAdminEnabled),
            autoRefreshEvents = false
        )
    }

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
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.openEvent("ev2")
        advanceUntilIdle()

        val selected = viewModel.selectedEvent()
        assertNotNull(selected)
        assertEquals("ev2", selected?.id)
    }

    @Test
    fun update_registration_for_selected_changes_status() = runTest {
        val viewModel = viewModel()
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
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openEvent("ev2")
        advanceUntilIdle()

        viewModel.joinSelected()
        advanceUntilIdle()
        assertEquals(EventUserState.Registered, viewModel.selectedEvent()?.userState)

        var cancelledReminderEventId: String? = null
        viewModel.cancelSelected { event -> cancelledReminderEventId = event?.id }
        advanceUntilIdle()
        assertEquals(EventUserState.NotRegistered, viewModel.selectedEvent()?.userState)
        assertEquals("ev2", cancelledReminderEventId)
    }

    @Test
    fun join_completion_receives_refreshed_registration_state() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openEvent("ev2")
        advanceUntilIdle()
        var completedState: EventUserState? = null

        viewModel.joinSelected { refreshedEvent ->
            completedState = refreshedEvent?.userState
        }
        advanceUntilIdle()

        assertEquals(EventUserState.Registered, completedState)
    }

    @Test
    fun waitlist_selected_sets_waitlist_state() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openEvent("ev3")
        advanceUntilIdle()

        viewModel.waitlistSelected()
        advanceUntilIdle()

        assertEquals(EventUserState.Waitlist, viewModel.selectedEvent()?.userState)
    }

    @Test
    fun cancelling_waitlist_does_not_request_reminder_cancellation() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openEvent("ev3")
        advanceUntilIdle()
        viewModel.waitlistSelected()
        advanceUntilIdle()
        var reminderCancellationRequested = false

        viewModel.cancelSelected { event -> reminderCancellationRequested = event != null }
        advanceUntilIdle()

        assertFalse(reminderCancellationRequested)
    }

    @Test
    fun admin_controls_are_disabled_for_non_admin_user() = runTest {
        val viewModel = viewModel()
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
        val viewModel = viewModel(mockAdminEnabled = true)
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

    @Test
    fun event_mutations_are_single_flight_and_reject_double_submit() = runTest {
        val repository = GatedJoinEventsRepository()
        val viewModel = EventsViewModel(repository = repository, autoRefreshEvents = false)
        advanceUntilIdle()
        viewModel.openEvent("ev2")
        advanceUntilIdle()

        viewModel.joinSelected()
        viewModel.joinSelected()

        assertTrue(viewModel.isLoading.value)
        assertEquals(1, repository.joinCallCount)

        repository.joinGate.complete(Unit)
        advanceUntilIdle()

        assertFalse(viewModel.isLoading.value)
        assertEquals(EventUserState.Registered, viewModel.selectedEvent()?.userState)
    }

    private class GatedJoinEventsRepository(
        private val delegate: EventsRepository = MockEventsDataRepository()
    ) : EventsRepository by delegate {
        val joinGate = CompletableDeferred<Unit>()
        var joinCallCount: Int = 0
            private set

        override suspend fun joinEvent(
            eventId: String,
            userId: String,
            displayName: String
        ): Result<Unit> {
            joinCallCount += 1
            joinGate.await()
            return delegate.joinEvent(eventId, userId, displayName)
        }
    }
}
