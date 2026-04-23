package com.example.fyre.events.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.fyre.events.data.MockEventsRepository
import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.EventUserState
import com.example.fyre.events.model.RegistrationStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class EventsViewModel(
    private val repository: MockEventsRepository = MockEventsRepository,
    private val currentUserId: String = DEFAULT_USER_ID,
    private val currentUserDisplayName: String = DEFAULT_USER_NAME,
    private val currentUserEmail: String? = null,
    autoSimulateMetrics: Boolean = true
) : ViewModel() {
    companion object {
        private const val DEFAULT_USER_ID = "user_default"
        private const val DEFAULT_USER_NAME = "Utente"
    }

    private val _events = MutableStateFlow<List<EventItem>>(emptyList())
    val events: StateFlow<List<EventItem>> = _events.asStateFlow()

    private val _selectedEventId = MutableStateFlow<String?>(null)
    val selectedEventId: StateFlow<String?> = _selectedEventId.asStateFlow()

    private val _isAdminInMock = MutableStateFlow(repository.isAdminEmail(currentUserEmail))
    val isAdminInMock: StateFlow<Boolean> = _isAdminInMock.asStateFlow()

    init {
        refresh()
        if (autoSimulateMetrics) {
            viewModelScope.launch {
                while (isActive) {
                    delay(3000)
                    repository.simulateMetricsTick()
                    refresh()
                }
            }
        }
    }

    fun openEvent(eventId: String) {
        _selectedEventId.value = eventId
        repository.simulateMetricsTick(eventId)
        refresh()
    }

    fun closeEventDetail() {
        _selectedEventId.value = null
    }

    fun updateRegistrationForSelected(status: RegistrationStatus) {
        when (status) {
            RegistrationStatus.Registered -> joinSelected()
            RegistrationStatus.NotRegistered, RegistrationStatus.Closed -> cancelSelected()
            RegistrationStatus.Waitlist -> waitlistSelected()
        }
    }

    fun joinSelected() {
        val eventId = _selectedEventId.value ?: return
        repository.joinEvent(eventId, currentUserId, currentUserDisplayName)
        refresh()
    }

    fun cancelSelected() {
        val eventId = _selectedEventId.value ?: return
        repository.cancelEvent(eventId, currentUserId)
        refresh()
    }

    fun waitlistSelected() {
        val eventId = _selectedEventId.value ?: return
        repository.waitlistEvent(eventId, currentUserId, currentUserDisplayName)
        refresh()
    }

    fun adminUpdateSelectedEvent(
        title: String,
        dateText: String,
        place: String,
        description: String,
        deadlineText: String,
        capacity: Int,
        rules: List<String>
    ): Boolean {
        val eventId = _selectedEventId.value ?: return false
        val updated = repository.adminUpdateEvent(
            eventId = eventId,
            isAdminMock = _isAdminInMock.value,
            title = title,
            dateText = dateText,
            place = place,
            description = description,
            deadlineText = deadlineText,
            capacity = capacity,
            rules = rules
        )
        if (updated) refresh()
        return updated
    }

    fun adminSetParticipantStatus(participantId: String, status: RegistrationStatus): Boolean {
        val eventId = _selectedEventId.value ?: return false
        val updated = repository.adminSetParticipantStatus(
            eventId = eventId,
            isAdminMock = _isAdminInMock.value,
            participantId = participantId,
            status = status
        )
        if (updated) refresh()
        return updated
    }

    fun canShowAdminSection(): Boolean = _isAdminInMock.value

    fun canJoinSelected(): Boolean {
        return when (selectedEvent()?.userState) {
            EventUserState.NotRegistered,
            EventUserState.Waitlist -> true
            EventUserState.Registered,
            EventUserState.Closed,
            null -> false
        }
    }

    fun canCancelSelected(): Boolean {
        return when (selectedEvent()?.userState) {
            EventUserState.Registered,
            EventUserState.Waitlist -> true
            EventUserState.NotRegistered,
            EventUserState.Closed,
            null -> false
        }
    }

    fun canWaitlistSelected(): Boolean = selectedEvent()?.userState == EventUserState.NotRegistered

    fun currentUserEventStateLabel(): String = selectedEvent()?.userState?.name ?: "NotRegistered"

    fun selectedEvent(): EventItem? {
        val eventId = _selectedEventId.value ?: return null
        return _events.value.firstOrNull { it.id == eventId }
    }

    fun tickSelectedMetrics() {
        val eventId = _selectedEventId.value ?: return
        repository.simulateMetricsTick(eventId)
        refresh()
    }

    private fun refresh() {
        _events.value = repository.getEventsForUser(
            userId = currentUserId,
            displayName = currentUserDisplayName,
            email = currentUserEmail
        )
    }
}

class EventsViewModelFactory(
    private val repository: MockEventsRepository = MockEventsRepository,
    private val currentUserId: String,
    private val currentUserDisplayName: String,
    private val currentUserEmail: String?
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(EventsViewModel::class.java)) {
            return EventsViewModel(
                repository = repository,
                currentUserId = currentUserId,
                currentUserDisplayName = currentUserDisplayName,
                currentUserEmail = currentUserEmail,
                autoSimulateMetrics = true
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
