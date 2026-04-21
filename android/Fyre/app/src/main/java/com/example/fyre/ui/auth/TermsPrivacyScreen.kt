package com.example.fyre.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.fyre.ui.components.FyreButton

@Composable
fun TermsPrivacyScreen(
    onAccept: () -> Unit,
    onDecline: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "Termini e Privacy",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "Versione bozza locale: continuando confermi di aver letto e compreso condizioni d'uso e informativa privacy.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f)
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "1) Usi consentiti\nL'app e ad uso didattico. Evita contenuti illeciti o dannosi.",
            style = MaterialTheme.typography.bodyLarge
        )

        Text(
            text = "2) Dati trattati\nI dati restano in locale su questo dispositivo finche non verra integrato un backend.",
            style = MaterialTheme.typography.bodyLarge
        )

        Text(
            text = "3) Responsabilita\nLe credenziali sono gestite localmente in ambiente di sviluppo e non rappresentano un servizio di produzione.",
            style = MaterialTheme.typography.bodyLarge
        )

        Text(
            text = "4) Consenso\nPer registrarti e obbligatorio accettare Termini e Privacy.",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold
        )

        Spacer(modifier = Modifier.height(16.dp))

        FyreButton(
            text = "Accetto e continuo",
            onClick = onAccept,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedButton(
            onClick = onDecline,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Annulla")
        }
    }
}

