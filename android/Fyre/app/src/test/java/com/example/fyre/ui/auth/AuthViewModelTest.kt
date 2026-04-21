package com.example.fyre.ui.auth

import com.example.fyre.data.repository.FakeAuthRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthViewModelTest {

    @Test
    fun register_without_terms_sets_terms_error() {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateDisplayName("Mario Rossi")
        viewModel.updateEmail("mario@example.com")
        viewModel.updatePassword("Password1")
        viewModel.updateConfirmPassword("Password1")

        viewModel.register()

        assertEquals(
            "Devi accettare Termini e Privacy per continuare",
            viewModel.termsError.value
        )
    }

    @Test
    fun register_with_terms_succeeds_and_stores_consent_timestamp() {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateDisplayName("Mario Rossi")
        viewModel.updateEmail("mario@example.com")
        viewModel.updatePassword("Password1")
        viewModel.updateConfirmPassword("Password1")
        viewModel.setTermsAccepted(true)

        viewModel.register()

        val state = viewModel.authState.value
        assertTrue(state is AuthState.Success)
        val user = (state as AuthState.Success).user
        assertNotNull(user.termsAcceptedAt)
        assertNotNull(user.privacyAcceptedAt)
    }
}

