package com.example.fyre.events.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.fyre.events.model.EventItem
import com.example.fyre.events.model.RegistrationStatus

@Composable
fun EventDetailScreen(
    event: EventItem,
    onBack: () -> Unit,
    onSetStatus: (RegistrationStatus) -> Unit
) {
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
        DetailRow(label = "Stato iscrizione", value = event.registrationStatus.name)

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

        Text(text = "Aggiorna stato", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onSetStatus(RegistrationStatus.Registered) }) {
                Text("Iscriviti")
            }
            OutlinedButton(onClick = { onSetStatus(RegistrationStatus.NotRegistered) }) {
                Text("Annulla")
            }
            OutlinedButton(onClick = { onSetStatus(RegistrationStatus.Waitlist) }) {
                Text("Waitlist")
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

