package com.example.fyre.events.data

import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.LiveMetrics
import com.example.fyre.events.model.RegistrationStatus

/** Repository locale mock per la feature Eventi. */
object MockEventsRepository {
    private val events = mutableListOf(
        EventItem(
            id = "ev1",
            title = "Aperitivo Tech Milano",
            dateText = "24/04/2026 19:30",
            place = "Navigli, Milano",
            description = "Networking serale tra developer, designer e founder.",
            rules = listOf("Dress code smart casual", "No spam", "Rispetta i tempi di speech"),
            registrationStatus = RegistrationStatus.NotRegistered,
            capacity = 120,
            registeredCount = 84,
            deadlineText = "23/04/2026 23:59",
            liveMetrics = LiveMetrics(viewersOnline = 41, checkIns = 12, chatPerMinute = 8)
        ),
        EventItem(
            id = "ev2",
            title = "Sunset Rooftop Party",
            dateText = "27/04/2026 18:00",
            place = "Porta Nuova, Milano",
            description = "DJ set, drink menu dedicato e social game live.",
            rules = listOf("Solo maggiorenni", "Documento richiesto", "No ingresso dopo le 21:30"),
            registrationStatus = RegistrationStatus.Registered,
            capacity = 200,
            registeredCount = 157,
            deadlineText = "27/04/2026 12:00",
            liveMetrics = LiveMetrics(viewersOnline = 63, checkIns = 29, chatPerMinute = 15)
        ),
        EventItem(
            id = "ev3",
            title = "Hiking Day Lago di Como",
            dateText = "01/05/2026 08:30",
            place = "Como, meeting point stazione",
            description = "Escursione guidata con gruppo misto e pranzo al sacco.",
            rules = listOf("Scarpe trekking obbligatorie", "Rispettare la guida", "Conferma meteo il giorno prima"),
            registrationStatus = RegistrationStatus.Waitlist,
            capacity = 40,
            registeredCount = 40,
            deadlineText = "29/04/2026 20:00",
            liveMetrics = LiveMetrics(viewersOnline = 19, checkIns = 4, chatPerMinute = 3)
        )
    )

    fun getEvents(): List<EventItem> = events.toList()

    fun getEventById(eventId: String): EventItem? = events.firstOrNull { it.id == eventId }

    fun updateRegistrationStatus(eventId: String, status: RegistrationStatus) {
        val index = events.indexOfFirst { it.id == eventId }
        if (index == -1) return

        val current = events[index]
        val newRegisteredCount = when {
            current.registrationStatus != RegistrationStatus.Registered && status == RegistrationStatus.Registered -> {
                (current.registeredCount + 1).coerceAtMost(current.capacity)
            }
            current.registrationStatus == RegistrationStatus.Registered && status != RegistrationStatus.Registered -> {
                (current.registeredCount - 1).coerceAtLeast(0)
            }
            else -> current.registeredCount
        }

        events[index] = current.copy(
            registrationStatus = status,
            registeredCount = newRegisteredCount
        )
    }

    fun simulateMetricsTick(eventId: String? = null) {
        for (i in events.indices) {
            val event = events[i]
            if (eventId != null && event.id != eventId) continue

            val next = event.liveMetrics.copy(
                viewersOnline = (event.liveMetrics.viewersOnline + 2).coerceAtMost(9999),
                checkIns = (event.liveMetrics.checkIns + 1).coerceAtMost(event.capacity),
                chatPerMinute = (event.liveMetrics.chatPerMinute + 1).coerceAtMost(999)
            )
            events[i] = event.copy(liveMetrics = next)
        }
    }

    fun resetSeed() {
        events.clear()
        events.addAll(getInitialSeed())
    }

    private fun getInitialSeed(): List<EventItem> = listOf(
        EventItem(
            id = "ev1",
            title = "Aperitivo Tech Milano",
            dateText = "24/04/2026 19:30",
            place = "Navigli, Milano",
            description = "Networking serale tra developer, designer e founder.",
            rules = listOf("Dress code smart casual", "No spam", "Rispetta i tempi di speech"),
            registrationStatus = RegistrationStatus.NotRegistered,
            capacity = 120,
            registeredCount = 84,
            deadlineText = "23/04/2026 23:59",
            liveMetrics = LiveMetrics(viewersOnline = 41, checkIns = 12, chatPerMinute = 8)
        ),
        EventItem(
            id = "ev2",
            title = "Sunset Rooftop Party",
            dateText = "27/04/2026 18:00",
            place = "Porta Nuova, Milano",
            description = "DJ set, drink menu dedicato e social game live.",
            rules = listOf("Solo maggiorenni", "Documento richiesto", "No ingresso dopo le 21:30"),
            registrationStatus = RegistrationStatus.Registered,
            capacity = 200,
            registeredCount = 157,
            deadlineText = "27/04/2026 12:00",
            liveMetrics = LiveMetrics(viewersOnline = 63, checkIns = 29, chatPerMinute = 15)
        ),
        EventItem(
            id = "ev3",
            title = "Hiking Day Lago di Como",
            dateText = "01/05/2026 08:30",
            place = "Como, meeting point stazione",
            description = "Escursione guidata con gruppo misto e pranzo al sacco.",
            rules = listOf("Scarpe trekking obbligatorie", "Rispettare la guida", "Conferma meteo il giorno prima"),
            registrationStatus = RegistrationStatus.Waitlist,
            capacity = 40,
            registeredCount = 40,
            deadlineText = "29/04/2026 20:00",
            liveMetrics = LiveMetrics(viewersOnline = 19, checkIns = 4, chatPerMinute = 3)
        )
    )
}

