package com.example.fyre.account.presentation

import com.example.fyre.account.model.AccountSection
import com.example.fyre.account.model.ThemeMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountViewModelTest {

    @Test
    fun open_section_and_back_updates_hub_navigation_state() {
        val viewModel = AccountViewModel(
            initialEmail = "mario@example.com",
            initialDisplayName = "Mario Rossi"
        )

        viewModel.openSection(AccountSection.Security)
        assertEquals(AccountSection.Security, viewModel.uiState.value.selectedSection)

        viewModel.backToHub()
        assertEquals(null, viewModel.uiState.value.selectedSection)
    }

    @Test
    fun update_discovery_preferences_persists_local_state() {
        val viewModel = AccountViewModel(
            initialEmail = "mario@example.com",
            initialDisplayName = "Mario Rossi"
        )

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
    fun set_theme_mode_updates_appearance_settings() {
        val viewModel = AccountViewModel(
            initialEmail = "mario@example.com",
            initialDisplayName = "Mario Rossi"
        )

        viewModel.setThemeMode(ThemeMode.Dark)

        assertEquals(ThemeMode.Dark, viewModel.uiState.value.appearanceSettings.themeMode)
        assertFalse(viewModel.uiState.value.appearanceSettings.compactMode)
    }
}

