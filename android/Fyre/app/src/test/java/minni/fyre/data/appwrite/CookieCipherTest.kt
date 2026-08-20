package minni.fyre.data.appwrite

import java.util.Base64
import javax.crypto.AEADBadTagException
import javax.crypto.KeyGenerator
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class CookieCipherTest {
    private val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    @Test
    fun `AES GCM round trip does not persist the session token as plaintext`() {
        val plaintext = "a_session_appwrite=super-secret-token".toByteArray()
        val cipher = AesGcmCookieCipher(secretKeyProvider = { key })

        val first = cipher.encrypt(plaintext)
        val second = cipher.encrypt(plaintext)
        val persistedCiphertext = Base64.getDecoder().decode(first.ciphertext)

        assertArrayEquals(plaintext, cipher.decrypt(first))
        assertFalse(first.ciphertext.contains("super-secret-token"))
        assertFalse(persistedCiphertext.contentEquals(plaintext))
        assertNotEquals(first.iv, second.iv)
        assertNotEquals(first.ciphertext, second.ciphertext)
    }

    @Test
    fun `tampered ciphertext is rejected`() {
        val cipher = AesGcmCookieCipher(secretKeyProvider = { key })
        val encrypted = cipher.encrypt("session-cookie".toByteArray())
        val tamperedBytes = Base64.getDecoder().decode(encrypted.ciphertext).also { bytes ->
            bytes[bytes.lastIndex] = (bytes.last().toInt() xor 1).toByte()
        }
        val tampered = encrypted.copy(
            ciphertext = Base64.getEncoder().withoutPadding().encodeToString(tamperedBytes)
        )

        assertThrows(AEADBadTagException::class.java) {
            cipher.decrypt(tampered)
        }
    }

    @Test
    fun `only an encrypted payload is eligible for restore`() {
        assertEquals(
            CookieRestoreSource.Encrypted,
            cookieRestoreSource(encryptedPayload = "encrypted-payload")
        )
        assertEquals(
            CookieRestoreSource.Empty,
            cookieRestoreSource(encryptedPayload = null)
        )
    }
}
