package minni.fyre.events.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import minni.fyre.events.data.EventsRepository
import minni.fyre.events.model.EventItem
import minni.fyre.events.model.EventParticipant
import minni.fyre.events.model.EventUserRole
import minni.fyre.events.model.EventUserState
import minni.fyre.events.model.RegistrationStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class EventsViewModel(
    private val repository: EventsRepository,
    private val currentUserId: String = DEFAULT_USER_ID,
    private val currentUserDisplayName: String = DEFAULT_USER_NAME,
    autoRefreshEvents: Boolean = true
) : ViewModel() {
    companion object {
        private const val DEFAULT_USER_ID = "user_default"
        private const val DEFAULT_USER_NAME = "Utente"
    }

    private val _events = MutableStateFlow<List<EventItem>>(emptyList())
    val events: StateFlow<List<EventItem>> = _events.asStateFlow()

    private val _selectedEventId = MutableStateFlow<String?>(null)
    val selectedEventId: StateFlow<String?> = _selectedEventId.asStateFlow()

    private val _isAdmin = MutableStateFlow(false)
    val isAdmin: StateFlow<Boolean> = _isAdmin.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val operationMutex = Mutex()
    private var refreshJob: Job? = null

    init {
        refresh()
        if (autoRefreshEvents) {
            viewModelScope.launch {
                while (isActive) {
                    delay(15000)
                    refresh()
                }
            }
        }
    }

    fun openEvent(eventId: String) {
        _selectedEventId.value = eventId
        refresh()
    }

    fun closeEventDetail() {
        _selectedEventId.value = null
    }

    fun updateRegistrationForSelected(status: RegistrationStatus) {
        when (status) {
            RegistrationStatus.Registered -> joinSelected()
            RegistrationStatus.Promoted -> joinSelected()
            RegistrationStatus.NotRegistered, RegistrationStatus.Closed -> cancelSelected()
            RegistrationStatus.Waitlist -> waitlistSelected()
        }
    }

    fun joinSelected(onCompleted: (EventItem?) -> Unit = {}) {
        val eventId = _selectedEventId.value ?: run {
            onCompleted(null)
            return
        }
        val started = launchForegroundOperation {
            val result = repository.joinEvent(
                eventId = eventId,
                userId = currentUserId,
                displayName = currentUserDisplayName
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Iscrizione evento non riuscita"
            }
            val refreshedEvents = refreshNowLocked().getOrNull()
            onCompleted(
                refreshedEvents
                    ?.firstOrNull { it.id == eventId }
                    ?.takeIf { result.isSuccess }
            )
        }
        if (!started) onCompleted(null)
    }

    fun cancelSelected(onCompleted: (EventItem?) -> Unit = {}) {
        val eventId = _selectedEventId.value ?: return
        val eventBeforeCancellation = selectedEvent()
        val hadScheduledReminder = eventBeforeCancellation?.userState == EventUserState.Registered ||
            eventBeforeCancellation?.userState == EventUserState.Promoted
        val started = launchForegroundOperation {
            val result = repository.cancelEvent(
                eventId = eventId,
                userId = currentUserId
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Annullamento iscrizione non riuscito"
            }
            refreshNowLocked()
            onCompleted(eventBeforeCancellation?.takeIf { result.isSuccess && hadScheduledReminder })
        }
        if (!started) onCompleted(null)
    }

    fun waitlistSelected() {
        val eventId = _selectedEventId.value ?: return
        launchForegroundOperation {
            val result = repository.waitlistEvent(
                eventId = eventId,
                userId = currentUserId,
                displayName = currentUserDisplayName
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Ingresso in waitlist non riuscito"
            }
            refreshNowLocked()
        }
    }

    fun adminUpdateSelectedEvent(
        title: String,
        dateText: String,
        place: String,
        description: String,
        deadlineText: String,
        capacity: Int,
        rules: List<String>,
        maleLimit: Int = (capacity / 2).coerceAtLeast(1),
        femaleLimit: Int = (capacity / 2).coerceAtLeast(1),
        cancellationDeadlineText: String = deadlineText
    ): Boolean {
        val eventId = _selectedEventId.value ?: return false
        if (!_isAdmin.value) return false

        return launchForegroundOperation {
            val result = repository.adminUpdateEvent(
                eventId = eventId,
                title = title,
                dateText = dateText,
                place = place,
                description = description,
                deadlineText = deadlineText,
                capacity = capacity,
                rules = rules,
                maleLimit = maleLimit,
                femaleLimit = femaleLimit,
                cancellationDeadlineText = cancellationDeadlineText
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Aggiornamento evento non riuscito"
            }
            refreshNowLocked()
        }
    }

    fun adminSetParticipantStatus(participant: EventParticipant, status: RegistrationStatus): Boolean {
        val eventId = _selectedEventId.value ?: return false
        if (!_isAdmin.value) return false

        return launchForegroundOperation {
            val result = repository.adminSetParticipantStatus(
                eventId = eventId,
                participantId = participant.id,
                registrationId = participant.registrationId,
                status = status
            )
            result.onFailure { throwable ->
                _errorMessage.value = throwable.message ?: "Aggiornamento partecipante non riuscito"
            }
            refreshNowLocked()
        }
    }

    fun canShowAdminSection(): Boolean = _isAdmin.value

    fun canJoinSelected(): Boolean {
        return when (selectedEvent()?.userState) {
            EventUserState.NotRegistered,
            EventUserState.Waitlist -> true
            EventUserState.Registered,
            EventUserState.Promoted,
            EventUserState.Closed,
            null -> false
        }
    }

    fun canCancelSelected(): Boolean {
        return when (selectedEvent()?.userState) {
            EventUserState.Registered,
            EventUserState.Promoted,
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

    fun refreshSelectedEvent() {
        if (_selectedEventId.value == null) return
        refresh()
    }

    fun clearError() {
        _errorMessage.value = null
    }

    private fun refresh() {
        if (refreshJob?.isActive == true) return
        refreshJob = viewModelScope.launch {
            operationMutex.withLock {
                refreshNowLocked()
            }
        }
    }

    private fun launchForegroundOperation(block: suspend () -> Unit): Boolean {
        if (!_isLoading.compareAndSet(expect = false, update = true)) return false
        _errorMessage.value = null
        viewModelScope.launch {
            try {
                operationMutex.withLock {
                    block()
                }
            } finally {
                _isLoading.value = false
            }
        }
        return true
    }

    private suspend fun refreshNowLocked(): Result<List<EventItem>> {
        val result = repository.getEventsForUser(
            userId = currentUserId,
            displayName = currentUserDisplayName
        )

        result.fold(
            onSuccess = { loadedEvents ->
                _events.value = loadedEvents
                _isAdmin.value = loadedEvents.any { event -> event.userRole == EventUserRole.Admin }
            },
            onFailure = { throwable ->
                _events.value = emptyList()
                _isAdmin.value = false
                _errorMessage.value = throwable.message ?: "Impossibile caricare gli eventi"
            }
        )

        return result
    }
}

class EventsViewModelFactory(
    private val repository: EventsRepository,
    private val currentUserId: String,
    private val currentUserDisplayName: String
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(EventsViewModel::class.java)) {
            return EventsViewModel(
                repository = repository,
                currentUserId = currentUserId,
                currentUserDisplayName = currentUserDisplayName,
                autoRefreshEvents = true
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
