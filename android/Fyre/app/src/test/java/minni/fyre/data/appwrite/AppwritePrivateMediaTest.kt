package minni.fyre.data.appwrite

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppwritePrivateMediaTest {
    @Test
    fun `private media downloader accepts only the configured Appwrite storage origin`() {
        assertEquals(
            "/storage/buckets/chat/files/file-1/view?project=project-1",
            appwriteRelativeBinaryPath(
                source = "https://api.example.test/v1/storage/buckets/chat/files/file-1/view?project=project-1",
                endpoint = "https://api.example.test/v1"
            )
        )
        assertNull(
            appwriteRelativeBinaryPath(
                source = "https://tracker.example.test/file-1",
                endpoint = "https://api.example.test/v1"
            )
        )
        assertNull(
            appwriteRelativeBinaryPath(
                source = "https://api.example.test/v1/account",
                endpoint = "https://api.example.test/v1"
            )
        )
    }

    @Test
    fun `external attachment cache file names cannot escape the cache directory`() {
        assertEquals("report_2026.pdf", safePrivateAttachmentFileName("../../report 2026.pdf"))
        assertEquals("attachment.bin", safePrivateAttachmentFileName("../.."))
    }
}
