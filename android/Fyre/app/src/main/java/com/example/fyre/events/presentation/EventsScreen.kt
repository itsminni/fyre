package com.example.fyre.events.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.fyre.R
import com.example.fyre.account.model.NotificationSettings
import com.example.fyre.core.notifications.EventReminderScheduler
import com.example.fyre.core.notifications.NotificationChannels
import com.example.fyre.core.notifications.NotificationGateway
import com.example.fyre.data.AppGraphProvider
import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.EventUserState

@Composable
fun EventsScreen(
    currentUserId: String? = null,
    currentUserEmail: String? = null,
    currentUserDisplayName: String? = null,
    notificationSettings: NotificationSettings = NotificationSettings(),
    notificationGateway: NotificationGateway? = null
) {
    val context = LocalContext.current
    val appGraph = remember(context.applicationContext) {
        AppGraphProvider.get(context.applicationContext)
    }
    val userId = remember(currentUserId, currentUserEmail) {
        currentUserId?.trim().takeUnless { it.isNullOrBlank() }
            ?: currentUserEmail?.trim()?.lowercase().takeUnless { it.isNullOrBlank() }
            ?: "user_default"
    }
    val displayName = remember(currentUserDisplayName) {
        currentUserDisplayName?.trim().takeUnless { it.isNullOrBlank() } ?: "Utente"
    }

    val viewModel: EventsViewModel = viewModel(
        factory = EventsViewModelFactory(
            repository = appGraph.eventsRepository,
            currentUserId = userId,
            currentUserDisplayName = displayName,
            currentUserEmail = currentUserEmail
        )
    )

    val events by viewModel.events.collectAsState()
    val selectedEventId by viewModel.selectedEventId.collectAsState()
    val isAdmin by viewModel.isAdmin.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    LaunchedEffect(selectedEventId) {
        if (selectedEventId != null) {
            viewModel.refreshSelectedEvent()
        }
    }

    val selected = viewModel.selectedEvent()
    if (selected != null) {
        EventDetailScreen(
            event = selected,
            isAdmin = isAdmin,
            userStateLabel = viewModel.currentUserEventStateLabel(),
            canJoin = viewModel.canJoinSelected(),
            canCancel = viewModel.canCancelSelected(),
            canWaitlist = viewModel.canWaitlistSelected(),
            onBack = { viewModel.closeEventDetail() },
            onJoin = {
                viewModel.joinSelected()
                val updatedSelected = viewModel.selectedEvent()
                val shouldNotify = notificationSettings.pushEnabled && notificationSettings.eventReminders
                if (updatedSelected != null && shouldNotify && updatedSelected.userState == EventUserState.Registered) {
                    EventReminderScheduler.scheduleSimulatedReminder(
                        context = context,
                        eventId = updatedSelected.id,
                        eventTitle = updatedSelected.title,
                        eventDate = updatedSelected.dateText
                    )
                    notificationGateway?.showLocalNotification(
                        title = context.getString(R.string.events_reminder_set_title),
                        body = context.getString(R.string.events_reminder_set_body, updatedSelected.title),
                        channelId = NotificationChannels.EVENTS
                    )
                }
            },
            onCancel = { viewModel.cancelSelected() },
            onWaitlist = { viewModel.waitlistSelected() },
            onAdminUpdateEvent = { title, dateText, place, description, deadlineText, capacity, rules ->
                viewModel.adminUpdateSelectedEvent(
                    title = title,
                    dateText = dateText,
                    place = place,
                    description = description,
                    deadlineText = deadlineText,
                    capacity = capacity,
                    rules = rules
                )
            },
            onAdminSetParticipantStatus = { participantId, status ->
                viewModel.adminSetParticipantStatus(participantId, status)
            }
        )
        return
    }

    EventsListScreen(
        events = events,
        isLoading = isLoading,
        errorMessage = errorMessage,
        onOpenEvent = { eventId -> viewModel.openEvent(eventId) }
    )
}

@Composable
private fun EventsListScreen(
    events: List<EventItem>,
    isLoading: Boolean,
    errorMessage: String?,
    onOpenEvent: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            text = stringResource(R.string.events_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        if (!errorMessage.isNullOrBlank()) {
            Card(
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = errorMessage,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }

        if (events.isEmpty() && isLoading) {
            Text(text = stringResource(R.string.nav_loading_session))
            return@Column
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(events, key = { it.id }) { event ->
                EventPreviewCard(event = event, onClick = { onOpenEvent(event.id) })
            }
        }
    }
}

@Composable
private fun EventPreviewCard(
    event: EventItem,
    onClick: () -> Unit
) {
    val progress = (event.registeredCount.toFloat() / event.capacity.coerceAtLeast(1)).coerceIn(0f, 1f)

    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        shape = RoundedCornerShape(24.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(190.dp)
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                Color(0xFFFFA43A),
                                Color(0xFFEC5935),
                                Color(0xFF301513)
                            )
                        )
                    )
                    .padding(18.dp),
                contentAlignment = Alignment.BottomStart
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(
                        onClick = {},
                        label = { Text(stringResource(R.string.events_user_state, event.userState.name)) }
                    )
                    Text(
                        text = event.title,
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = event.dateText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.9f)
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(text = event.place, style = MaterialTheme.typography.bodyMedium)
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth()
                )
                Text(
                    text = stringResource(
                        R.string.events_capacity_deadline,
                        event.registeredCount,
                        event.capacity,
                        event.deadlineText
                    ),
                    style = MaterialTheme.typography.labelMedium
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AssistChip(
                        onClick = {},
                        label = { Text(stringResource(R.string.events_metric_online, event.liveMetrics.viewersOnline)) }
                    )
                    AssistChip(
                        onClick = {},
                        label = { Text(stringResource(R.string.events_metric_checkin, event.liveMetrics.checkIns)) }
                    )
                }
            }
        }
    }
}
