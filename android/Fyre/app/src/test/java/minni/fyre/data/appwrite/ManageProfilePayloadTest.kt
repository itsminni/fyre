package minni.fyre.data.appwrite

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class ManageProfilePayloadTest {
    @Test
    fun `upsert payload keeps identity server managed`() {
        val payload = ManageProfilePayload.upsert(
            linkedMapOf(
                "firstName" to "Ada",
                "photoFileIds" to listOf("photo-1")
            )
        )

        assertEquals("Ada", payload["firstName"])
        assertFalse(payload.containsKey("userId"))
        assertFalse(payload.containsKey("email"))
    }

    @Test
    fun `upsert payload rejects client supplied identity`() {
        assertThrows(IllegalArgumentException::class.java) {
            ManageProfilePayload.upsert(mapOf("userId" to "another-user"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            ManageProfilePayload.upsert(mapOf("email" to "other@example.test"))
        }
    }

    @Test
    fun `presence payload matches manage profile contract`() {
        assertEquals(
            linkedMapOf<String, Any?>(
                "action" to "presence",
                "online" to false
            ),
            ManageProfilePayload.presence(isOnline = false)
        )
    }
}
