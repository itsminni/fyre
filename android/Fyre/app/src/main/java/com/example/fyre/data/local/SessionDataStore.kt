package com.example.fyre.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "session_preferences"
)

/**
 * Storage locale per dati di sessione basato su DataStore.
 */
class SessionDataStore(private val context: Context) {

    private companion object {
        val CURRENT_USER_EMAIL = stringPreferencesKey("current_user_email")
    }

    val currentUserEmail: Flow<String?> = context.sessionDataStore.data
        .catch { exception ->
            if (exception is IOException) emit(emptyPreferences()) else throw exception
        }
        .map { preferences -> preferences[CURRENT_USER_EMAIL] }

    suspend fun setCurrentUserEmail(email: String?) {
        context.sessionDataStore.edit { preferences ->
            if (email.isNullOrBlank()) {
                preferences.remove(CURRENT_USER_EMAIL)
            } else {
                preferences[CURRENT_USER_EMAIL] = email
            }
        }
    }

    suspend fun clear() {
        context.sessionDataStore.edit { preferences ->
            preferences.clear()
        }
    }
}


