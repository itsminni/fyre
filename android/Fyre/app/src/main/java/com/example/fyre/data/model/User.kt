package com.example.fyre.data.model

import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

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

object ProfileFieldValues {
    const val GenderMale = "male"
    const val GenderFemale = "female"
    const val GenderNonBinary = "nonBinary"
    const val GenderOther = "other"

    const val OrientationStraight = "straight"
    const val OrientationGay = "gay"
    const val OrientationLesbian = "lesbian"
    const val OrientationBisexual = "bisexual"
    const val OrientationPansexual = "pansexual"
    const val OrientationOther = "other"

    const val IntentRelationship = "relationship"
    const val IntentCasual = "casual"
    const val IntentFriendship = "friendship"
    const val IntentNotSure = "notSure"

    val DefaultPreferredGenders = listOf(GenderMale, GenderFemale, GenderNonBinary, GenderOther)
}

data class UserProfile(
    val firstName: String = "",
    val lastName: String = "",
    val city: String = "",
    val birthDate: String = "",
    val gender: String = ProfileFieldValues.GenderMale,
    val orientation: String = ProfileFieldValues.OrientationStraight,
    val bio: String = "",
    val intent: String = ProfileFieldValues.IntentRelationship,
    val interests: String = "",
    val instagramTag: String? = null,
    val spotifyTag: String? = null,
    val preferredGenders: List<String> = ProfileFieldValues.DefaultPreferredGenders,
    val minPreferredAge: Int = 20,
    val maxPreferredAge: Int = 32,
    val maxDistanceKm: Int? = 50,
    val latitude: Double = 44.6979,
    val longitude: Double = 10.6313,
    val smokes: Boolean = false,
    val drinks: Boolean = false,
    val excludeSmokers: Boolean = false,
    val excludeDrinkers: Boolean = false,
    val avatarUri: String? = null,
    val profilePhotoUris: List<String> = emptyList()
) {
    fun isComplete(): Boolean {
        val age = ageFromBirthDate(birthDate) ?: return false

        return firstName.isNotBlank() &&
            city.isNotBlank() &&
            birthDate.isNotBlank() &&
            age >= 18 &&
            gender.isNotBlank() &&
            orientation.isNotBlank() &&
            bio.isNotBlank() &&
            preferredGenders.any { it.isNotBlank() }
    }

    private fun ageFromBirthDate(value: String): Int? {
        val birth = parseBirthDate(value) ?: return null
        return Period.between(birth, LocalDate.now(ZoneOffset.UTC)).years
    }

    private fun parseBirthDate(value: String): LocalDate? {
        val trimmed = value.trim()
        if (trimmed.isBlank()) return null

        return runCatching {
            LocalDate.parse(trimmed, DateTimeFormatter.ofPattern("dd/MM/yyyy"))
        }.recoverCatching {
            LocalDate.parse(trimmed, DateTimeFormatter.ISO_LOCAL_DATE)
        }.recoverCatching { error ->
            if (error is DateTimeParseException) {
                Instant.parse(trimmed).atZone(ZoneOffset.UTC).toLocalDate()
            } else {
                throw error
            }
        }.getOrNull()
    }
}

fun User.hasCompleteProfile(): Boolean = profile?.isComplete() == true

object PasswordUtils {

fun hashPassword(password: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hashBytes = digest.digest(password.toByteArray(Charsets.UTF_8))
        
        return hashBytes.joinToString("") { "%02x".format(it) }
    }

fun verifyPassword(password: String, hash: String): Boolean {
        return hashPassword(password) == hash
    }
}

