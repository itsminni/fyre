package com.example.fyre.ui.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.fyre.R
import com.example.fyre.ui.components.FyreButton
import com.example.fyre.ui.components.FyrePasswordField
import com.example.fyre.ui.components.FyreTextField

/**
 * Schermata di Login.
 *
 * Presenta un form con email e password per l'accesso all'app.
 * Design moderno con card rialzata su sfondo colorato e titolo "Fyre".
 *
 * @param viewModel ViewModel condiviso per l'autenticazione
 * @param onNavigateBack Callback per tornare alla schermata precedente (Welcome)
 * @param onNavigateToRegister Callback per navigare alla registrazione
 * @param onLoginSuccess Callback eseguita dopo un login riuscito
 */
@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onLoginSuccess: () -> Unit
) {
    val appName = stringResource(R.string.app_name)

    // Raccoglie lo stato dal ViewModel
    val email by viewModel.email.collectAsState()
    val password by viewModel.password.collectAsState()
    val emailError by viewModel.emailError.collectAsState()
    val passwordError by viewModel.passwordError.collectAsState()
    val globalError by viewModel.globalError.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val authState by viewModel.authState.collectAsState()

    // Naviga automaticamente alla Home se il login ha successo
    LaunchedEffect(authState) {
        if (authState is AuthState.Success) {
            onLoginSuccess()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()) // Scrollabile per schermi piccoli
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // ============================================================
            // Header — Logo e titolo dell'app
            // ============================================================
            Spacer(modifier = Modifier.height(48.dp))

            // Icona fuoco stilizzata con emoji (semplice ma efficace)
            Text(
                text = "🔥",
                style = MaterialTheme.typography.displayLarge,
                modifier = Modifier.size(80.dp),
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Nome dell'app
            Text(
                text = appName,
                style = MaterialTheme.typography.displayLarge,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold
            )

            // Sottotitolo
            Text(
                text = stringResource(R.string.auth_login_subtitle),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
            )

            Spacer(modifier = Modifier.height(32.dp))

            // ============================================================
            // Card con il form di login
            // ============================================================
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // --- Campo Email ---
                    FyreTextField(
                        value = email,
                        onValueChange = { viewModel.updateEmail(it) },
                        label = stringResource(R.string.common_email),
                        placeholder = stringResource(R.string.auth_login_email_placeholder),
                        isError = emailError != null,
                        supportingText = emailError,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Email,
                                contentDescription = stringResource(R.string.common_email),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    )

                    // --- Campo Password ---
                    FyrePasswordField(
                        value = password,
                        onValueChange = { viewModel.updatePassword(it) },
                        label = stringResource(R.string.common_password),
                        isError = passwordError != null,
                        supportingText = passwordError,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Lock,
                                contentDescription = stringResource(R.string.common_password),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    )

                    // --- Messaggio di errore ---
                    AnimatedVisibility(
                        visible = globalError != null,
                        enter = fadeIn(),
                        exit = fadeOut()
                    ) {
                        if (globalError != null) {
                            Text(
                                text = globalError ?: "",
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // --- Bottone Login ---
                    FyreButton(
                        text = if (isLoading) {
                            stringResource(R.string.auth_login_loading)
                        } else {
                            stringResource(R.string.welcome_cta_login)
                        },
                        onClick = { viewModel.login() },
                        isLoading = isLoading
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // ============================================================
            // Link alla registrazione
            // ============================================================
            TextButton(onClick = onNavigateToRegister) {
                Text(
                    text = stringResource(R.string.auth_login_register_prompt),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }

        // --- Pulsante Indietro (torna alla Welcome) ---
        // Posizionato per ultimo nel Box così resta sopra la Column e riceve i tocchi
        IconButton(
            onClick = onNavigateBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 8.dp, top = 40.dp)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.common_back),
                tint = MaterialTheme.colorScheme.onBackground
            )
        }
    }
}

