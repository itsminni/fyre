package com.example.fyre.ui.auth

import com.example.fyre.data.model.hasCompleteProfile
import com.example.fyre.data.repository.FakeAuthRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthViewModelTest {

    @Test
    fun restore_session_loads_user_from_saved_email() {
        val repository = FakeAuthRepository()
        val registerVm = AuthViewModel(repository)

        registerVm.updateDisplayName("Mario Rossi")
        registerVm.updateEmail("mario@example.com")
        registerVm.updatePassword("Password1")
        registerVm.updateConfirmPassword("Password1")
        registerVm.setTermsAccepted(true)
        registerVm.register()

        val restoredVm = AuthViewModel(repository)
        val restored = restoredVm.restoreSession("mario@example.com")

        assertTrue(restored)
        assertEquals("mario@example.com", restoredVm.currentUser.value?.email)
    }

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

    @Test
    fun save_profile_setup_requires_avatar_and_marks_profile_complete() {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateDisplayName("Mario Rossi")
        viewModel.updateEmail("mario@example.com")
        viewModel.updatePassword("Password1")
        viewModel.updateConfirmPassword("Password1")
        viewModel.setTermsAccepted(true)
        viewModel.register()

        viewModel.updateProfileFirstName("Mario")
        viewModel.updateProfileLastName("Rossi")
        viewModel.updateProfileUsername("mariorossi")
        viewModel.updateProfileCity("Milano")
        viewModel.updateProfileBirthDate("01/01/2000")

        assertFalse(viewModel.saveProfileSetup())
        assertEquals("Seleziona un avatar", viewModel.profileError.value)

        viewModel.updateProfileAvatarUri("content://avatar/mock.png")

        assertTrue(viewModel.saveProfileSetup())
        assertTrue(viewModel.hasCompletedProfile())
        assertTrue(viewModel.currentUser.value?.hasCompleteProfile() == true)
        assertTrue(viewModel.profileError.value == null)
    }
}

