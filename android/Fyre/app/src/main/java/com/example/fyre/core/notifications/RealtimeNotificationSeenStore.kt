package com.example.fyre.core.notifications

import android.content.Context

class RealtimeNotificationSeenStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE
    )

    fun markMatchSeen(identifier: String): Boolean {
        val normalized = identifier.trim()
        if (normalized.isBlank()) return false

        val identifiers = preferences.getString(SEEN_MATCHES_KEY, "")
            .orEmpty()
            .lineSequence()
            .filter { it.isNotBlank() }
            .toMutableList()

        if (normalized in identifiers) {
            return false
        }

        identifiers += normalized
        val limited = identifiers.takeLast(MAX_STORED_IDENTIFIERS)
        preferences.edit()
            .putString(SEEN_MATCHES_KEY, limited.joinToString(separator = "\n"))
            .apply()
        return true
    }

    private companion object {
        private const val PREFS_NAME = "fyre_realtime_notifications"
        private const val SEEN_MATCHES_KEY = "seen_match_identifiers"
        private const val MAX_STORED_IDENTIFIERS = 80
    }
}
