package minni.fyre.data.repository

import minni.fyre.data.model.User
import minni.fyre.data.model.UserProfile

interface AuthRepository {
    suspend fun findUserByEmail(email: String): User?

    suspend fun registerUser(
        email: String,
        password: String,
        displayName: String
    ): Result<User>

    suspend fun authenticateUser(email: String, password: String): Result<User>

    suspend fun updateUserProfile(email: String, profile: UserProfile): Result<User>

    suspend fun restoreSession(): Result<User?>

    suspend fun logout(): Result<Unit>
}
