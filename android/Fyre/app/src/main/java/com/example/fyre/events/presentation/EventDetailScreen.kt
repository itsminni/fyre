package com.example.fyre.events.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.fyre.R
import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.RegistrationStatus

@Composable
fun EventDetailScreen(
    event: EventItem,
    isAdmin: Boolean,
    userStateLabel: String,
    canJoin: Boolean,
    canCancel: Boolean,
    canWaitlist: Boolean,
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
        rules: List<String>
    ) -> Boolean,
    onAdminSetParticipantStatus: (participantId: String, status: RegistrationStatus) -> Boolean
) {
    var editTitle by remember(event.id) { mutableStateOf(event.title) }
    var editDate by remember(event.id) { mutableStateOf(event.dateText) }
    var editPlace by remember(event.id) { mutableStateOf(event.place) }
    var editDescription by remember(event.id) { mutableStateOf(event.description) }
    var editDeadline by remember(event.id) { mutableStateOf(event.deadlineText) }
    var editCapacity by remember(event.id) { mutableStateOf(event.capacity.toString()) }
    var editRulesText by remember(event.id) { mutableStateOf(event.rules.joinToString("\n")) }
    val progress = (event.registeredCount.toFloat() / event.capacity.coerceAtLeast(1)).coerceIn(0f, 1f)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
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
                text = event.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp)
        ) {
            Column {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(220.dp)
                        .background(
                            Brush.verticalGradient(
                                listOf(
                                    Color(0xFFFFA43A),
                                    Color(0xFFEC5935),
                                    Color(0xFF2A1110)
                                )
                            )
                        )
                        .padding(18.dp),
                    contentAlignment = Alignment.BottomStart
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip(
                            onClick = {},
                            label = { Text(userStateLabel) }
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
                    DetailRow(label = stringResource(R.string.events_detail_label_place), value = event.place)
                    LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                    DetailRow(
                        label = stringResource(R.string.events_detail_label_capacity),
                        value = stringResource(
                            R.string.events_detail_capacity_value,
                            event.registeredCount,
                            event.capacity
                        )
                    )
                }
            }
        }

        DetailRow(label = stringResource(R.string.events_detail_label_date), value = event.dateText)
        DetailRow(label = stringResource(R.string.events_detail_label_place), value = event.place)
        DetailRow(label = stringResource(R.string.events_detail_label_deadline), value = event.deadlineText)
        DetailRow(
            label = stringResource(R.string.events_detail_label_capacity),
            value = stringResource(
                R.string.events_detail_capacity_value,
                event.registeredCount,
                event.capacity
            )
        )
        DetailRow(label = stringResource(R.string.events_detail_label_user_state), value = userStateLabel)

        Text(
            text = stringResource(R.string.events_detail_section_description),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Text(text = event.description, style = MaterialTheme.typography.bodyMedium)

        Text(
            text = stringResource(R.string.events_detail_section_rules),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            event.rules.forEach { rule ->
                Text(
                    text = stringResource(R.string.events_detail_rule_item, rule),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        Text(
            text = stringResource(R.string.events_detail_section_live_metrics),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
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
            AssistChip(
                onClick = {},
                label = { Text(stringResource(R.string.events_metric_chat_per_min, event.liveMetrics.chatPerMinute)) }
            )
        }

        Text(
            text = stringResource(R.string.events_detail_section_registration_actions),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onJoin, enabled = canJoin) {
                Text(stringResource(R.string.events_detail_action_join))
            }
            OutlinedButton(onClick = onCancel, enabled = canCancel) {
                Text(stringResource(R.string.events_detail_action_cancel))
            }
            OutlinedButton(onClick = onWaitlist, enabled = canWaitlist) {
                Text(stringResource(R.string.events_detail_action_waitlist))
            }
        }

        if (isAdmin) {
            Text(
                text = stringResource(R.string.events_detail_section_admin),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
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
                label = { Text(stringResource(R.string.events_detail_input_description)) }
            )
            OutlinedTextField(
                value = editDeadline,
                onValueChange = { editDeadline = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.events_detail_input_deadline)) }
            )
            OutlinedTextField(
                value = editCapacity,
                onValueChange = { editCapacity = it.filter { ch -> ch.isDigit() } },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.events_detail_input_capacity)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = editRulesText,
                onValueChange = { editRulesText = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.events_detail_input_rules)) }
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
                        editRulesText.lines()
                    )
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.events_detail_save_changes))
            }

            Text(
                text = stringResource(R.string.events_detail_section_manage_participants),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            event.participants.forEach { participant ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = stringResource(
                            R.string.events_detail_participant_status,
                            participant.displayName,
                            participant.status.name
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f)
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(
                            onClick = {
                                onAdminSetParticipantStatus(
                                    participant.id,
                                    RegistrationStatus.Registered
                                )
                            }
                        ) {
                            Text(stringResource(R.string.events_detail_status_registered_short))
                        }
                        OutlinedButton(
                            onClick = {
                                onAdminSetParticipantStatus(
                                    participant.id,
                                    RegistrationStatus.Waitlist
                                )
                            }
                        ) {
                            Text(stringResource(R.string.events_detail_status_waitlist_short))
                        }
                        OutlinedButton(
                            onClick = {
                                onAdminSetParticipantStatus(
                                    participant.id,
                                    RegistrationStatus.NotRegistered
                                )
                            }
                        ) {
                            Text(stringResource(R.string.events_detail_status_none_short))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
        )
        Text(text = value, style = MaterialTheme.typography.bodyLarge)
    }
}
