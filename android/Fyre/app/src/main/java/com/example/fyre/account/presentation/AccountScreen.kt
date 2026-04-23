package com.example.fyre.account.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.fyre.R
import com.example.fyre.account.model.AccountSection
import com.example.fyre.account.model.AccountUiState
import com.example.fyre.account.model.ThemeMode
import com.example.fyre.data.local.UserSettingsDataStore

@Composable
fun AccountScreen(
    onLogout: () -> Unit,
    currentUserEmail: String? = null,
    currentUserDisplayName: String? = null
) {
    val context = LocalContext.current
    val userSettingsDataStore = remember(context.applicationContext) {
        UserSettingsDataStore(context.applicationContext)
    }

    val vm: AccountViewModel = viewModel(
        key = "account_${currentUserEmail.orEmpty()}",
        factory = AccountViewModelFactory(
            initialEmail = currentUserEmail,
            initialDisplayName = currentUserDisplayName,
            userSettingsDataStore = userSettingsDataStore
        )
    )
    val state by vm.uiState.collectAsState()

    when (state.selectedSection) {
        null -> AccountHubSection(
            state = state,
            onOpenSection = vm::openSection,
            onLogout = onLogout
        )

        AccountSection.EditProfile -> EditProfileSection(
            state = state,
            onBack = vm::backToHub,
            onUpdate = vm::updateProfile
        )

        AccountSection.DiscoveryPreferences -> DiscoveryPreferencesSection(
            state = state,
            onBack = vm::backToHub,
            onUpdate = vm::updateDiscoveryPreferences
        )

        AccountSection.Notifications -> NotificationsSection(
            state = state,
            onBack = vm::backToHub,
            onUpdate = vm::updateNotificationSettings
        )

        AccountSection.Security -> SecuritySection(
            state = state,
            onBack = vm::backToHub,
            onUpdate = vm::updateSecuritySettings
        )

        AccountSection.Appearance -> AppearanceSection(
            state = state,
            onBack = vm::backToHub,
            onSetThemeMode = vm::setThemeMode,
            onUpdate = vm::updateAppearanceSettings,
            onUpdateChatCustomization = vm::updateChatCustomizationSettings
        )

        AccountSection.EventHistory -> EventHistorySection(
            state = state,
            onBack = vm::backToHub
        )
    }
}

@Composable
private fun AccountHubSection(
    state: AccountUiState,
    onOpenSection: (AccountSection) -> Unit,
    onLogout: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = stringResource(R.string.account_hub_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        if (state.displayName.isNotBlank() || state.email.isNotBlank()) {
            Text(
                text = stringResource(
                    R.string.account_user_email_summary,
                    state.displayName.ifBlank { stringResource(R.string.account_user_fallback) },
                    state.email.ifBlank { stringResource(R.string.account_email_fallback) }
                ),
                style = MaterialTheme.typography.bodyMedium
            )
        }

        AccountSection.entries.forEach { section ->
            Card(
                onClick = { onOpenSection(section) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = stringResource(section.titleRes),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(14.dp)
                )
            }
        }

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Logout,
                contentDescription = stringResource(R.string.common_logout),
                modifier = Modifier.padding(end = 8.dp)
            )
            Text(text = stringResource(R.string.common_logout))
        }
    }
}

