package com.example.fyre.data.appwrite

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

class PersistentCookieJar(
    context: Context,
    private val gson: Gson = Gson()
) : CookieJar {

    private val sharedPreferences = context.getSharedPreferences(
        COOKIE_PREFS,
        Context.MODE_PRIVATE
    )
    private val lock = Any()
    private val memoryCookies = mutableListOf<Cookie>()

    init {
        synchronized(lock) {
            memoryCookies += restoreCookies()
            removeExpiredCookies()
            persistCookies()
        }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return

        synchronized(lock) {
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
            persistCookies()
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        synchronized(lock) {
            removeExpiredCookies()
            return memoryCookies
                .filter { it.matches(url) }
                .toList()
        }
    }

    fun clear() {
        synchronized(lock) {
            memoryCookies.clear()
            sharedPreferences.edit().remove(COOKIES_KEY).apply()
        }
    }

    private fun restoreCookies(): List<Cookie> {
        val raw = sharedPreferences.getString(COOKIES_KEY, null) ?: return emptyList()

        return try {
            val type = object : TypeToken<List<StoredCookie>>() {}.type
            val entries: List<StoredCookie> = gson.fromJson(raw, type) ?: emptyList()
            entries.mapNotNull { it.toCookieOrNull() }
        } catch (_: Throwable) {
            emptyList()
        }
    }

    private fun persistCookies() {
        val serialized = gson.toJson(
            memoryCookies.map { StoredCookie.fromCookie(it) }
        )
        sharedPreferences.edit().putString(COOKIES_KEY, serialized).apply()
    }

    private fun removeExpiredCookies() {
        val now = System.currentTimeMillis()
        memoryCookies.removeAll { it.expiresAt <= now }
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
            if (name.isBlank() || domain.isBlank()) {
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
        private const val COOKIE_PREFS = "appwrite_cookie_store"
        private const val COOKIES_KEY = "cookies"
    }
}