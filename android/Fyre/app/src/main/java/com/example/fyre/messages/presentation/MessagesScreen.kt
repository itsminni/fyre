package com.example.fyre.messages.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Placeholder della feature Messages per estensione futura.
 */
@Composable
fun MessagesScreen(openThreadId: String? = null) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(text = "Messages")
        if (!openThreadId.isNullOrBlank()) {
            Text(text = "Thread pronto: $openThreadId")
            Text(text = "Hook attivo: in futuro qui si aprira la conversazione reale.")
        }
    }
}

