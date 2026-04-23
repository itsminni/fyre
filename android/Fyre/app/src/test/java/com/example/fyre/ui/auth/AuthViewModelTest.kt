package com.example.fyre.ui.auth

import com.example.fyre.data.model.hasCompleteProfile
import com.example.fyre.data.repository.FakeAuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUpDispatcher() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun resetDispatcher() {
        Dispatchers.resetMain()
    }

    @Test
    fun login_with_blank_email_sets_email_error() = runTest {
        val viewModel = AuthViewModel(FakeAuthRepository())
        viewModel.updatePassword("Password1")

        viewModel.login()
        advanceUntilIdle()

        assertEquals("Inserisci l'email", viewModel.emailError.value)
    }

    @Test
    fun login_with_blank_password_sets_password_error() = runTest {
        val viewModel = AuthViewModel(FakeAuthRepository())
        viewModel.updateEmail("mario@example.com")

        viewModel.login()
        advanceUntilIdle()

        assertEquals("Inserisci la password", viewModel.passwordError.value)
    }

    @Test
    fun restore_session_loads_user_from_saved_email() = runTest {
        val repository = FakeAuthRepository()
        val registerVm = AuthViewModel(repository)

        registerVm.updateDisplayName("Mario Rossi")
        registerVm.updateEmail("mario@example.com")
        registerVm.updatePassword("Password1")
        registerVm.updateConfirmPassword("Password1")
        registerVm.setTermsAccepted(true)
        registerVm.register()
        advanceUntilIdle()

        val restoredVm = AuthViewModel(repository)
        val restored = restoredVm.restoreSession("mario@example.com")

        assertTrue(restored)
        assertEquals("mario@example.com", restoredVm.currentUser.value?.email)
    }

    @Test
    fun register_without_terms_sets_terms_error() = runTest {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateDisplayName("Mario Rossi")
        viewModel.updateEmail("mario@example.com")
        viewModel.updatePassword("Password1")
        viewModel.updateConfirmPassword("Password1")

        viewModel.register()
        advanceUntilIdle()

        assertEquals(
            "Devi accettare Termini e Privacy per continuare",
            viewModel.termsError.value
        )
    }

    @Test
    fun register_with_terms_succeeds_and_stores_consent_timestamp() = runTest {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateDisplayName("Mario Rossi")
        viewModel.updateEmail("mario@example.com")
        viewModel.updatePassword("Password1")
        viewModel.updateConfirmPassword("Password1")
        viewModel.setTermsAccepted(true)

        viewModel.register()
        advanceUntilIdle()

        val state = viewModel.authState.value
        assertTrue(state is AuthState.Success)
        val user = (state as AuthState.Success).user
        assertNotNull(user.termsAcceptedAt)
        assertNotNull(user.privacyAcceptedAt)
    }

    @Test
    fun save_profile_setup_requires_avatar_and_marks_profile_complete() = runTest {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateDisplayName("Mario Rossi")
        viewModel.updateEmail("mario@example.com")
        viewModel.updatePassword("Password1")
        viewModel.updateConfirmPassword("Password1")
        viewModel.setTermsAccepted(true)
        viewModel.register()
        advanceUntilIdle()

        viewModel.updateProfileFirstName("Mario")
        viewModel.updateProfileLastName("Rossi")
        viewModel.updateProfileUsername("mariorossi")
        viewModel.updateProfileCity("Milano")
        viewModel.updateProfileBirthDate("01/01/2000")

        viewModel.saveProfileSetup()
        advanceUntilIdle()
        assertEquals("Seleziona un avatar", viewModel.profileError.value)

        viewModel.updateProfileAvatarUri("content://avatar/mock.png")

        viewModel.saveProfileSetup()
        advanceUntilIdle()
        assertTrue(viewModel.profileSaveCompleted.value)
        assertTrue(viewModel.hasCompletedProfile())
        assertTrue(viewModel.currentUser.value?.hasCompleteProfile() == true)
        assertTrue(viewModel.profileError.value == null)
    }

    @Test
    fun save_profile_setup_requires_minimum_username_length() = runTest {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateDisplayName("Mario Rossi")
        viewModel.updateEmail("mario@example.com")
        viewModel.updatePassword("Password1")
        viewModel.updateConfirmPassword("Password1")
        viewModel.setTermsAccepted(true)
        viewModel.register()
        advanceUntilIdle()

        viewModel.updateProfileFirstName("Mario")
        viewModel.updateProfileLastName("Rossi")
        viewModel.updateProfileUsername("mr")
        viewModel.updateProfileCity("Milano")
        viewModel.updateProfileBirthDate("01/01/2000")
        viewModel.updateProfileAvatarUri("content://avatar/mock.png")

        viewModel.saveProfileSetup()
        advanceUntilIdle()
        assertFalse(viewModel.profileSaveCompleted.value)
        assertEquals("Username minimo 3 caratteri", viewModel.profileError.value)
    }

    @Test
    fun save_profile_setup_without_session_returns_error() = runTest {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateProfileFirstName("Mario")
        viewModel.updateProfileLastName("Rossi")
        viewModel.updateProfileUsername("mariorossi")
        viewModel.updateProfileCity("Milano")
        viewModel.updateProfileBirthDate("01/01/2000")
        viewModel.updateProfileAvatarUri("content://avatar/mock.png")

        viewModel.saveProfileSetup()
        advanceUntilIdle()
        assertFalse(viewModel.profileSaveCompleted.value)
        assertEquals("Sessione utente non disponibile", viewModel.profileError.value)
    }
}
