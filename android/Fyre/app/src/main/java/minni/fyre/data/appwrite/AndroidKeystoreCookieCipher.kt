package minni.fyre.data.appwrite

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

internal class AndroidKeystoreCookieCipher(
    private val keyAlias: String = DefaultKeyAlias
) : CookieCipher {
    private val keyLock = Any()
    private val delegate = AesGcmCookieCipher(::loadOrCreateKey)

    override fun encrypt(plaintext: ByteArray): EncryptedCookiePayload =
        delegate.encrypt(plaintext)

    override fun decrypt(payload: EncryptedCookiePayload): ByteArray =
        delegate.decrypt(payload)

    private fun loadOrCreateKey(): SecretKey = synchronized(keyLock) {
        val keyStore = KeyStore.getInstance(AndroidKeyStore).apply { load(null) }
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return@synchronized it }

        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            AndroidKeyStore
        )
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build()
        )
        generator.generateKey()
    }

    private companion object {
        private const val AndroidKeyStore = "AndroidKeyStore"
        private const val DefaultKeyAlias = "fyre_appwrite_cookie_aes_gcm_v1"
    }
}
