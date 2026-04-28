package com.example.fyre.account.presentation

import com.example.fyre.account.model.AccountSection
import com.example.fyre.account.model.ThemeMode
import com.example.fyre.data.model.User
import com.example.fyre.data.model.UserProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountViewModelTest {

    private fun viewModel(): AccountViewModel {
        return AccountViewModel(initialUser = testUser())
    }

    private fun testUser(): User {
        return User(
            email = "mario@example.com",
            passwordHash = "backend",
            displayName = "Mario Rossi",
            profile = UserProfile(
                firstName = "Mario",
                lastName = "Rossi",
                city = "Milano",
                birthDate = "01/01/2000",
                bio = "Ciao"
            ),
            appwriteUserId = "user_mario"
        )
    }

    @Test
    fun open_section_and_back_updates_hub_navigation_state() {
        val viewModel = viewModel()

        viewModel.openSection(AccountSection.Security)
        assertEquals(AccountSection.Security, viewModel.uiState.value.selectedSection)

        viewModel.backToHub()
        assertEquals(null, viewModel.uiState.value.selectedSection)
    }

    @Test
    fun update_discovery_preferences_persists_local_state() {
        val viewModel = viewModel()

        val current = viewModel.uiState.value.discoveryPreferences
        viewModel.updateDiscoveryPreferences(
            current.copy(
                minAge = 24,
                maxAge = 34,
                maxDistanceKm = 15,
                showOnlyVerified = true,
                intent = "Relazione seria"
            )
        )

        val updated = viewModel.uiState.value.discoveryPreferences
        assertEquals(24, updated.minAge)
        assertEquals(34, updated.maxAge)
        assertEquals(15, updated.maxDistanceKm)
        assertTrue(updated.showOnlyVerified)
        assertEquals("Relazione seria", updated.intent)
    }

    @Test
    fun update_discovery_preferences_normalizes_age_range() {
        val viewModel = viewModel()

        viewModel.updateDiscoveryPreferences(
            viewModel.uiState.value.discoveryPreferences.copy(
                minAge = 120,
                maxAge = 20,
                maxDistanceKm = 0
            )
        )

        val updated = viewModel.uiState.value.discoveryPreferences
        assertEquals(98, updated.minAge)
        assertEquals(99, updated.maxAge)
        assertEquals(1, updated.maxDistanceKm)
    }

    @Test
    fun set_theme_mode_updates_appearance_settings() {
        val viewModel = viewModel()

        viewModel.setThemeMode(ThemeMode.Dark)

        assertEquals(ThemeMode.Dark, viewModel.uiState.value.appearanceSettings.themeMode)
        assertFalse(viewModel.uiState.value.appearanceSettings.compactMode)
    }

    @Test
    fun update_appearance_settings_keeps_compact_mode() {
        val viewModel = viewModel()

        viewModel.updateAppearanceSettings(
            viewModel.uiState.value.appearanceSettings.copy(compactMode = true)
        )

        assertTrue(viewModel.uiState.value.appearanceSettings.compactMode)
    }

    @Test
    fun update_security_settings_updates_ui_state() {
        val viewModel = viewModel()

        viewModel.updateSecuritySettings(
            viewModel.uiState.value.securitySettings.copy(
                biometricUnlock = true,
                hideOnlineStatus = true
            )
        )

        val security = viewModel.uiState.value.securitySettings
        assertTrue(security.biometricUnlock)
        assertTrue(security.hideOnlineStatus)
    }

    @Test
    fun update_profile_draft_keeps_saved_hub_display_name() {
        val viewModel = viewModel()
        val before = viewModel.uiState.value.displayName

        viewModel.updateProfileDraft(
            viewModel.uiState.value.profileDraft.copy(
                firstName = "Giulia",
                lastName = "Bianchi",
                city = "Roma"
            )
        )

        val state = viewModel.uiState.value
        assertEquals(before, state.displayName)
        assertEquals("Roma", state.profileDraft.city)
        assertEquals(null, state.statusMessage)
    }

    @Test
    fun update_chat_customization_updates_ui_state() {
        val viewModel = viewModel()

        viewModel.updateChatCustomizationSettings(
            viewModel.uiState.value.chatCustomizationSettings.copy(
                compactBubbles = true,
                showTimestamps = false
            )
        )

        val chat = viewModel.uiState.value.chatCustomizationSettings
        assertTrue(chat.compactBubbles)
        assertFalse(chat.showTimestamps)
    }
}

