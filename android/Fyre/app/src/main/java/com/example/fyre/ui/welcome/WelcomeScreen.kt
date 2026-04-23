package com.example.fyre.ui.welcome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.fyre.R
import com.example.fyre.ui.components.FyreButton
import com.example.fyre.ui.theme.FyreGradientEnd
import com.example.fyre.ui.theme.FyreGradientStart

/**
 * Schermata di Benvenuto (Welcome / Onboarding).
 *
 * È la prima schermata che l'utente vede all'apertura dell'app.
 * Mostra il brand "Fyre" con animazioni di entrata, una breve
 * descrizione e due pulsanti per accedere o registrarsi.
 *
 * Design: gradiente caldo di sfondo, logo grande animato,
 * layout centrato e pulsanti ben distinti (filled + outlined).
 *
 * @param onNavigateToLogin Callback per navigare alla schermata di login
 * @param onNavigateToRegister Callback per navigare alla schermata di registrazione
 * @param onNavigateToTerms Callback per navigare a termini e privacy
 */
@Composable
fun WelcomeScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onNavigateToTerms: () -> Unit
) {
    val appName = stringResource(R.string.app_name)

    // ============================================================
    // Animazioni di entrata
    // ============================================================

    // Animazione scala per il logo (parte da 0.5 e arriva a 1.0)
    val logoScale = remember { Animatable(0.5f) }
    // Animazione opacità per il contenuto testuale
    val contentAlpha = remember { Animatable(0f) }
    // Animazione opacità per i bottoni (appare dopo il testo)
    val buttonsAlpha = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        // 1. Anima il logo
        logoScale.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 800, easing = FastOutSlowInEasing)
        )
        // 2. Anima il testo
        contentAlpha.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 600)
        )
        // 3. Anima i bottoni
        buttonsAlpha.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = 500)
        )
    }

    // ============================================================
    // Layout principale
    // ============================================================
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // --- Cerchio decorativo in alto a destra ---
        Box(
            modifier = Modifier
                .size(200.dp)
                .align(Alignment.TopEnd)
                .padding(top = 0.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            FyreGradientStart.copy(alpha = 0.15f),
                            FyreGradientEnd.copy(alpha = 0.05f),
                            MaterialTheme.colorScheme.background
                        )
                    ),
                    shape = CircleShape
                )
        )

        // --- Cerchio decorativo in basso a sinistra ---
        Box(
            modifier = Modifier
                .size(260.dp)
                .align(Alignment.BottomStart)
                .padding(bottom = 0.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            FyreGradientEnd.copy(alpha = 0.12f),
                            FyreGradientStart.copy(alpha = 0.04f),
                            MaterialTheme.colorScheme.background
                        )
                    ),
                    shape = CircleShape
                )
        )

        // ============================================================
        // Contenuto centrato
        // ============================================================
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // --- Logo animato ---
            Text(
                text = "🔥",
                fontSize = 80.sp,
                modifier = Modifier
                    .scale(logoScale.value)
                    .padding(bottom = 8.dp),
                textAlign = TextAlign.Center
            )

            // --- Nome app ---
            Text(
                text = appName,
                style = MaterialTheme.typography.displayLarge.copy(
                    fontSize = 52.sp,
                    letterSpacing = (-1).sp
                ),
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier
                    .scale(logoScale.value)
            )

            Spacer(modifier = Modifier.height(16.dp))

            // --- Tagline / descrizione breve ---
            Column(
                modifier = Modifier.alpha(contentAlpha.value),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(R.string.welcome_title),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = stringResource(R.string.welcome_description, appName),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                    textAlign = TextAlign.Center,
                    lineHeight = 24.sp
                )
            }

            Spacer(modifier = Modifier.height(48.dp))

            // ============================================================
            // Bottoni di azione
            // ============================================================
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .alpha(buttonsAlpha.value),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // --- Bottone primario: Accedi ---
                FyreButton(
                    text = stringResource(R.string.welcome_cta_login),
                    onClick = onNavigateToLogin
                )

                // --- Bottone secondario: Registrati (outlined) ---
                OutlinedButton(
                    onClick = onNavigateToRegister,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    border = ButtonDefaults.outlinedButtonBorder(enabled = true),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text(
                        text = stringResource(R.string.welcome_cta_create_account),
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold
                    )
                }

                TextButton(
                    onClick = onNavigateToTerms,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(stringResource(R.string.welcome_terms_link))
                }
            }
        }

        // ============================================================
        // Footer — testo in basso
        // ============================================================
        Text(
            text = stringResource(R.string.welcome_footer, appName),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.3f),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 32.dp),
            textAlign = TextAlign.Center
        )
    }
}



