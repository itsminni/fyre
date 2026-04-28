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
    fun save_profile_setup_requires_ios_fields_and_marks_profile_complete() = runTest {
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
        viewModel.updateProfileCity("Milano")
        viewModel.updateProfileBirthDate("01/01/2000")

        viewModel.saveProfileSetup()
        advanceUntilIdle()
        assertEquals("Inserisci una bio", viewModel.profileError.value)

        viewModel.updateProfileBio("Ciao, sono Mario")
        viewModel.updateProfileAvatarUri("content://avatar/mock.png")
        viewModel.addProfilePhotoUris(
            listOf(
                "content://gallery/one.png",
                "content://gallery/two.png"
            )
        )
        viewModel.updateProfileIntent("friendship")
        viewModel.updateProfileInterests("musica, cinema")
        viewModel.updateProfileInstagramTag("@mario")
        viewModel.updateProfileSpotifyTag("@mario_music")
        viewModel.updateProfileSmokes(false)
        viewModel.updateProfileDrinks(true)

        viewModel.saveProfileSetup()
        advanceUntilIdle()
        assertTrue(viewModel.profileSaveCompleted.value)
        assertTrue(viewModel.hasCompletedProfile())
        assertTrue(viewModel.currentUser.value?.hasCompleteProfile() == true)
        assertTrue(viewModel.profileError.value == null)
        val profile = viewModel.currentUser.value?.profile
        assertEquals("friendship", profile?.intent)
        assertEquals("mario", profile?.instagramTag)
        assertEquals("mario_music", profile?.spotifyTag)
        assertEquals(2, profile?.profilePhotoUris?.size)
        assertTrue(profile?.drinks == true)
    }

    @Test
    fun save_profile_setup_requires_at_least_one_preferred_gender() = runTest {
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
        viewModel.updateProfileCity("Milano")
        viewModel.updateProfileBirthDate("01/01/2000")
        viewModel.updateProfileBio("Ciao, sono Mario")
        listOf("male", "female", "nonBinary", "other").forEach {
            viewModel.setProfilePreferredGender(it, false)
        }

        viewModel.saveProfileSetup()
        advanceUntilIdle()
        assertFalse(viewModel.profileSaveCompleted.value)
        assertEquals("Seleziona almeno una preferenza di genere", viewModel.profileError.value)
    }

    @Test
    fun save_profile_setup_without_session_returns_error() = runTest {
        val viewModel = AuthViewModel(FakeAuthRepository())

        viewModel.updateProfileFirstName("Mario")
        viewModel.updateProfileLastName("Rossi")
        viewModel.updateProfileCity("Milano")
        viewModel.updateProfileBirthDate("01/01/2000")
        viewModel.updateProfileBio("Ciao, sono Mario")

        viewModel.saveProfileSetup()
        advanceUntilIdle()
        assertFalse(viewModel.profileSaveCompleted.value)
        assertEquals("Sessione utente non disponibile", viewModel.profileError.value)
    }
}
