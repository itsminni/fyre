package minni.fyre.data.appwrite

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AppwriteConfigurationTest {
    @Test
    fun `invalid backend configuration becomes unavailable without crashing startup`() {
        assertNull(AppwriteConfiguration.loadOrNull {
            throw AppwriteConfigurationException("Incomplete configuration")
        })
        assertNull(AppwriteConfiguration.loadOrNull { null })
    }

    @Test
    fun `unexpected initialization errors are not hidden`() {
        assertThrows(IllegalStateException::class.java) {
            AppwriteConfiguration.loadOrNull { error("Unexpected failure") }
        }
    }

    @Test
    fun `remote endpoints require HTTPS`() {
        assertTrue(AppwriteConfiguration.isSecureEndpoint("https://example.test/v1"))
        assertFalse(AppwriteConfiguration.isSecureEndpoint("http://example.test/v1"))
        assertFalse(AppwriteConfiguration.isSecureEndpoint("ftp://example.test/v1"))
    }

    @Test
    fun `HTTP is allowed only for loopback development`() {
        assertTrue(AppwriteConfiguration.isSecureEndpoint("http://localhost/v1"))
        assertTrue(AppwriteConfiguration.isSecureEndpoint("http://127.0.0.42:8080/v1"))
        assertTrue(AppwriteConfiguration.isSecureEndpoint("http://[::1]/v1"))
        assertFalse(AppwriteConfiguration.isSecureEndpoint("http://192.168.1.10/v1"))
    }

    @Test
    fun `embedded credentials are rejected`() {
        assertFalse(AppwriteConfiguration.isSecureEndpoint("https://user:secret@example.test/v1"))
    }

    @Test
    fun `queries and fragments are rejected`() {
        assertFalse(AppwriteConfiguration.isSecureEndpoint("https://example.test/v1?project=attacker"))
        assertFalse(AppwriteConfiguration.isSecureEndpoint("https://example.test/v1#unexpected"))
    }
}
