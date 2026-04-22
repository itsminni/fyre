package com.example.fyre.ui.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.fyre.ui.auth.AuthViewModel
import com.example.fyre.ui.components.FyreButton
import com.example.fyre.ui.components.FyreTextField

@Composable
fun ProfileCompletionScreen(
    viewModel: AuthViewModel,
    onCompleteProfile: () -> Unit,
    onLogout: () -> Unit
) {
    val firstName by viewModel.profileFirstName.collectAsState()
    val lastName by viewModel.profileLastName.collectAsState()
    val username by viewModel.profileUsername.collectAsState()
    val city by viewModel.profileCity.collectAsState()
    val birthDate by viewModel.profileBirthDate.collectAsState()
    val bio by viewModel.profileBio.collectAsState()
    val avatarUri by viewModel.profileAvatarUri.collectAsState()
    val profileError by viewModel.profileError.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.hydrateProfileDraftFromCurrentUser()
    }

    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        viewModel.updateProfileAvatarUri(uri?.toString())
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ) {
        Text(
            text = "Completa il tuo profilo",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Questi dati sono locali/mock e servono a sbloccare la main app.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.75f)
        )

        Spacer(modifier = Modifier.height(20.dp))

        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .clickable { avatarPickerLauncher.launch("image/*") },
            contentAlignment = Alignment.Center
        ) {
            if (!avatarUri.isNullOrBlank()) {
                AsyncImage(
                    model = avatarUri,
                    contentDescription = "Avatar profilo",
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Text("Avatar")
            }
        }

        Text(
            text = "Tocca per scegliere un'immagine",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            modifier = Modifier.padding(top = 8.dp)
        )

        Spacer(modifier = Modifier.height(16.dp))

        FyreTextField(
            value = firstName,
            onValueChange = viewModel::updateProfileFirstName,
            label = "Nome"
        )

        Spacer(modifier = Modifier.height(10.dp))

        FyreTextField(
            value = lastName,
            onValueChange = viewModel::updateProfileLastName,
            label = "Cognome"
        )

        Spacer(modifier = Modifier.height(10.dp))

        FyreTextField(
            value = username,
            onValueChange = viewModel::updateProfileUsername,
            label = "Username"
        )

        Spacer(modifier = Modifier.height(10.dp))

        FyreTextField(
            value = city,
            onValueChange = viewModel::updateProfileCity,
            label = "Citta"
        )

        Spacer(modifier = Modifier.height(10.dp))

        FyreTextField(
            value = birthDate,
            onValueChange = viewModel::updateProfileBirthDate,
            label = "Data nascita",
            placeholder = "GG/MM/AAAA"
        )

        Spacer(modifier = Modifier.height(10.dp))

        FyreTextField(
            value = bio,
            onValueChange = viewModel::updateProfileBio,
            label = "Bio",
            singleLine = false,
            placeholder = "Raccontati in poche righe"
        )

        if (profileError != null) {
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = profileError ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
        }

        Spacer(modifier = Modifier.height(20.dp))

        FyreButton(
            text = if (isLoading) "Salvataggio..." else "Completa profilo",
            onClick = {
                if (viewModel.saveProfileSetup()) {
                    onCompleteProfile()
                }
            },
            isLoading = isLoading
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            } else {
                Text("Logout")
            }
        }
    }
}

