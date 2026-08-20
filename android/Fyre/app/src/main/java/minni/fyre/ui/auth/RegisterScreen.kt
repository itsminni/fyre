package minni.fyre.ui.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.Checkbox
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
import minni.fyre.R
import minni.fyre.ui.components.FyreButton
import minni.fyre.ui.components.FyrePasswordField
import minni.fyre.ui.components.FyreTextField

@Composable
fun RegisterScreen(
    viewModel: AuthViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToLogin: () -> Unit,
    onNavigateToDemoNotice: () -> Unit,
    onRegisterSuccess: () -> Unit
) {
    val appName = stringResource(R.string.app_name)


    val displayName by viewModel.displayName.collectAsState()
    val email by viewModel.email.collectAsState()
    val password by viewModel.password.collectAsState()
    val confirmPassword by viewModel.confirmPassword.collectAsState()
    val demoNoticeRead by viewModel.demoNoticeRead.collectAsState()
    val displayNameError by viewModel.displayNameError.collectAsState()
    val emailError by viewModel.emailError.collectAsState()
    val passwordError by viewModel.passwordError.collectAsState()
    val confirmPasswordError by viewModel.confirmPasswordError.collectAsState()
    val demoNoticeError by viewModel.demoNoticeError.collectAsState()
    val globalError by viewModel.globalError.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val authState by viewModel.authState.collectAsState()


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

Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = stringResource(R.string.auth_register_title),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = stringResource(R.string.auth_register_subtitle, appName),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
            )

            Spacer(modifier = Modifier.height(24.dp))

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

                    FyreTextField(
                        value = displayName,
                        onValueChange = { viewModel.updateDisplayName(it) },
                        label = stringResource(R.string.common_name),
                        placeholder = stringResource(R.string.auth_register_name_placeholder),
                        isError = displayNameError != null,
                        supportingText = displayNameError,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Person,
                                contentDescription = stringResource(R.string.common_name),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    )


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


                    FyrePasswordField(
                        value = password,
                        onValueChange = { viewModel.updatePassword(it) },
                        label = stringResource(R.string.common_password),
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Lock,
                                contentDescription = stringResource(R.string.common_password),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        isError = passwordError != null,
                        supportingText = passwordError
                            ?: if (password.isNotEmpty()) {
                                stringResource(R.string.auth_register_password_hint)
                            } else {
                                null
                            }
                    )


                    FyrePasswordField(
                        value = confirmPassword,
                        onValueChange = { viewModel.updateConfirmPassword(it) },
                        label = stringResource(R.string.auth_register_confirm_password),
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Outlined.Lock,
                                contentDescription = stringResource(R.string.auth_register_confirm_password),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        isError = confirmPasswordError != null,
                        supportingText = confirmPasswordError
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = demoNoticeRead,
                            onCheckedChange = { viewModel.setDemoNoticeRead(it) }
                        )
                        Text(
                            text = stringResource(R.string.auth_register_demo_notice_checkbox),
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.clickable {
                                viewModel.setDemoNoticeRead(!demoNoticeRead)
                            }
                        )
                    }

                    TextButton(
                        onClick = onNavigateToDemoNotice,
                        modifier = Modifier.align(Alignment.Start)
                    ) {
                        Text(stringResource(R.string.welcome_demo_notice_link))
                    }

                    if (demoNoticeError != null) {
                        Text(
                            text = demoNoticeError ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }


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


                    FyreButton(
                        text = if (isLoading) {
                            stringResource(R.string.auth_register_loading)
                        } else {
                            stringResource(R.string.auth_register_cta)
                        },
                        onClick = { viewModel.register() },
                        isLoading = isLoading
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

TextButton(onClick = onNavigateToLogin) {
                Text(
                    text = stringResource(R.string.auth_register_login_prompt),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
        }

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
