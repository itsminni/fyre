package minni.fyre.data.local

import org.junit.Assert.assertEquals
import org.junit.Test

class LocalRecentChatMergePolicyTest {
    @Test
    fun `authoritative fetch drops revoked cached threads`() {
        val retained = cachedThreadIdsAllowedAfterAuthoritativeFetch(
            cachedThreadIds = setOf("visible", "revoked"),
            fetchedThreadIds = setOf("visible"),
            optimisticPendingThreadIds = emptySet()
        )

        assertEquals(emptySet<String>(), retained)
    }

    @Test
    fun `only an explicit optimistic pending thread survives a missing row`() {
        val retained = cachedThreadIdsAllowedAfterAuthoritativeFetch(
            cachedThreadIds = setOf("visible", "pending", "revoked"),
            fetchedThreadIds = setOf("visible"),
            optimisticPendingThreadIds = setOf("pending")
        )

        assertEquals(setOf("pending"), retained)
    }

    @Test
    fun `authoritative message fetch drops absent server messages`() {
        val retained = cachedMessageIdsAllowedAfterAuthoritativeFetch(
            cachedMessageIds = setOf("visible", "revoked"),
            fetchedMessageIds = setOf("visible"),
            optimisticPendingMessageIds = emptySet()
        )

        assertEquals(setOf("visible"), retained)
    }

    @Test
    fun `empty authoritative message fetch retains only explicit optimistic sends`() {
        val retained = cachedMessageIdsAllowedAfterAuthoritativeFetch(
            cachedMessageIds = setOf("local-pending", "old-server-message"),
            fetchedMessageIds = emptySet(),
            optimisticPendingMessageIds = setOf("local-pending")
        )

        assertEquals(setOf("local-pending"), retained)
    }
}
