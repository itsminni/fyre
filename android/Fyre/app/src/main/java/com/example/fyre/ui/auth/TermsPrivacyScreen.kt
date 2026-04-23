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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.fyre.R
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
            text = stringResource(R.string.terms_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = stringResource(R.string.terms_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f)
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = stringResource(R.string.terms_section_1),
            style = MaterialTheme.typography.bodyLarge
        )

        Text(
            text = stringResource(R.string.terms_section_2),
            style = MaterialTheme.typography.bodyLarge
        )

        Text(
            text = stringResource(R.string.terms_section_3),
            style = MaterialTheme.typography.bodyLarge
        )

        Text(
            text = stringResource(R.string.terms_section_4),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold
        )

        Spacer(modifier = Modifier.height(16.dp))

        FyreButton(
            text = stringResource(R.string.terms_accept_and_continue),
            onClick = onAccept,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedButton(
            onClick = onDecline,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(R.string.common_cancel))
        }
    }
}

