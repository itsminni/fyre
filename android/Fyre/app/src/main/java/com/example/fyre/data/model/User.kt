package com.example.fyre.data.model

import java.security.MessageDigest

/**
 * Data class che rappresenta un utente dell'app.
 *
 * @property email Email univoca dell'utente (usata come identificatore)
 * @property passwordHash Hash SHA-256 della password (mai salvata in chiaro)
 * @property displayName Nome visualizzato dell'utente
 * @property createdAt Timestamp di creazione dell'account (millisecondi)
 */
data class User(
    val email: String,
    val passwordHash: String,
    val displayName: String,
    val createdAt: Long = System.currentTimeMillis(),
    val termsAcceptedAt: Long? = null,
    val privacyAcceptedAt: Long? = null,
    val profile: UserProfile? = null,
    val appwriteUserId: String? = null,
    val avatarFileId: String? = null,
    val photoFileIds: List<String> = emptyList()
)

data class UserProfile(
    val firstName: String = "",
    val lastName: String = "",
    val username: String = "",
    val city: String = "",
    val birthDate: String = "",
    val bio: String = "",
    val avatarUri: String? = null,
    val gender: String = "male",
    val orientation: String = "straight",
    val preferredGenders: List<String> = listOf("male", "female", "nonbinary", "other"),
    val minPreferredAge: Int = 18,
    val maxPreferredAge: Int = 35,
    val maxDistanceKm: Int = 50,
    val latitude: Double = 44.6979,
    val longitude: Double = 10.6313,
    val interests: String = "",
    val instagramTag: String? = null,
    val spotifyTag: String? = null
) {
    fun isComplete(): Boolean {
        return firstName.isNotBlank() &&
            lastName.isNotBlank() &&
            username.isNotBlank() &&
            city.isNotBlank() &&
            birthDate.isNotBlank() &&
            !avatarUri.isNullOrBlank()
    }
}

fun User.hasCompleteProfile(): Boolean = profile?.isComplete() == true

/**
 * Oggetto di utilità per operazioni relative alla sicurezza degli utenti.
 *
 * NOTA: In un'app di produzione si userebbe bcrypt/scrypt con salt.
 * SHA-256 è sufficiente per questo progetto scolastico.
 */
object PasswordUtils {

    /**
     * Calcola l'hash SHA-256 di una stringa (password).
     * @param password La password in chiaro da hashare
     * @return La stringa esadecimale dell'hash
     */
    fun hashPassword(password: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(password.toByteArray(Charsets.UTF_8))
        // Converte i byte in una stringa esadecimale
        return hashBytes.joinToString("") { "%02x".format(it) }
    }

    /**
     * Verifica se una password corrisponde al suo hash.
     * @param password La password in chiaro da verificare
     * @param hash L'hash salvato da confrontare
     * @return true se la password corrisponde
     */
    fun verifyPassword(password: String, hash: String): Boolean {
        return hashPassword(password) == hash
    }
}

