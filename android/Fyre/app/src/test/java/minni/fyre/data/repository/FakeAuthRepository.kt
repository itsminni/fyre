package minni.fyre.data.repository

import minni.fyre.data.model.User
import minni.fyre.data.model.UserProfile
import kotlinx.coroutines.CompletableDeferred

class FakeAuthRepository(
    private val logoutGate: CompletableDeferred<Unit>? = null
) : AuthRepository {
    private val users = mutableListOf<User>()
    private val passwordsByEmail = mutableMapOf<String, String>()
    private var currentUser: User? = null
    var logoutCallCount: Int = 0
        private set

    override suspend fun findUserByEmail(email: String): User? {
        return users.find { it.email.equals(email, ignoreCase = true) }
    }

    override suspend fun registerUser(
        email: String,
        password: String,
        displayName: String
    ): Result<User> {
        if (findUserByEmail(email) != null) {
            return Result.failure(IllegalStateException("Esiste gia un account con questa email"))
        }

        val user = User(
            email = email.trim().lowercase(),
            displayName = displayName.trim()
        )
        users += user
        passwordsByEmail[user.email] = password
        currentUser = user
        return Result.success(user)
    }

    override suspend fun authenticateUser(email: String, password: String): Result<User> {
        val user = findUserByEmail(email)
            ?: return Result.failure(IllegalStateException("Nessun account trovato con questa email"))

        return if (passwordsByEmail[user.email] == password) {
            currentUser = user
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
        currentUser = updated
        return Result.success(updated)
    }

    override suspend fun restoreSession(): Result<User?> = Result.success(currentUser)

    override suspend fun logout(): Result<Unit> {
        logoutCallCount += 1
        logoutGate?.await()
        currentUser = null
        return Result.success(Unit)
    }
}
