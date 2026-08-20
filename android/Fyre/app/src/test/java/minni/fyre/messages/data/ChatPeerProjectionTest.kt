package minni.fyre.messages.data

import com.google.gson.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ChatPeerProjectionTest {
    @Test
    fun `peer projection consumes only server avatarUrl`() {
        val response = JsonObject().apply {
            addProperty("threadId", "thread-1")
            add("peer", JsonObject().apply {
                addProperty("userId", "user-b")
                addProperty("displayName", "Bea Rossi")
                addProperty(
                    "avatarUrl",
                    "https://appwrite.example.test/avatar/view?token=short-lived"
                )
                addProperty("avatarFileId", "raw-avatar-id")
                addProperty("photoFileIds", "raw-photo-id")
                addProperty("presenceUpdatedAt", "2030-01-02T03:04:05Z")
                addProperty("lastSeenAt", "2030-01-02T03:00:00Z")
            })
        }

        val projection = chatPeerProjectionFromResponse(response, "thread-1", "user-b")

        assertEquals("Bea Rossi", projection?.displayName)
        assertEquals(
            "https://appwrite.example.test/avatar/view?token=short-lived",
            projection?.avatarUrl
        )
    }

    @Test
    fun `raw avatar ids are never accepted as peer URLs`() {
        val response = JsonObject().apply {
            addProperty("threadId", "thread-1")
            add("peer", JsonObject().apply {
                addProperty("userId", "user-b")
                addProperty("displayName", "Bea")
                addProperty("avatarFileId", "raw-avatar-id")
            })
        }

        assertNull(
            chatPeerProjectionFromResponse(response, "thread-1", "user-b")?.avatarUrl
        )
    }

    @Test
    fun `untokenized peer URL is discarded`() {
        val response = JsonObject().apply {
            addProperty("threadId", "thread-1")
            add("peer", JsonObject().apply {
                addProperty("userId", "user-b")
                addProperty("displayName", "Bea")
                addProperty("avatarUrl", "https://appwrite.example.test/avatar/view")
            })
        }

        assertNull(chatPeerProjectionFromResponse(response, "thread-1", "user-b")?.avatarUrl)
    }

    @Test
    fun `mismatched thread or peer identity fails closed`() {
        val response = JsonObject().apply {
            addProperty("threadId", "thread-2")
            add("peer", JsonObject().apply {
                addProperty("userId", "attacker")
                addProperty("displayName", "Attacker")
                addProperty("avatarUrl", "https://example.test/avatar")
            })
        }

        assertNull(chatPeerProjectionFromResponse(response, "thread-1", "user-b"))
    }
}
