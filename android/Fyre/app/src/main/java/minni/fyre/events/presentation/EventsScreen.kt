package minni.fyre.events.presentation

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import minni.fyre.R
import minni.fyre.account.model.NotificationSettings
import minni.fyre.core.notifications.EventReminderScheduler
import minni.fyre.core.notifications.EventReminderReconciliationAction
import minni.fyre.core.notifications.EventReminderTiming
import minni.fyre.core.notifications.NotificationChannels
import minni.fyre.core.notifications.NotificationGateway
import minni.fyre.data.AppGraphProvider
import minni.fyre.events.model.EventItem
import minni.fyre.events.model.EventUserState

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
            currentUserDisplayName = displayName
        )
    )

    val events by viewModel.events.collectAsState()
    val selectedEventId by viewModel.selectedEventId.collectAsState()
    val isAdmin by viewModel.isAdmin.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()

    LaunchedEffect(
        events,
        notificationSettings.pushEnabled,
        notificationSettings.eventReminders,
        userId
    ) {
        val remindersEnabled = notificationSettings.pushEnabled && notificationSettings.eventReminders
        EventReminderScheduler.cancelRemindersForMissingEvents(
            context = context,
            authoritativeEventIds = events.mapTo(mutableSetOf()) { event -> event.id }
        )
        events.forEach { event ->
            when (EventReminderTiming.reconciliationAction(event.userState, remindersEnabled, event.startsAt)) {
                EventReminderReconciliationAction.Schedule -> {
                    event.startsAt?.let { startsAt ->
                        EventReminderScheduler.scheduleReminder(
                            context = context,
                            accountId = userId,
                            eventId = event.id,
                            eventTitle = event.title,
                            eventDate = event.dateText,
                            eventStartsAt = startsAt
                        )
                    }
                }
                EventReminderReconciliationAction.Cancel -> EventReminderScheduler.cancelReminder(context, event.id)
            }
        }
    }

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
            isBusy = isLoading,
            onBack = { viewModel.closeEventDetail() },
            onJoin = {
                viewModel.joinSelected { updatedSelected ->
                    val shouldNotify = notificationSettings.pushEnabled &&
                        notificationSettings.eventReminders
                    val reminderScheduled = if (
                        updatedSelected != null &&
                        shouldNotify &&
                        (updatedSelected.userState == EventUserState.Registered ||
                            updatedSelected.userState == EventUserState.Promoted)
                    ) {
                        updatedSelected.startsAt?.let { startsAt ->
                            EventReminderScheduler.scheduleReminder(
                                context = context,
                                accountId = userId,
                                eventId = updatedSelected.id,
                                eventTitle = updatedSelected.title,
                                eventDate = updatedSelected.dateText,
                                eventStartsAt = startsAt
                            )
                        } ?: false
                    } else {
                        false
                    }

                    if (reminderScheduled) {
                        notificationGateway?.showLocalNotification(
                            title = context.getString(R.string.events_reminder_set_title),
                            body = context.getString(
                                R.string.events_reminder_set_body,
                                updatedSelected?.title.orEmpty()
                            ),
                            channelId = NotificationChannels.EVENTS
                        )
                    }
                }
            },
            onCancel = {
                viewModel.cancelSelected { cancelledEvent ->
                    cancelledEvent?.let { event ->
                        EventReminderScheduler.cancelReminder(context, event.id)
                    }
                }
            },
            onWaitlist = { viewModel.waitlistSelected() },
            onAdminUpdateEvent = {
                    title,
                    dateText,
                    place,
                    description,
                    deadlineText,
                    capacity,
                    rules,
                    maleLimit,
                    femaleLimit,
                    cancellationDeadlineText ->
                viewModel.adminUpdateSelectedEvent(
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
            },
            onAdminSetParticipantStatus = { participant, status ->
                viewModel.adminSetParticipantStatus(participant, status)
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
    val mainEvent = events.firstOrNull()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(eventScreenBackground())
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(
            text = stringResource(R.string.events_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        if (!errorMessage.isNullOrBlank()) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.errorContainer,
                contentColor = MaterialTheme.colorScheme.onErrorContainer
            ) {
                Text(
                    text = errorMessage,
                    modifier = Modifier.padding(14.dp),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        when {
            mainEvent != null -> {
                EventPreviewCard(
                    event = mainEvent,
                    onClick = { onOpenEvent(mainEvent.id) }
                )
            }

            isLoading -> {
                Text(
                    text = stringResource(R.string.nav_loading_session),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            else -> {
                Text(
                    text = stringResource(R.string.events_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
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
    val statusBadge = registrationBadge(event)

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(30.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 6.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            EventPosterSection(height = 280.dp) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (statusBadge != null) {
                        EventStatusBadge(text = statusBadge)
                    }

                    Text(
                        text = event.title,
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = event.dateText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.92f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                if (event.place.isNotBlank()) {
                    Text(
                        text = event.place,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (event.deadlineText.isNotBlank() && event.deadlineText != "-") {
                    EventDeadlineBanner(
                        text = stringResource(R.string.events_preview_deadline, event.deadlineText)
                    )
                }

                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    EventMiniBadge(
                        text = "M ${event.maleCount}/${event.maleLimit.coerceAtLeast(1)}",
                        modifier = Modifier.weight(1f)
                    )
                    EventMiniBadge(
                        text = "F ${event.femaleCount}/${event.femaleLimit.coerceAtLeast(1)}",
                        modifier = Modifier.weight(1f)
                    )
                    EventMiniBadge(
                        text = "${event.registeredCount}/${event.capacity}",
                        modifier = Modifier.weight(1f)
                    )
                }

                Text(
                    text = stringResource(
                        R.string.events_preview_remaining,
                        event.remainingMaleSlots(),
                        event.remainingFemaleSlots()
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                if (event.description.isNotBlank()) {
                    Text(
                        text = event.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Text(
                    text = stringResource(R.string.events_preview_open),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
private fun EventPosterSection(
    height: Dp,
    overlay: @Composable () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
    ) {
        Image(
            painter = painterResource(R.drawable.party_poster),
            contentDescription = stringResource(R.string.events_poster_cd),
            modifier = Modifier.matchParentSize(),
            contentScale = ContentScale.Crop
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.22f),
                            Color.Black.copy(alpha = 0.84f)
                        )
                    )
                )
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(20.dp)
        ) {
            overlay()
        }
    }
}

@Composable
private fun EventStatusBadge(text: String) {
    Surface(
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.92f),
        contentColor = MaterialTheme.colorScheme.onPrimary
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun EventDeadlineBanner(text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
        contentColor = MaterialTheme.colorScheme.onSurface
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun EventMiniBadge(
    text: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f),
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun registrationBadge(event: EventItem): String? {
    return when (event.userState) {
        EventUserState.Registered -> stringResource(R.string.events_badge_confirmed)
        EventUserState.Promoted -> stringResource(R.string.events_badge_promoted)
        EventUserState.Waitlist -> stringResource(R.string.events_badge_waitlisted)
        EventUserState.NotRegistered,
        EventUserState.Closed -> null
    }
}

@Composable
private fun eventScreenBackground(): Brush {
    return Brush.verticalGradient(
        colors = listOf(
            MaterialTheme.colorScheme.background,
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.34f)
        )
    )
}

private fun EventItem.remainingMaleSlots(): Int {
    return (maleLimit - maleCount).coerceAtLeast(0)
}

private fun EventItem.remainingFemaleSlots(): Int {
    return (femaleLimit - femaleCount).coerceAtLeast(0)
}
