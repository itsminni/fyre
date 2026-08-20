package minni.fyre.messages.presentation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatAttachmentPolicyTest {
    @Test
    fun `attachment names follow the Appwrite bucket allowlist`() {
        listOf(
            "photo.jpg",
            "photo.JPEG",
            "image.png",
            "image.webp",
            "image.heic",
            "document.pdf",
            "voice.m4a",
            "audio.mp3",
            "audio.wav",
            "video.mp4",
            "video.mov"
        ).forEach { fileName ->
            assertTrue(fileName, isAllowedChatAttachmentFileName(fileName))
        }

        listOf(
            "image.gif",
            "image.heif",
            "audio.aac",
            "archive.zip",
            "video.hevc",
            "missing-extension"
        ).forEach { fileName ->
            assertFalse(fileName, isAllowedChatAttachmentFileName(fileName))
        }
    }
}
