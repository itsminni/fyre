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
                showAge = false,
                showDistance = false,
                showInstagramTag = false
            )
        )

        val updated = viewModel.uiState.value.discoveryPreferences
        assertFalse(updated.showAge)
        assertFalse(updated.showDistance)
        assertFalse(updated.showInstagramTag)
    }

    @Test
    fun set_theme_mode_updates_appearance_settings() {
        val viewModel = viewModel()

        viewModel.setThemeMode(ThemeMode.Dark)

        assertEquals(ThemeMode.Dark, viewModel.uiState.value.appearanceSettings.themeMode)
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
                backgroundColor1Hex = "#111111",
                sendButtonColor1Hex = "#222222"
            )
        )

        val chat = viewModel.uiState.value.chatCustomizationSettings
        assertEquals("#111111", chat.backgroundColor1Hex)
        assertEquals("#222222", chat.sendButtonColor1Hex)
    }
}

