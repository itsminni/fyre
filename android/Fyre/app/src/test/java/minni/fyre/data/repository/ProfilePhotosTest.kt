package minni.fyre.data.repository

import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class ProfilePhotosTest {
    @Test fun `clearing the gallery does not restore existing photos or upload files`() = runTest {
        val ids = resolveProfilePhotos(emptyList(), { error("Must not resolve a removed photo") }, { error("Must not upload") })
        assertTrue(ids.isEmpty())
    }

    @Test fun `saving the gallery preserves order across remote and new photos`() = runTest {
        val ids = resolveProfilePhotos(listOf("https://backend/files/old", "content://new"), { "old" }, { "new" })
        assertEquals(listOf("old", "new"), ids)
    }
}
