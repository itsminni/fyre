package minni.fyre.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UserProfileTest {

    @Test
    fun `profile readiness requires an explicit canonical gender preference`() {
        val baseProfile = UserProfile(
            firstName = "Giulia",
            city = "Milano",
            birthDate = "2000-01-01",
            gender = ProfileFieldValues.GenderFemale,
            orientation = ProfileFieldValues.OrientationBisexual,
            bio = "Ciao"
        )

        assertFalse(baseProfile.isComplete())
        assertFalse(baseProfile.copy(preferredGenders = listOf("unsupported")).isComplete())
        assertFalse(
            baseProfile.copy(
                gender = "unsupported",
                preferredGenders = listOf(ProfileFieldValues.GenderFemale)
            ).isComplete()
        )
        assertFalse(
            baseProfile.copy(
                orientation = "unsupported",
                preferredGenders = listOf(ProfileFieldValues.GenderFemale)
            ).isComplete()
        )
        assertTrue(
            baseProfile.copy(
                preferredGenders = listOf(ProfileFieldValues.GenderFemale)
            ).isComplete()
        )
    }

    @Test
    fun `profile readiness does not require coordinates`() {
        val profile = UserProfile(
            firstName = "Giulia",
            city = "Milano",
            birthDate = "2000-01-01",
            gender = ProfileFieldValues.GenderFemale,
            orientation = ProfileFieldValues.OrientationBisexual,
            bio = "Ciao",
            preferredGenders = listOf(ProfileFieldValues.GenderFemale),
            latitude = null,
            longitude = null
        )

        assertTrue(profile.isComplete())
    }

    @Test
    fun `profile preference bounds are canonical`() {
        assertEquals(18 to 19, ProfileFieldValues.preferredAgeRange(1, 1))
        assertEquals(98 to 99, ProfileFieldValues.preferredAgeRange(120, 120))
        assertEquals(5, ProfileFieldValues.maxDistanceKm(1))
        assertEquals(999, ProfileFieldValues.maxDistanceKm(5_000))
        assertNull(ProfileFieldValues.maxDistanceKm(null))
    }

    @Test
    fun `only four canonical intents are accepted`() {
        assertEquals(
            listOf("relationship", "friendship", "casual", "notSure"),
            ProfileFieldValues.SupportedIntents
        )
        assertNull(ProfileFieldValues.canonicalIntentOrNull("business"))
    }
}
