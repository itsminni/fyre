package com.example.fyre.data.repository

import com.example.fyre.data.model.User
import com.example.fyre.data.model.UserProfile

interface AuthRepository {
    suspend fun findUserByEmail(email: String): User?

    suspend fun registerUser(
        email: String,
        password: String,
        displayName: String,
        termsAcceptedAt: Long? = null,
        privacyAcceptedAt: Long? = null
    ): Result<User>

    suspend fun authenticateUser(email: String, password: String): Result<User>

    suspend fun updateUserProfile(email: String, profile: UserProfile): Result<User>

    suspend fun restoreSession(savedEmail: String?): Result<User?>

    suspend fun logout(): Result<Unit>
}

