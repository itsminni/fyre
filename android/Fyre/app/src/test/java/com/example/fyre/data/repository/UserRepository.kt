package com.example.fyre.data.repository

import android.content.Context
import com.example.fyre.data.model.PasswordUtils
import com.example.fyre.data.model.User
import com.example.fyre.data.model.UserProfile
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class UserRepository(private val context: Context) : AuthRepository {

    private companion object {
        private const val FILE_NAME = "users.json"
    }

    private val gson = Gson()

    private val file: File
        get() = File(context.filesDir, FILE_NAME)

    private fun getUsers(): List<User> {
        if (!file.exists() || file.readText().isBlank()) {
            return emptyList()
        }

        return try {
            val json = file.readText()
            val type = object : TypeToken<List<User>>() {}.type
            gson.fromJson(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    override suspend fun findUserByEmail(email: String): User? = withContext(Dispatchers.IO) {
        getUsers().find { it.email.equals(email, ignoreCase = true) }
    }

    override suspend fun registerUser(
        email: String,
        password: String,
        displayName: String,
        termsAcceptedAt: Long?,
        privacyAcceptedAt: Long?
    ): Result<User> = withContext(Dispatchers.IO) {
        if (findUserByEmail(email) != null) {
            return@withContext Result.failure(Exception("Esiste gia un account con questa email"))
        }

        val newUser = User(
            email = email.lowercase().trim(),
            passwordHash = PasswordUtils.hashPassword(password),
            displayName = displayName.trim(),
            createdAt = System.currentTimeMillis(),
            termsAcceptedAt = termsAcceptedAt,
            privacyAcceptedAt = privacyAcceptedAt
        )

        val users = getUsers().toMutableList()
        users.add(newUser)
        saveUsers(users)

        Result.success(newUser)
    }

    override suspend fun authenticateUser(email: String, password: String): Result<User> = withContext(Dispatchers.IO) {
        val user = findUserByEmail(email)
            ?: return@withContext Result.failure(Exception("Nessun account trovato con questa email"))

        if (PasswordUtils.verifyPassword(password, user.passwordHash)) {
            Result.success(user)
        } else {
            Result.failure(Exception("Password non corretta"))
        }
    }

    override suspend fun updateUserProfile(email: String, profile: UserProfile): Result<User> = withContext(Dispatchers.IO) {
        val normalizedEmail = email.trim().lowercase()
        val users = getUsers().toMutableList()
        val index = users.indexOfFirst { it.email.equals(normalizedEmail, ignoreCase = true) }

        if (index == -1) {
            return@withContext Result.failure(Exception("Utente non trovato"))
        }

        val updatedUser = users[index].copy(profile = profile)
        users[index] = updatedUser
        saveUsers(users)
        Result.success(updatedUser)
    }

    override suspend fun restoreSession(savedEmail: String?): Result<User?> {
        if (savedEmail.isNullOrBlank()) {
            return Result.success(null)
        }
        return Result.success(findUserByEmail(savedEmail))
    }

    override suspend fun logout(): Result<Unit> {
        return Result.success(Unit)
    }

    private fun saveUsers(users: List<User>) {
        val json = gson.toJson(users)
        file.writeText(json)
    }
}