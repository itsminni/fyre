package com.example.fyre.events.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.fyre.events.data.EventsRepository
import com.example.fyre.events.data.MockEventsDataRepository
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
    private val repository: EventsRepository = MockEventsDataRepository(),
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

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    init {
        refresh()
        if (autoSimulateMetrics) {
            viewModelScope.launch {
                while (isActive) {
                    delay(3000)
                    repository.simulateMetricsTick(null)
                    refresh()
                }
            }
        }
    }

    fun openEvent(eventId: String) {
        _selectedEventId.value = eventId
        viewModelScope.launch {
            repository.simulateMetricsTick(eventId)
            refresh()
        }
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
        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            val result = repository.joinEvent(
                eventId = eventId,
                userId = currentUserId,
                displayName = currentUserDisplayName
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Iscrizione evento non riuscita"
            }
            refresh()
            _isLoading.value = false
        }
    }

    fun cancelSelected() {
        val eventId = _selectedEventId.value ?: return
        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            val result = repository.cancelEvent(
                eventId = eventId,
                userId = currentUserId
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Annullamento iscrizione non riuscito"
            }
            refresh()
            _isLoading.value = false
        }
    }

    fun waitlistSelected() {
        val eventId = _selectedEventId.value ?: return
        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            val result = repository.waitlistEvent(
                eventId = eventId,
                userId = currentUserId,
                displayName = currentUserDisplayName
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Ingresso in waitlist non riuscito"
            }
            refresh()
            _isLoading.value = false
        }
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
        if (!_isAdminInMock.value) return false

        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            val result = repository.adminUpdateEvent(
                eventId = eventId,
                title = title,
                dateText = dateText,
                place = place,
                description = description,
                deadlineText = deadlineText,
                capacity = capacity,
                rules = rules
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Aggiornamento evento non riuscito"
            }
            refresh()
            _isLoading.value = false
        }
        return true
    }

    fun adminSetParticipantStatus(participantId: String, status: RegistrationStatus): Boolean {
        val eventId = _selectedEventId.value ?: return false
        if (!_isAdminInMock.value) return false

        _isLoading.value = true
        _errorMessage.value = null
        viewModelScope.launch {
            val result = repository.adminSetParticipantStatus(
                eventId = eventId,
                participantId = participantId,
                status = status
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Aggiornamento partecipante non riuscito"
            }
            refresh()
            _isLoading.value = false
        }
        return true
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
        viewModelScope.launch {
            repository.simulateMetricsTick(eventId)
            refresh()
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }

    private fun refresh() {
        viewModelScope.launch {
            val result = repository.getEventsForUser(
                userId = currentUserId,
                displayName = currentUserDisplayName,
                email = currentUserEmail
            )

            result.fold(
                onSuccess = { loadedEvents ->
                    _events.value = loadedEvents
                    _isAdminInMock.value = loadedEvents.any { event ->
                        event.userRole.name.contains("Admin", ignoreCase = true)
                    } || repository.isAdminEmail(currentUserEmail)
                },
                onFailure = { throwable ->
                    _errorMessage.value = throwable.message ?: "Impossibile caricare gli eventi"
                }
            )
        }
    }
}

class EventsViewModelFactory(
    private val repository: EventsRepository = MockEventsDataRepository(),
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
