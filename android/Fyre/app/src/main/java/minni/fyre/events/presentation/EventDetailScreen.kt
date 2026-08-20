package minni.fyre.events.presentation

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import minni.fyre.R
import minni.fyre.events.model.EventItem
import minni.fyre.events.model.EventParticipant
import minni.fyre.events.model.EventUserState
import minni.fyre.events.model.RegistrationStatus

@Composable
fun EventDetailScreen(
    event: EventItem,
    isAdmin: Boolean,
    userStateLabel: String,
    canJoin: Boolean,
    canCancel: Boolean,
    canWaitlist: Boolean,
    isBusy: Boolean,
    onBack: () -> Unit,
    onJoin: () -> Unit,
    onCancel: () -> Unit,
    onWaitlist: () -> Unit,
    onAdminUpdateEvent: (
        title: String,
        dateText: String,
        place: String,
        description: String,
        deadlineText: String,
        capacity: Int,
        rules: List<String>,
        maleLimit: Int,
        femaleLimit: Int,
        cancellationDeadlineText: String
    ) -> Boolean,
    onAdminSetParticipantStatus: (participant: EventParticipant, status: RegistrationStatus) -> Boolean
) {
    var editTitle by remember(event.id) { mutableStateOf(event.title) }
    var editDate by remember(event.id) { mutableStateOf(event.dateText) }
    var editPlace by remember(event.id) { mutableStateOf(event.place) }
    var editDescription by remember(event.id) { mutableStateOf(event.description) }
    var editDeadline by remember(event.id) { mutableStateOf(event.deadlineText) }
    var editCancellationDeadline by remember(event.id) { mutableStateOf(event.cancellationDeadlineText) }
    var editCapacity by remember(event.id) { mutableStateOf(event.capacity.toString()) }
    var editMaleLimit by remember(event.id) { mutableStateOf(event.maleLimit.toString()) }
    var editFemaleLimit by remember(event.id) { mutableStateOf(event.femaleLimit.toString()) }
    var editRulesText by remember(event.id) { mutableStateOf(event.rules.joinToString("\n")) }

    val actionTitle = when {
        event.userState == EventUserState.Waitlist && canCancel -> stringResource(R.string.events_action_leave_waiting)
        canCancel -> stringResource(R.string.events_action_cancel)
        else -> stringResource(R.string.events_action_join)
    }
    val primaryActionEnabled = !isBusy && (canJoin || canCancel || canWaitlist)

    Scaffold(
        bottomBar = {
            EventActionBar(
                title = actionTitle,
                isDestructive = canCancel,
                enabled = primaryActionEnabled,
                onClick = {
                    when {
                        canCancel -> onCancel()
                        canJoin -> onJoin()
                        canWaitlist -> onWaitlist()
                    }
                }
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(eventScreenBackground())
                .verticalScroll(rememberScrollState())
                .padding(innerPadding)
                .padding(horizontal = 16.dp)
                .padding(top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.events_detail_back_to_events_cd)
                    )
                }
                Text(
                    text = stringResource(R.string.events_detail_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
            }

            if (isBusy) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            EventPosterHero(
                event = event,
                statusBadge = registrationBadge(event)
            )

            EventSurface(
                title = stringResource(R.string.events_section_main_event),
                icon = Icons.Filled.Star
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(
                        text = event.title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    if (event.description.isNotBlank()) {
                        Text(
                            text = event.description,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            if (event.place.isNotBlank() || event.dateText.isNotBlank()) {
                EventSurface(
                    title = stringResource(R.string.events_section_info),
                    icon = Icons.Filled.Info
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (event.place.isNotBlank()) {
                            EventInfoLine(icon = Icons.Filled.Info, text = event.place)
                        }
                        if (event.dateText.isNotBlank()) {
                            EventInfoLine(icon = Icons.Filled.Info, text = event.dateText)
                        }
                    }
                }
            }

            if (event.rules.isNotEmpty()) {
                EventSurface(
                    title = stringResource(R.string.events_section_rules),
                    icon = Icons.Filled.CheckCircle
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        event.rules.forEach { rule ->
                            EventInfoLine(icon = Icons.Filled.CheckCircle, text = rule)
                        }
                    }
                }
            }

            EventSurface(
                title = stringResource(R.string.events_section_live),
                icon = Icons.Filled.Person
            ) {
                EventLiveStatus(event = event)
            }

            if (isAdmin) {
                EventSurface(
                    title = stringResource(R.string.events_detail_section_admin),
                    icon = Icons.Filled.Edit
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(
                            text = stringResource(R.string.events_admin_subtitle),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        OutlinedTextField(
                            value = editTitle,
                            onValueChange = { editTitle = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.events_detail_input_title)) }
                        )
                        OutlinedTextField(
                            value = editDate,
                            onValueChange = { editDate = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.events_detail_input_date)) }
                        )
                        OutlinedTextField(
                            value = editPlace,
                            onValueChange = { editPlace = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.events_detail_input_place)) }
                        )
                        OutlinedTextField(
                            value = editDescription,
                            onValueChange = { editDescription = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.events_detail_input_description)) },
                            minLines = 2
                        )
                        OutlinedTextField(
                            value = editDeadline,
                            onValueChange = { editDeadline = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.events_detail_input_deadline)) }
                        )
                        OutlinedTextField(
                            value = editCancellationDeadline,
                            onValueChange = { editCancellationDeadline = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.events_detail_input_cancellation_deadline)) }
                        )
                        OutlinedTextField(
                            value = editCapacity,
                            onValueChange = { editCapacity = it.filter { ch -> ch.isDigit() } },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.events_detail_input_capacity)) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = editMaleLimit,
                                onValueChange = { editMaleLimit = it.filter { ch -> ch.isDigit() } },
                                modifier = Modifier.weight(1f),
                                label = { Text(stringResource(R.string.events_detail_input_male_limit)) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                            )
                            OutlinedTextField(
                                value = editFemaleLimit,
                                onValueChange = { editFemaleLimit = it.filter { ch -> ch.isDigit() } },
                                modifier = Modifier.weight(1f),
                                label = { Text(stringResource(R.string.events_detail_input_female_limit)) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                            )
                        }
                        OutlinedTextField(
                            value = editRulesText,
                            onValueChange = { editRulesText = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(stringResource(R.string.events_detail_input_rules)) },
                            minLines = 3
                        )

                        Button(
                            onClick = {
                                onAdminUpdateEvent(
                                    editTitle,
                                    editDate,
                                    editPlace,
                                    editDescription,
                                    editDeadline,
                                    editCapacity.toIntOrNull() ?: event.capacity,
                                    editRulesText.lines().map { it.trim() }.filter { it.isNotBlank() },
                                    editMaleLimit.toIntOrNull() ?: event.maleLimit,
                                    editFemaleLimit.toIntOrNull() ?: event.femaleLimit,
                                    editCancellationDeadline
                                )
                            },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isBusy
                        ) {
                            Text(stringResource(R.string.events_detail_save_changes))
                        }

                        Text(
                            text = stringResource(R.string.events_detail_section_manage_participants),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold
                        )

                        if (event.participants.isEmpty()) {
                            Text(
                                text = stringResource(R.string.events_admin_participants_empty),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                event.participants.forEach { participant ->
                                    AdminParticipantRow(
                                        participant = participant,
                                        enabled = !isBusy,
                                        onStatus = { status ->
                                            onAdminSetParticipantStatus(participant, status)
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EventPosterHero(
    event: EventItem,
    statusBadge: String?
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(320.dp)
            .clip(RoundedCornerShape(30.dp))
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
                        listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.22f),
                            Color.Black.copy(alpha = 0.88f)
                        )
                    )
                )
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (statusBadge != null) {
                EventStatusBadge(text = statusBadge)
            }

            Surface(
                shape = RoundedCornerShape(50),
                color = Color.Black.copy(alpha = 0.48f),
                contentColor = Color.White
            ) {
                Text(
                    text = event.place,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Text(
                text = event.title,
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = event.dateText,
                style = MaterialTheme.typography.titleSmall,
                color = Color.White.copy(alpha = 0.92f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun EventSurface(
    title: String,
    icon: ImageVector,
    content: @Composable () -> Unit
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(26.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(
                    modifier = Modifier.size(30.dp),
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                    contentColor = MaterialTheme.colorScheme.primary
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }

            content()
        }
    }
}

@Composable
private fun EventInfoLine(
    icon: ImageVector,
    text: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.width(20.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Text(
            text = text,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun EventLiveStatus(event: EventItem) {
    val progress = (event.registeredCount.toFloat() / event.capacity.coerceAtLeast(1)).coerceIn(0f, 1f)

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.events_capacity_value, event.registeredCount, event.capacity),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = stringResource(R.string.events_waiting_count, event.waitingListCount),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            EventMetricTile(
                title = stringResource(R.string.events_label_male),
                value = stringResource(R.string.events_male_count, event.maleCount),
                modifier = Modifier.weight(1f)
            )
            EventMetricTile(
                title = stringResource(R.string.events_label_female),
                value = stringResource(R.string.events_female_count, event.femaleCount),
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            EventMetricTile(
                title = "M",
                value = event.remainingMaleSlots().toString(),
                caption = stringResource(
                    R.string.events_preview_remaining,
                    event.remainingMaleSlots(),
                    event.remainingFemaleSlots()
                ),
                modifier = Modifier.weight(1f)
            )
            EventMetricTile(
                title = "F",
                value = event.remainingFemaleSlots().toString(),
                caption = stringResource(R.string.events_waiting_count, event.waitingListCount),
                modifier = Modifier.weight(1f)
            )
        }

        if (event.deadlineText.isNotBlank() && event.deadlineText != "-") {
            EventInfoLine(
                icon = Icons.Filled.Info,
                text = stringResource(R.string.events_preview_deadline, event.deadlineText)
            )
        }
        if (event.cancellationDeadlineText.isNotBlank() && event.cancellationDeadlineText != "-") {
            EventInfoLine(
                icon = Icons.Filled.Info,
                text = stringResource(
                    R.string.events_cancellation_deadline,
                    event.cancellationDeadlineText
                )
            )
        }
    }
}

@Composable
private fun EventMetricTile(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    caption: String? = null
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
        contentColor = MaterialTheme.colorScheme.onSurface
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            if (caption != null) {
                Text(
                    text = caption,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun AdminParticipantRow(
    participant: EventParticipant,
    enabled: Boolean,
    onStatus: (RegistrationStatus) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f),
        contentColor = MaterialTheme.colorScheme.onSurface
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = stringResource(
                    R.string.events_detail_participant_status,
                    participant.displayName,
                    participant.status.name
                ),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    onClick = { onStatus(RegistrationStatus.Registered) },
                    enabled = enabled
                ) {
                    Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text(stringResource(R.string.events_detail_status_registered_short))
                }
                TextButton(
                    onClick = { onStatus(RegistrationStatus.Waitlist) },
                    enabled = enabled
                ) {
                    Icon(Icons.Filled.Star, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text(stringResource(R.string.events_detail_status_waitlist_short))
                }
                TextButton(
                    onClick = { onStatus(RegistrationStatus.Promoted) },
                    enabled = enabled
                ) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text(stringResource(R.string.events_detail_status_promoted_short))
                }
                TextButton(
                    onClick = { onStatus(RegistrationStatus.NotRegistered) },
                    enabled = enabled
                ) {
                    Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                    Text(stringResource(R.string.events_detail_status_none_short))
                }
            }
        }
    }
}

@Composable
private fun EventActionBar(
    title: String,
    isDestructive: Boolean,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Surface(
        shadowElevation = 10.dp,
        color = MaterialTheme.colorScheme.surface
    ) {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isDestructive) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.primary
                }
            ),
            shape = RoundedCornerShape(20.dp)
        ) {
            Text(
                text = title,
                modifier = Modifier.padding(vertical = 6.dp),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
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
