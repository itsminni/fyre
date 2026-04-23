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
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
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
    currentUserEmail: String? = null,
    currentUserDisplayName: String? = null,
    notificationSettings: NotificationSettings = NotificationSettings(),
    notificationGateway: NotificationGateway? = null
) {
    val context = LocalContext.current
    val appGraph = remember(context.applicationContext) {
        AppGraphProvider.get(context.applicationContext)
    }
    val userId = remember(currentUserEmail) {
        currentUserEmail?.trim()?.lowercase().takeUnless { it.isNullOrBlank() } ?: "user_default"
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
    val isAdminInMock by viewModel.isAdminInMock.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    LaunchedEffect(selectedEventId) {
        if (selectedEventId != null) {
            viewModel.tickSelectedMetrics()
        }
    }

    val selected = viewModel.selectedEvent()
    if (selected != null) {
        EventDetailScreen(
            event = selected,
            isAdminInMock = isAdminInMock,
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
                        Text(
                            text = stringResource(R.string.events_user_state, event.userState.name),
                            style = MaterialTheme.typography.bodyMedium
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
                            Text(
                                text = stringResource(R.string.events_metric_online, event.liveMetrics.viewersOnline),
                                style = MaterialTheme.typography.labelSmall
                            )
                            Text(
                                text = stringResource(R.string.events_metric_checkin, event.liveMetrics.checkIns),
                                style = MaterialTheme.typography.labelSmall
                            )
                            Text(
                                text = stringResource(
                                    R.string.events_metric_chat_per_min,
                                    event.liveMetrics.chatPerMinute
                                ),
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                    }
                }
            }
        }
    }
}
