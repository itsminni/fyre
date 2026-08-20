package minni.fyre.data.appwrite

import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal data class EncryptedCookiePayload(
    val version: Int,
    val iv: String,
    val ciphertext: String
)

internal interface CookieCipher {
    fun encrypt(plaintext: ByteArray): EncryptedCookiePayload
    fun decrypt(payload: EncryptedCookiePayload): ByteArray
}

internal class AesGcmCookieCipher(
    private val secretKeyProvider: () -> SecretKey,
    private val secureRandom: SecureRandom = SecureRandom()
) : CookieCipher {

    override fun encrypt(plaintext: ByteArray): EncryptedCookiePayload {
        val iv = ByteArray(IvSizeBytes).also { bytes -> secureRandom.nextBytes(bytes) }
        val cipher = Cipher.getInstance(Transformation)
        cipher.init(
            Cipher.ENCRYPT_MODE,
            secretKeyProvider(),
            GCMParameterSpec(TagSizeBits, iv)
        )
        cipher.updateAAD(AssociatedData)
        val ciphertext = cipher.doFinal(plaintext)
        return EncryptedCookiePayload(
            version = PayloadVersion,
            iv = Encoder.encodeToString(iv),
            ciphertext = Encoder.encodeToString(ciphertext)
        )
    }

    override fun decrypt(payload: EncryptedCookiePayload): ByteArray {
        require(payload.version == PayloadVersion) { "Unsupported cookie payload version" }
        val iv = Decoder.decode(payload.iv)
        require(iv.size == IvSizeBytes) { "Invalid cookie IV" }
        val ciphertext = Decoder.decode(payload.ciphertext)
        require(ciphertext.size >= TagSizeBits / 8) { "Invalid cookie ciphertext" }

        val cipher = Cipher.getInstance(Transformation)
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKeyProvider(),
            GCMParameterSpec(TagSizeBits, iv)
        )
        cipher.updateAAD(AssociatedData)
        return cipher.doFinal(ciphertext)
    }

    private companion object {
        private const val PayloadVersion = 1
        private const val IvSizeBytes = 12
        private const val TagSizeBits = 128
        private const val Transformation = "AES/GCM/NoPadding"
        private val AssociatedData =
            "fyre.appwrite.cookies.v1".toByteArray(StandardCharsets.UTF_8)
        private val Encoder = Base64.getEncoder().withoutPadding()
        private val Decoder = Base64.getDecoder()
    }
}

internal enum class CookieRestoreSource {
    Encrypted,
    Empty
}

internal fun cookieRestoreSource(encryptedPayload: String?): CookieRestoreSource =
    if (encryptedPayload != null) CookieRestoreSource.Encrypted else CookieRestoreSource.Empty
