package minni.fyre.discover.data

import minni.fyre.discover.model.DiscoveryProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class MockMatchEngineTest {

    private val profileMatch = DiscoveryProfile(
        id = "p2",
        name = "Lorenzo",
        age = 30,
        isVerified = true,
        city = "Bologna",
        distanceKm = 8,
        bio = "Bio",
        intent = "relationship",
        interests = listOf("Tech"),
        instagramTag = "tag"
    )

    private val profileNoMatch = DiscoveryProfile(
        id = "p1",
        name = "Giulia",
        age = 27,
        isVerified = true,
        city = "Milano",
        distanceKm = 3,
        bio = "Bio",
        intent = "casual",
        interests = listOf("Design"),
        instagramTag = "tag"
    )

    @Test
    fun evaluate_like_returns_match_payload_for_matching_profile() {
        val result = MockMatchEngine.evaluateLike(profileMatch)

        assertNotNull(result)
        assertEquals("thread_p2", result?.threadId)
    }

    @Test
    fun evaluate_like_returns_null_for_non_matching_profile() {
        val result = MockMatchEngine.evaluateLike(profileNoMatch)

        assertNull(result)
    }
}
