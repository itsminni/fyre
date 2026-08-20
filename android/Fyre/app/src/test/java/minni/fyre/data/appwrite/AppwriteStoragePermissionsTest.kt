package minni.fyre.data.appwrite

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AppwriteStoragePermissionsTest {
    @Test
    fun `profile photos are accessible only by owner`() {
        val permissions = profilePhotoPermissions("owner-1")

        assertEquals(
            listOf(
                "read(\"user:owner-1\")",
                "update(\"user:owner-1\")",
                "delete(\"user:owner-1\")"
            ),
            permissions
        )
        assertFalse(permissions.contains("read(\"users\")"))
    }

    @Test
    fun `chat attachments remain owner only before server validation`() {
        val permissions = ownerOnlyFilePermissions("owner-1")

        assertEquals("read(\"user:owner-1\")", permissions.first())
        assertFalse(permissions.contains("read(\"users\")"))
    }
}
