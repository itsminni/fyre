package minni.fyre.data.appwrite

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.nio.charset.StandardCharsets
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

class PersistentCookieJar(
    context: Context,
    private val gson: Gson = Gson()
) : CookieJar {

    private val appContext = context.applicationContext
    private val sharedPreferences = appContext.getSharedPreferences(
        CookiePreferences,
        Context.MODE_PRIVATE
    )
    private val cipher: CookieCipher = AndroidKeystoreCookieCipher()
    private val memoryCookies = mutableListOf<Cookie>()
    private var lastEncryptedPayload: String? = null

    init {
        synchronized(GlobalLock) {
            memoryCookies += restoreCookiesFailClosed()
            removeExpiredCookies()
            persistCookiesFailClosed()
        }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return

        synchronized(GlobalLock) {
            refreshFromDiskIfChanged()
            for (incomingCookie in cookies) {
                memoryCookies.removeAll {
                    it.name == incomingCookie.name &&
                        it.domain == incomingCookie.domain &&
                        it.path == incomingCookie.path
                }

                if (incomingCookie.expiresAt > System.currentTimeMillis()) {
                    memoryCookies += incomingCookie
                }
            }

            removeExpiredCookies()
            persistCookiesFailClosed()
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        synchronized(GlobalLock) {
            refreshFromDiskIfChanged()
            if (removeExpiredCookies()) {
                persistCookiesFailClosed()
            }
            return memoryCookies
                .filter { it.matches(url) }
                .toList()
        }
    }

    fun clear() {
        synchronized(GlobalLock) {
            memoryCookies.clear()
            clearPersistentState()
        }
    }

    private fun refreshFromDiskIfChanged() {
        val encryptedPayload = try {
            sharedPreferences.getString(EncryptedCookiesKey, null)
        } catch (_: Throwable) {
            memoryCookies.clear()
            clearPersistentState()
            return
        }
        if (encryptedPayload == lastEncryptedPayload) {
            return
        }

        memoryCookies.clear()
        memoryCookies += restoreCookiesFailClosed()
        if (removeExpiredCookies()) {
            persistCookiesFailClosed()
        }
    }

    private fun restoreCookiesFailClosed(): List<Cookie> {
        return try {
            val encryptedPayload = sharedPreferences.getString(EncryptedCookiesKey, null)
            when (cookieRestoreSource(encryptedPayload)) {
                CookieRestoreSource.Encrypted -> {
                    val payload = gson.fromJson(
                        checkNotNull(encryptedPayload),
                        EncryptedCookiePayload::class.java
                    ) ?: error("Missing encrypted cookie payload")
                    val plaintext = cipher.decrypt(payload)
                    lastEncryptedPayload = encryptedPayload
                    decodeCookieList(String(plaintext, StandardCharsets.UTF_8))
                }

                CookieRestoreSource.Empty -> {
                    lastEncryptedPayload = null
                    emptyList()
                }
            }
        } catch (_: Throwable) {
            clearPersistentState()
            emptyList()
        }
    }

    private fun decodeCookieList(raw: String): List<Cookie> {
        val type = object : TypeToken<List<StoredCookie>>() {}.type
        val entries: List<StoredCookie> = gson.fromJson(raw, type)
            ?: error("Missing stored cookies")
        return entries.map { entry ->
            entry.toCookieOrNull() ?: error("Invalid stored cookie")
        }
    }

    private fun persistCookiesFailClosed() {
        try {
            check(writeEncryptedCookies(memoryCookies)) {
                "Unable to persist encrypted cookies"
            }
        } catch (_: Throwable) {
            memoryCookies.clear()
            clearPersistentState()
        }
    }

    private fun writeEncryptedCookies(cookies: List<Cookie>): Boolean {
        if (cookies.isEmpty()) {
            val committed = sharedPreferences.edit()
                .remove(EncryptedCookiesKey)
                .commit()
            if (committed) {
                lastEncryptedPayload = null
            }
            return committed
        }

        val serialized = gson.toJson(cookies.map(StoredCookie::fromCookie))
        val encrypted = cipher.encrypt(serialized.toByteArray(StandardCharsets.UTF_8))
        val encodedPayload = gson.toJson(encrypted)
        val committed = sharedPreferences.edit()
            .putString(EncryptedCookiesKey, encodedPayload)
            .commit()
        if (committed) {
            lastEncryptedPayload = encodedPayload
        }
        return committed
    }

    private fun clearPersistentState() {
        lastEncryptedPayload = null
        val committed = sharedPreferences.edit()
            .clear()
            .commit()
        if (!committed) {
            val deleted = appContext.deleteSharedPreferences(CookiePreferences)
            if (!deleted) {
                sharedPreferences.edit().clear().apply()
            }
        }
    }

    private fun removeExpiredCookies(): Boolean {
        val now = System.currentTimeMillis()
        return memoryCookies.removeAll { it.expiresAt <= now }
    }

    private data class StoredCookie(
        val name: String,
        val value: String,
        val expiresAt: Long,
        val domain: String,
        val path: String,
        val secure: Boolean,
        val httpOnly: Boolean,
        val persistent: Boolean,
        val hostOnly: Boolean
    ) {
        fun toCookieOrNull(): Cookie? {
            if (name.isBlank() || domain.isBlank() || path.isBlank()) {
                return null
            }

            return try {
                val builder = Cookie.Builder()
                    .name(name)
                    .value(value)
                    .path(path)

                if (hostOnly) {
                    builder.hostOnlyDomain(domain)
                } else {
                    builder.domain(domain)
                }

                if (secure) {
                    builder.secure()
                }

                if (httpOnly) {
                    builder.httpOnly()
                }

                if (persistent) {
                    builder.expiresAt(expiresAt)
                }

                builder.build()
            } catch (_: Throwable) {
                null
            }
        }

        companion object {
            fun fromCookie(cookie: Cookie): StoredCookie {
                return StoredCookie(
                    name = cookie.name,
                    value = cookie.value,
                    expiresAt = cookie.expiresAt,
                    domain = cookie.domain,
                    path = cookie.path,
                    secure = cookie.secure,
                    httpOnly = cookie.httpOnly,
                    persistent = cookie.persistent,
                    hostOnly = cookie.hostOnly
                )
            }
        }
    }

    private companion object {
        private val GlobalLock = Any()
        private const val CookiePreferences = "appwrite_cookie_store"
        private const val EncryptedCookiesKey = "cookies_encrypted_v1"
    }
}
