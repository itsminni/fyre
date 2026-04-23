package com.example.fyre.events.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.RegistrationStatus

@Composable
fun EventDetailScreen(
    event: EventItem,
    isAdminInMock: Boolean,
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
                    contentDescription = "Torna agli eventi"
                )
            }
            Text(
                text = event.title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }

        DetailRow(label = "Data", value = event.dateText)
        DetailRow(label = "Luogo", value = event.place)
        DetailRow(label = "Deadline", value = event.deadlineText)
        DetailRow(label = "Capienza", value = "${event.registeredCount}/${event.capacity}")
        DetailRow(label = "Stato utente evento", value = userStateLabel)

        Text(text = "Descrizione", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(text = event.description, style = MaterialTheme.typography.bodyMedium)

        Text(text = "Regole", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            event.rules.forEach { rule ->
                Text(text = "- $rule", style = MaterialTheme.typography.bodyMedium)
            }
        }

        Text(text = "Metriche live", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AssistChip(onClick = {}, label = { Text("Online ${event.liveMetrics.viewersOnline}") })
            AssistChip(onClick = {}, label = { Text("Check-in ${event.liveMetrics.checkIns}") })
            AssistChip(onClick = {}, label = { Text("Chat/min ${event.liveMetrics.chatPerMinute}") })
        }

        Text(text = "Azioni iscrizione", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onJoin, enabled = canJoin) {
                Text("Join")
            }
            OutlinedButton(onClick = onCancel, enabled = canCancel) {
                Text("Cancel")
            }
            OutlinedButton(onClick = onWaitlist, enabled = canWaitlist) {
                Text("Waitlist")
            }
        }

        if (isAdminInMock) {
            Text(text = "Admin mock", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)

            OutlinedTextField(
                value = editTitle,
                onValueChange = { editTitle = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Titolo") }
            )
            OutlinedTextField(
                value = editDate,
                onValueChange = { editDate = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Data") }
            )
            OutlinedTextField(
                value = editPlace,
                onValueChange = { editPlace = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Luogo") }
            )
            OutlinedTextField(
                value = editDescription,
                onValueChange = { editDescription = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Descrizione") }
            )
            OutlinedTextField(
                value = editDeadline,
                onValueChange = { editDeadline = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Deadline") }
            )
            OutlinedTextField(
                value = editCapacity,
                onValueChange = { editCapacity = it.filter { ch -> ch.isDigit() } },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Capienza") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
            OutlinedTextField(
                value = editRulesText,
                onValueChange = { editRulesText = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Regole (una per riga)") }
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
                Text("Salva modifiche evento")
            }

            Text(text = "Gestione partecipanti", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            event.participants.forEach { participant ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${participant.displayName} - ${participant.status.name}",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f)
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(onClick = { onAdminSetParticipantStatus(participant.id, RegistrationStatus.Registered) }) {
                            Text("R")
                        }
                        OutlinedButton(onClick = { onAdminSetParticipantStatus(participant.id, RegistrationStatus.Waitlist) }) {
                            Text("W")
                        }
                        OutlinedButton(onClick = { onAdminSetParticipantStatus(participant.id, RegistrationStatus.NotRegistered) }) {
                            Text("N")
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

