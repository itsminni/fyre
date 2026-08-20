package minni.fyre.data.local

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AccountScopedMemoryStoreTest {
    @Test
    fun `values are isolated and cleared per account`() {
        val store = AccountScopedMemoryStore<String>()
        store.put("account-a", "thread", "secret-a")
        store.put("account-b", "thread", "secret-b")

        store.clearAccount("account-a")

        assertNull(store.get("account-a", "thread"))
        assertEquals("secret-b", store.get("account-b", "thread"))
    }

    @Test
    fun `blank account cannot create or clear another account entry`() {
        val store = AccountScopedMemoryStore<String>()
        store.put("account-a", "thread", "secret-a")

        store.put(" ", "thread", "must-not-be-stored")
        store.clearAccount(" ")

        assertNull(store.get(" ", "thread"))
        assertEquals("secret-a", store.get("account-a", "thread"))
    }

    @Test
    fun `clear all removes every account`() {
        val store = AccountScopedMemoryStore<String>()
        store.put("account-a", "thread", "secret-a")
        store.put("account-b", "thread", "secret-b")

        store.clearAll()

        assertNull(store.get("account-a", "thread"))
        assertNull(store.get("account-b", "thread"))
    }
}
