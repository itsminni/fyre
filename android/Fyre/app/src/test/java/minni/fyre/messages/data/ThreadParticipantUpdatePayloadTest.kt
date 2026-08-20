package minni.fyre.messages.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class ThreadParticipantUpdatePayloadTest {
    @Test
    fun `mark read payload contains only the function contract fields`() {
        val payload = threadParticipantUpdatePayload(
            threadId = "thread-1",
            markRead = true
        )

        assertEquals(
            linkedMapOf<String, Any?>(
                "action" to "updateParticipant",
                "threadId" to "thread-1",
                "markRead" to true
            ),
            payload
        )
        assertForbiddenFieldsAreAbsent(payload)
    }

    @Test
    fun `notification and pin payload exposes only mutable preferences`() {
        val payload = threadParticipantUpdatePayload(
            threadId = "thread-2",
            notificationsEnabled = false,
            pinned = true
        )

        assertEquals(false, payload["notificationsEnabled"])
        assertEquals(true, payload["pinned"])
        assertForbiddenFieldsAreAbsent(payload)
    }

    @Test
    fun `participant update requires at least one field`() {
        assertThrows(IllegalArgumentException::class.java) {
            threadParticipantUpdatePayload(threadId = "thread-3")
        }
    }

    private fun assertForbiddenFieldsAreAbsent(payload: Map<String, Any?>) {
        listOf("currentUserId", "userId", "role", "lastReadAt", "muted").forEach { field ->
            assertFalse(payload.containsKey(field))
        }
    }
}
