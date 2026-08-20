package minni.fyre.ui.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

class AppSessionViewModelTest {

    @Test
    fun bootstrap_sets_expected_root_state() {
        val viewModel = AppSessionViewModel()

        viewModel.bootstrap(isAuthenticated = false, isProfileComplete = false)
        assertEquals(AppSessionState.Unauthenticated, viewModel.sessionState.value)

        viewModel.bootstrap(isAuthenticated = true, isProfileComplete = false)
        assertEquals(AppSessionState.AuthenticatedProfileIncomplete, viewModel.sessionState.value)

        viewModel.bootstrap(isAuthenticated = true, isProfileComplete = true)
        assertEquals(AppSessionState.AuthenticatedProfileComplete, viewModel.sessionState.value)
    }

    @Test
    fun auth_completion_and_logout_transitions_are_consistent() {
        val viewModel = AppSessionViewModel()

        viewModel.onAuthenticated(isProfileComplete = false)
        assertEquals(AppSessionState.AuthenticatedProfileIncomplete, viewModel.sessionState.value)

        viewModel.completeProfile()
        assertEquals(AppSessionState.AuthenticatedProfileComplete, viewModel.sessionState.value)

        viewModel.logout()
        assertEquals(AppSessionState.Unauthenticated, viewModel.sessionState.value)
    }
}

