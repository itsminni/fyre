package com.example.fyre.events.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.fyre.events.data.MockEventsRepository
import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.RegistrationStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class EventsViewModel(
    private val repository: MockEventsRepository = MockEventsRepository,
    autoSimulateMetrics: Boolean = true
) : ViewModel() {
    private val _events = MutableStateFlow<List<EventItem>>(emptyList())
    val events: StateFlow<List<EventItem>> = _events.asStateFlow()

    private val _selectedEventId = MutableStateFlow<String?>(null)
    val selectedEventId: StateFlow<String?> = _selectedEventId.asStateFlow()

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
        val eventId = _selectedEventId.value ?: return
        repository.updateRegistrationStatus(eventId, status)
        refresh()
    }

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
        _events.value = repository.getEvents()
    }
}