@Composable
private fun EditProfileSection(
    state: AccountUiState,
    onBack: () -> Unit,
    onUpdate: (com.example.fyre.account.model.ProfileDraft) -> Unit
) {
    val profile = state.profileDraft

    SectionScaffold(title = stringResource(R.string.account_section_edit_profile), onBack = onBack) {
        OutlinedTextField(
            value = profile.firstName,
            onValueChange = { onUpdate(profile.copy(firstName = it)) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.common_name)) }
        )
        OutlinedTextField(
            value = profile.lastName,
            onValueChange = { onUpdate(profile.copy(lastName = it)) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.common_last_name)) }
        )
        OutlinedTextField(
            value = profile.username,
            onValueChange = { onUpdate(profile.copy(username = it)) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.common_username)) }
        )
        OutlinedTextField(
            value = profile.city,
            onValueChange = { onUpdate(profile.copy(city = it)) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.common_city)) }
        )
        OutlinedTextField(
            value = profile.bio,
            onValueChange = { onUpdate(profile.copy(bio = it)) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.common_bio)) }
        )
        state.localStatusMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun DiscoveryPreferencesSection(
    state: AccountUiState,
    onBack: () -> Unit,
    onUpdate: (com.example.fyre.account.model.DiscoveryPreferences) -> Unit
) {
    val prefs = state.discoveryPreferences

    SectionScaffold(title = stringResource(R.string.account_section_discovery_preferences), onBack = onBack) {
        OutlinedTextField(
            value = prefs.minAge.toString(),
            onValueChange = {
                val next = it.toIntOrNull() ?: prefs.minAge
                onUpdate(prefs.copy(minAge = next.coerceAtLeast(18)))
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.account_age_min_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
        OutlinedTextField(
            value = prefs.maxAge.toString(),
            onValueChange = {
                val next = it.toIntOrNull() ?: prefs.maxAge
                onUpdate(prefs.copy(maxAge = next.coerceAtLeast(prefs.minAge)))
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.account_age_max_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
        OutlinedTextField(
            value = prefs.maxDistanceKm.toString(),
            onValueChange = {
                val next = it.toIntOrNull() ?: prefs.maxDistanceKm
                onUpdate(prefs.copy(maxDistanceKm = next.coerceAtLeast(1)))
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.account_distance_max_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )
        OutlinedTextField(
            value = prefs.intent,
            onValueChange = { onUpdate(prefs.copy(intent = it)) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.account_intent_label)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_only_verified),
            checked = prefs.showOnlyVerified,
            onCheckedChange = { onUpdate(prefs.copy(showOnlyVerified = it)) }
        )
        state.localStatusMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun NotificationsSection(
    state: AccountUiState,
    onBack: () -> Unit,
    onUpdate: (com.example.fyre.account.model.NotificationSettings) -> Unit
) {
    val notifications = state.notificationSettings

    SectionScaffold(title = stringResource(R.string.account_section_notifications), onBack = onBack) {
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_push_notifications),
            checked = notifications.pushEnabled,
            onCheckedChange = { onUpdate(notifications.copy(pushEnabled = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_messages),
            checked = notifications.messageNotifications,
            onCheckedChange = { onUpdate(notifications.copy(messageNotifications = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_matches),
            checked = notifications.matchNotifications,
            onCheckedChange = { onUpdate(notifications.copy(matchNotifications = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_event_reminders),
            checked = notifications.eventReminders,
            onCheckedChange = { onUpdate(notifications.copy(eventReminders = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_marketing),
            checked = notifications.marketingUpdates,
            onCheckedChange = { onUpdate(notifications.copy(marketingUpdates = it)) }
        )
        state.localStatusMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun SecuritySection(
    state: AccountUiState,
    onBack: () -> Unit,
    onUpdate: (com.example.fyre.account.model.SecuritySettings) -> Unit
) {
    val security = state.securitySettings

    SectionScaffold(title = stringResource(R.string.account_section_security), onBack = onBack) {
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_biometric),
            checked = security.biometricUnlock,
            onCheckedChange = { onUpdate(security.copy(biometricUnlock = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_two_factor),
            checked = security.twoFactorEnabled,
            onCheckedChange = { onUpdate(security.copy(twoFactorEnabled = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_hide_online),
            checked = security.hideOnlineStatus,
            onCheckedChange = { onUpdate(security.copy(hideOnlineStatus = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_session_pin),
            checked = security.sessionPinEnabled,
            onCheckedChange = { onUpdate(security.copy(sessionPinEnabled = it)) }
        )
        state.localStatusMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun AppearanceSection(
    state: AccountUiState,
    onBack: () -> Unit,
    onSetThemeMode: (ThemeMode) -> Unit,
    onUpdate: (com.example.fyre.account.model.AppearanceSettings) -> Unit,
    onUpdateChatCustomization: (com.example.fyre.account.model.ChatCustomizationSettings) -> Unit
) {
    val appearance = state.appearanceSettings
    val chat = state.chatCustomizationSettings

    SectionScaffold(title = stringResource(R.string.account_section_appearance), onBack = onBack) {
        Text(
            text = stringResource(R.string.account_theme_label),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onSetThemeMode(ThemeMode.System) }) {
                Text(stringResource(R.string.account_theme_system))
            }
            OutlinedButton(onClick = { onSetThemeMode(ThemeMode.Light) }) {
                Text(stringResource(R.string.account_theme_light))
            }
            OutlinedButton(onClick = { onSetThemeMode(ThemeMode.Dark) }) {
                Text(stringResource(R.string.account_theme_dark))
            }
        }
        Text(text = stringResource(R.string.account_theme_current, appearance.themeMode.name))
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_dynamic_color),
            checked = appearance.dynamicColor,
            onCheckedChange = { onUpdate(appearance.copy(dynamicColor = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_compact_mode),
            checked = appearance.compactMode,
            onCheckedChange = { onUpdate(appearance.copy(compactMode = it)) }
        )

        Text(
            text = stringResource(R.string.account_chat_label),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_compact_bubbles),
            checked = chat.compactBubbles,
            onCheckedChange = { onUpdateChatCustomization(chat.copy(compactBubbles = it)) }
        )
        SettingSwitchRow(
            label = stringResource(R.string.account_switch_show_timestamps),
            checked = chat.showTimestamps,
            onCheckedChange = { onUpdateChatCustomization(chat.copy(showTimestamps = it)) }
        )
        state.localStatusMessage?.let {
            Text(text = it, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun EventHistorySection(
    state: AccountUiState,
    onBack: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
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
                    contentDescription = stringResource(R.string.account_back_to_hub_cd)
                )
            }
            Text(
                text = stringResource(R.string.account_section_event_history),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.eventHistory, key = { it.id }) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(item.title, style = MaterialTheme.typography.titleMedium)
                        Text(item.dateText, style = MaterialTheme.typography.bodyMedium)
                        Text(item.place, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            text = stringResource(R.string.account_event_status, item.status.name),
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionScaffold(
    title: String,
    onBack: () -> Unit,
    content: @Composable () -> Unit
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
                    contentDescription = stringResource(R.string.account_back_to_hub_cd)
                )
            }
            Text(text = title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }

        content()
    }
}

@Composable
private fun SettingSwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyLarge)
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
