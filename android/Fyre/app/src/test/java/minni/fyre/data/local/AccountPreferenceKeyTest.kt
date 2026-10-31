package minni.fyre.data.local

import org.junit.Assert.*
import org.junit.Test

class AccountPreferenceKeyTest {
    @Test fun `personal preferences do not leak between accounts or into signed out state`() {
        assertNotEquals(accountPreferenceKey("alice", "notifications"), accountPreferenceKey("bob", "notifications"))
        assertNotEquals(accountPreferenceKey("alice", "notifications"), accountPreferenceKey(null, "notifications"))
        assertEquals(accountPreferenceKey("alice", "notifications"), accountPreferenceKey("alice", "notifications"))
        assertFalse(accountPreferenceKey("alice@example.test", "notifications").contains("alice"))
    }
}
