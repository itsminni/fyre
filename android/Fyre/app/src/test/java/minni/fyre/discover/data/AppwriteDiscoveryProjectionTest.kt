package minni.fyre.discover.data

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import kotlinx.coroutines.test.runTest
import minni.fyre.data.model.ProfileFieldValues
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AppwriteDiscoveryProjectionTest {
    @Test
    fun `discovery follows empty windows and returns only first populated page`() = runTest {
        val requestedCursors = mutableListOf<String?>()

        val profiles = firstNonEmptyDiscoveryWindow<String> { cursor ->
            requestedCursors += cursor
            when (cursor) {
                null -> DiscoveryFunctionPage(emptyList(), "profile-100")
                "profile-100" -> DiscoveryFunctionPage(listOf("profile-101"), "profile-200")
                else -> error("Unexpected discovery cursor: $cursor")
            }
        }

        assertEquals(listOf("profile-101"), profiles)
        assertEquals(listOf(null, "profile-100"), requestedCursors)
    }

    @Test
    fun `discovery stops when an empty page repeats its cursor`() = runTest {
        var requestCount = 0

        val profiles = firstNonEmptyDiscoveryWindow<String> {
            requestCount += 1
            DiscoveryFunctionPage(emptyList(), "profile-100")
        }

        assertEquals(emptyList<String>(), profiles)
        assertEquals(2, requestCount)
    }

    @Test
    fun `discovery scans at most four empty windows`() = runTest {
        var requestCount = 0

        val profiles = firstNonEmptyDiscoveryWindow<String> {
            requestCount += 1
            DiscoveryFunctionPage(emptyList(), "profile-$requestCount")
        }

        assertEquals(emptyList<String>(), profiles)
        assertEquals(4, requestCount)
    }

    @Test
    fun `discovery images use only tokenized projection fields`() {
        val row = JsonObject().apply {
            add("photos", JsonArray().apply {
                add("https://appwrite.example.test/avatar/view?token=short-lived")
            })
            addProperty("imageUrl", "https://cdn.example.test/fallback.jpg")
            addProperty("avatarFileId", "raw-avatar-id")
            add("photoFileIds", JsonArray().apply { add("raw-photo-id") })
        }

        val urls = tokenizedDiscoveryPhotoUrls(row)

        assertEquals(
            listOf("https://appwrite.example.test/avatar/view?token=short-lived"),
            urls
        )
        assertFalse(urls.any { it.contains("raw-") })
    }

    @Test
    fun `imageUrl is used only when photos are absent`() {
        val row = JsonObject().apply {
            addProperty("imageUrl", "https://appwrite.example.test/avatar/view?token=short-lived")
            addProperty("avatarFileId", "raw-avatar-id")
        }

        assertEquals(
            listOf("https://appwrite.example.test/avatar/view?token=short-lived"),
            tokenizedDiscoveryPhotoUrls(row)
        )
    }

    @Test
    fun `raw file ids never become discovery URLs`() {
        val row = JsonObject().apply {
            addProperty("avatarFileId", "raw-avatar-id")
            add("photoFileIds", JsonArray().apply { add("raw-photo-id") })
        }

        assertEquals(emptyList<String>(), tokenizedDiscoveryPhotoUrls(row))
    }

    @Test
    fun `untokenized and insecure remote URLs fail closed`() {
        val row = JsonObject().apply {
            add("photos", JsonArray().apply {
                add("https://appwrite.example.test/avatar/view")
                add("http://remote.example.test/avatar/view?token=secret")
            })
        }

        assertEquals(emptyList<String>(), tokenizedDiscoveryPhotoUrls(row))
    }

    @Test
    fun `discovery projects distinct optional social fields`() {
        val row = JsonObject().apply {
            addProperty("id", "profile-1")
            addProperty("name", "Giulia")
            addProperty("age", 27)
            addProperty("intent", "friendship")
            addProperty("instagramTag", "  giulia.photo  ")
            addProperty("spotifyTag", "  giulia.music  ")
        }

        val profile = projectDiscoveryProfile(row)

        assertEquals("giulia.photo", profile?.instagramTag)
        assertEquals("giulia.music", profile?.spotifyTag)
        assertEquals(ProfileFieldValues.IntentFriendship, profile?.intent)
    }

    @Test
    fun `unsupported discovery intent becomes not sure`() {
        val row = JsonObject().apply {
            addProperty("id", "profile-1")
            addProperty("name", "Giulia")
            addProperty("intent", "business")
        }

        assertEquals(
            ProfileFieldValues.IntentNotSure,
            projectDiscoveryProfile(row)?.intent
        )
    }
}
