package com.example.fyre.data.repository

import com.example.fyre.data.model.PasswordUtils
import com.example.fyre.data.model.User

/**
 * Implementazione fake in-memory utile per preview, test rapidi o prototipi UI.
 */
class FakeAuthRepository : AuthRepository {
    private val users = mutableListOf<User>()

    override fun findUserByEmail(email: String): User? {
        return users.find { it.email.equals(email, ignoreCase = true) }
    }

    override fun registerUser(
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

    override fun authenticateUser(email: String, password: String): Result<User> {
        val user = findUserByEmail(email)
            ?: return Result.failure(IllegalStateException("Nessun account trovato con questa email"))

        return if (PasswordUtils.verifyPassword(password, user.passwordHash)) {
            Result.success(user)
        } else {
            Result.failure(IllegalStateException("Password non corretta"))
        }
    }
}

