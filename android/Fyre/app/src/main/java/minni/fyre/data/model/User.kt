package minni.fyre.data.model

import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

data class User(
    val email: String,
    val displayName: String,
    val createdAt: Long = System.currentTimeMillis(),
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

    const val MinPreferredAge = 18
    const val MaxPreferredAge = 99
    const val MinDistanceKm = 5
    const val MaxDistanceKm = 999

    val SupportedGenders = listOf(GenderMale, GenderFemale, GenderNonBinary, GenderOther)
    val SupportedOrientations = listOf(
        OrientationStraight,
        OrientationGay,
        OrientationLesbian,
        OrientationBisexual,
        OrientationPansexual,
        OrientationOther
    )
    val SupportedIntents = listOf(IntentRelationship, IntentFriendship, IntentCasual, IntentNotSure)

    fun canonicalGenderOrNull(value: String?): String? {
        val normalized = value
            ?.trim()
            ?.replace(Regex("[\\s_-]+"), "")
            ?.lowercase(Locale.ROOT)
            ?: return null
        return when (normalized) {
            "male" -> GenderMale
            "female" -> GenderFemale
            "nonbinary" -> GenderNonBinary
            "other" -> GenderOther
            else -> null
        }
    }

    fun canonicalPreferredGenders(values: List<String>): List<String> {
        val canonical = values.mapNotNull(::canonicalGenderOrNull).toSet()
        return SupportedGenders.filter(canonical::contains)
    }

    fun canonicalOrientationOrNull(value: String?): String? {
        val candidate = value?.trim() ?: return null
        return SupportedOrientations.firstOrNull { it.equals(candidate, ignoreCase = true) }
    }

    fun canonicalIntentOrNull(value: String?): String? {
        val candidate = value?.trim() ?: return null
        return SupportedIntents.firstOrNull { it.equals(candidate, ignoreCase = true) }
    }

    fun canonicalIntent(
        value: String?,
        fallback: String = IntentNotSure
    ): String {
        return canonicalIntentOrNull(value) ?: canonicalIntentOrNull(fallback) ?: IntentNotSure
    }

    fun preferredAgeRange(minAge: Int, maxAge: Int): Pair<Int, Int> {
        val minimum = minAge.coerceIn(MinPreferredAge, MaxPreferredAge - 1)
        val maximum = maxAge.coerceIn(minimum + 1, MaxPreferredAge)
        return minimum to maximum
    }

    fun maxDistanceKm(value: Int?): Int? {
        return value?.coerceIn(MinDistanceKm, MaxDistanceKm)
    }
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
    val preferredGenders: List<String> = emptyList(),
    val minPreferredAge: Int = 20,
    val maxPreferredAge: Int = 32,
    val maxDistanceKm: Int? = 50,
    val latitude: Double? = null,
    val longitude: Double? = null,
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
            ProfileFieldValues.canonicalGenderOrNull(gender) != null &&
            ProfileFieldValues.canonicalOrientationOrNull(orientation) != null &&
            bio.isNotBlank() &&
            ProfileFieldValues.canonicalPreferredGenders(preferredGenders).isNotEmpty()
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
