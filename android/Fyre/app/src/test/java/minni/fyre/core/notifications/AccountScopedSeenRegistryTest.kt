package minni.fyre.core.notifications

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountScopedSeenRegistryTest {
    @Test
    fun `the same identifier is deduplicated independently for each account`() {
        val registry = AccountScopedSeenRegistry()

        assertTrue(registry.markSeen("account-a", "match-1"))
        assertFalse(registry.markSeen("account-a", "match-1"))
        assertTrue(registry.markSeen("account-b", "match-1"))
    }

    @Test
    fun `account cleanup does not affect another account`() {
        val registry = AccountScopedSeenRegistry()
        registry.markSeen("account-a", "match-1")
        registry.markSeen("account-b", "match-1")

        registry.clearAccount("account-a")

        assertTrue(registry.markSeen("account-a", "match-1"))
        assertFalse(registry.markSeen("account-b", "match-1"))
    }

    @Test
    fun `old identifiers are bounded in memory`() {
        val registry = AccountScopedSeenRegistry(maxIdentifiersPerAccount = 2)
        registry.markSeen("account-a", "match-1")
        registry.markSeen("account-a", "match-2")
        registry.markSeen("account-a", "match-3")

        assertTrue(registry.markSeen("account-a", "match-1"))
        assertFalse(registry.markSeen("account-a", "match-3"))
    }

    @Test
    fun `blank account or identifier is rejected`() {
        val registry = AccountScopedSeenRegistry()

        assertFalse(registry.markSeen(" ", "match-1"))
        assertFalse(registry.markSeen("account-a", " "))
    }
}
