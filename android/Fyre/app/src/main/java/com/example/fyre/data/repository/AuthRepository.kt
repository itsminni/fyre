package com.example.fyre.data.repository

import com.example.fyre.data.model.User
import com.example.fyre.data.model.UserProfile

/**
 * Contratto repository per autenticazione locale/fake.
 */
interface AuthRepository {
    fun findUserByEmail(email: String): User?

    fun registerUser(
        email: String,
        password: String,
        displayName: String,
        termsAcceptedAt: Long? = null,
        privacyAcceptedAt: Long? = null
    ): Result<User>

    fun authenticateUser(email: String, password: String): Result<User>

    fun updateUserProfile(email: String, profile: UserProfile): Result<User>
}

