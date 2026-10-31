package minni.fyre.discover.presentation
import kotlinx.coroutines.test.runTest
import minni.fyre.discover.data.*
import minni.fyre.discover.model.DiscoveryProfile
import org.junit.Assert.*
import org.junit.Test
class DiscoveryFeedTest {
    @Test fun `failed refresh preserves loaded cards and paging deduplicates profiles`() = runTest {
        var fails = false
        val profile = DiscoveryProfile("p1", "Alex", 25, false, "Rome", 3, "Bio", "Friendship", emptyList())
        val repo = object : DiscoveryRepository {
            override suspend fun loadProfiles() = Result.success(listOf(profile))
            override suspend fun submitDecision(profile: DiscoveryProfile, liked: Boolean) = Result.success(SwipeOutcome(false, null))
            override suspend fun loadPage(cursor: String?): Result<DiscoveryPage> =
                if (fails) Result.failure(java.io.IOException())
                else Result.success(DiscoveryPage(listOf(profile), "next"))
        }
        val feed = DiscoveryFeed(repo)
        feed.refresh(); fails = true; feed.refresh()
        assertEquals(listOf(profile), feed.state.value.profiles)
        assertNotNull(feed.state.value.error)
        fails = false; feed.loadMore(); feed.loadMore()
        assertEquals(1, feed.state.value.profiles.size)
        assertNull(feed.state.value.nextCursor)
    }
}
