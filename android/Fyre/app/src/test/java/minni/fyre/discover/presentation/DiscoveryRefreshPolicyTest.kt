package minni.fyre.discover.presentation

import org.junit.Assert.assertTrue
import org.junit.Test

class DiscoveryRefreshPolicyTest {
    @Test
    fun `discovery refreshes token urls before the supported four minute age`() {
        assertTrue(
            DiscoveryRefreshPolicy.TokenRefreshIntervalMillis <
                DiscoveryRefreshPolicy.MaximumSupportedTokenAgeMillis
        )
    }
}
