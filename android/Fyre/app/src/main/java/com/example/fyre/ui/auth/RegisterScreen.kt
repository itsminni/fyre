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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.fyre.ui.components.FyreButton
import com.example.fyre.ui.components.FyrePasswordField
import com.example.fyre.ui.components.FyreTextField

/**
 * Schermata di Registrazione.
 *
 * Form completo con nome, email, password e conferma password.
 * Include validazione in tempo reale della robustezza della password.
 *
 * @param viewModel ViewModel condiviso per l'autenticazione
 * @param onNavigateBack Callback per tornare alla schermata precedente
 * @param onNavigateToLogin Callback per tornare al login
 * @param onRegisterSuccess Callback eseguita dopo una registrazione riuscita
 */
@Composable
fun RegisterScreen(
    viewModel: AuthViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToLogin: () -> Unit,
    onRegisterSuccess: () -> Unit
) {
    // Raccoglie lo stato dal ViewModel
    val displayName by viewModel.displayName.collectAsState()
    val email by viewModel.email.collectAsState()
    val password by viewModel.password.collectAsState()
    val confirmPassword by viewModel.confirmPassword.collectAsState()
    val authState by viewModel.authState.collectAsState()

    // Calcola in tempo reale se la password rispetta i requisiti
    val passwordError = if (password.isNotEmpty()) viewModel.validatePassword(password) else null
    val passwordsMatch = confirmPassword.isEmpty() || password == confirmPassword

    // Naviga automaticamente alla Home se la registrazione ha successo
    LaunchedEffect(authState) {
        if (authState is AuthState.Success) {
            onRegisterSuccess()
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
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // ============================================================
            // Header — Titolo della schermata
            // ============================================================
            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "Crea Account",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = "Unisciti a Fyre 🔥",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
            )

            Spacer(modifier = Modifier.height(24.dp))

            // ============================================================
            // Card con il form di registrazione
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
                    // --- Campo Nome ---
                    FyreTextField(
                        value = displayName,
                        onValueChange = { viewModel.updateDisplayName(it) },
                        label = "Nome",
                        placeholder = "Mario Rossi",
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Person,
                                contentDescription = "Nome",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    )

                    // --- Campo Email ---
                    FyreTextField(
                        value = email,
                        onValueChange = { viewModel.updateEmail(it) },
                        label = "Email",
                        placeholder = "mario.rossi@email.com",
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Email,
                                contentDescription = "Email",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    )

                    // --- Campo Password con validazione in tempo reale ---
                    FyrePasswordField(
                        value = password,
                        onValueChange = { viewModel.updatePassword(it) },
                        label = "Password",
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Lock,
                                contentDescription = "Password",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        isError = passwordError != null,
                        supportingText = passwordError
                            ?: if (password.isNotEmpty()) "✓ Password valida" else "Min. 8 caratteri, 1 maiuscola, 1 numero"
                    )

                    // --- Campo Conferma Password ---
                    FyrePasswordField(
                        value = confirmPassword,
                        onValueChange = { viewModel.updateConfirmPassword(it) },
                        label = "Conferma Password",
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Lock,
                                contentDescription = "Conferma Password",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        isError = !passwordsMatch,
                        supportingText = if (!passwordsMatch) "Le password non corrispondono" else null
                    )

                    // --- Messaggio di errore dal server/repository ---
                    AnimatedVisibility(
                        visible = authState is AuthState.Error,
                        enter = fadeIn(),
                        exit = fadeOut()
                    ) {
                        if (authState is AuthState.Error) {
                            Text(
                                text = (authState as AuthState.Error).message,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // --- Bottone Registrazione ---
                    FyreButton(
                        text = "Registrati",
                        onClick = { viewModel.register() }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // ============================================================
            // Link al login
            // ============================================================
            TextButton(onClick = onNavigateToLogin) {
                Text(
                    text = "Hai già un account? Accedi",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }

        // --- Pulsante Indietro (torna alla schermata precedente) ---
        // Posizionato per ultimo nel Box così resta sopra la Column e riceve i tocchi
        IconButton(
            onClick = onNavigateBack,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 8.dp, top = 40.dp)
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Torna indietro",
                tint = MaterialTheme.colorScheme.onBackground
            )
        }
    }
}

