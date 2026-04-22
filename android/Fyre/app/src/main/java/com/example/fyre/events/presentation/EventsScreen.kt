package com.example.fyre.events.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.fyre.events.model.EventItem

@Composable
fun EventsScreen() {
    val viewModel: EventsViewModel = viewModel()
    val events by viewModel.events.collectAsState()
    val selectedEventId by viewModel.selectedEventId.collectAsState()

    LaunchedEffect(selectedEventId) {
        if (selectedEventId != null) {
            viewModel.tickSelectedMetrics()
        }
    }

    val selected = viewModel.selectedEvent()
    if (selected != null) {
        EventDetailScreen(
            event = selected,
            onBack = { viewModel.closeEventDetail() },
            onSetStatus = { status -> viewModel.updateRegistrationForSelected(status) }
        )
        return
    }

    EventsListScreen(
        events = events,
        onOpenEvent = { eventId -> viewModel.openEvent(eventId) }
    )
}

@Composable
private fun EventsListScreen(
    events: List<EventItem>,
    onOpenEvent: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = "Eventi",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(events, key = { it.id }) { event ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onOpenEvent(event.id) }
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = event.title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(text = event.dateText, style = MaterialTheme.typography.bodyMedium)
                        Text(text = event.place, style = MaterialTheme.typography.bodyMedium)
                        Text(text = "Stato: ${event.registrationStatus.name}", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text = "Capienza ${event.registeredCount}/${event.capacity} - Deadline ${event.deadlineText}",
                            style = MaterialTheme.typography.labelMedium
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(text = "Online ${event.liveMetrics.viewersOnline}", style = MaterialTheme.typography.labelSmall)
                            Text(text = "Check-in ${event.liveMetrics.checkIns}", style = MaterialTheme.typography.labelSmall)
                            Text(text = "Chat/min ${event.liveMetrics.chatPerMinute}", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}
