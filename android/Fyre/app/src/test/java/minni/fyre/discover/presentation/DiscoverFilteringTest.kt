package minni.fyre.discover.presentation

import minni.fyre.discover.model.DiscoveryProfile
import org.junit.Assert.assertEquals
import org.junit.Test

class DiscoverFilteringTest {

    @Test
    fun keeps_backend_profiles_without_applying_local_preference_filters() {
        val matching = profile(id = "match", age = 28, intent = "relationship", verified = true, distanceKm = 12)
        val hidden = profile(id = "hidden", age = 44, intent = "casual", verified = false, distanceKm = 80)

        val result = discoverProfilesForDisplay(
            profiles = listOf(matching, hidden)
        )

        assertEquals(listOf(matching, hidden), result)
    }

    @Test
    fun hides_only_current_optimistic_dismissals() {
        val visible = profile(id = "visible")
        val dismissed = profile(id = "dismissed")

        val result = discoverProfilesForDisplay(
            profiles = listOf(visible, dismissed),
            dismissedProfileIds = setOf("dismissed")
        )

        assertEquals(listOf(visible), result)
    }

    private fun profile(
        id: String,
        age: Int = 28,
        intent: String = "relationship",
        verified: Boolean = true,
        distanceKm: Int = 12
    ): DiscoveryProfile {
        return DiscoveryProfile(
            id = id,
            name = id,
            age = age,
            isVerified = verified,
            city = "Milano",
            distanceKm = distanceKm,
            bio = "Bio",
            intent = intent,
            interests = emptyList()
        )
    }
}
