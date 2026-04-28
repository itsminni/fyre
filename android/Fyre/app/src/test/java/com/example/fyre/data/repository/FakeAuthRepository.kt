package com.example.fyre.data.repository

import com.example.fyre.data.model.PasswordUtils
import com.example.fyre.data.model.User
import com.example.fyre.data.model.UserProfile

/**
 * Implementazione fake in-memory utile per preview, test rapidi o prototipi UI.
 */
class FakeAuthRepository : AuthRepository {
    private val users = mutableListOf<User>()

    override suspend fun findUserByEmail(email: String): User? {
        return users.find { it.email.equals(email, ignoreCase = true) }
    }

    override suspend fun registerUser(
        email: String,
        password: String,
        displayName: String,
        termsAcceptedAt: Long?,
        privacyAcceptedAt: Long?
    ): Result<User> {
        if (findUserByEmail(email) != null) {
            return Result.failure(IllegalStateException("Esiste gia un account con questa email"))
        }

        val user = User(
            email = email.trim().lowercase(),
            passwordHash = PasswordUtils.hashPassword(password),
            displayName = displayName.trim(),
            termsAcceptedAt = termsAcceptedAt,
            privacyAcceptedAt = privacyAcceptedAt
        )
        users += user
        return Result.success(user)
    }

    override suspend fun authenticateUser(email: String, password: String): Result<User> {
        val user = findUserByEmail(email)
            ?: return Result.failure(IllegalStateException("Nessun account trovato con questa email"))

        return if (PasswordUtils.verifyPassword(password, user.passwordHash)) {
            Result.success(user)
        } else {
            Result.failure(IllegalStateException("Password non corretta"))
        }
    }

    override suspend fun updateUserProfile(email: String, profile: UserProfile): Result<User> {
        val index = users.indexOfFirst { it.email.equals(email.trim(), ignoreCase = true) }
        if (index == -1) {
            return Result.failure(IllegalStateException("Utente non trovato"))
        }

        val updated = users[index].copy(profile = profile)
        users[index] = updated
        return Result.success(updated)
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
}

