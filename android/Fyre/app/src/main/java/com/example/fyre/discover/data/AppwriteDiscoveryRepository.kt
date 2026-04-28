package com.example.fyre.discover.data

import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteConfigurationException
import com.example.fyre.data.appwrite.AppwriteGateway
import com.example.fyre.data.appwrite.asDoubleOrNull
import com.example.fyre.data.appwrite.arrayOrEmpty
import com.example.fyre.data.appwrite.booleanOrNull
import com.example.fyre.data.appwrite.intOrNull
import com.example.fyre.data.appwrite.stringOrNull
import com.example.fyre.discover.model.DiscoveryProfile
import com.google.gson.JsonObject
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.Period
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

class AppwriteDiscoveryRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration
) : DiscoveryRepository {

    override suspend fun loadProfiles(): Result<List<DiscoveryProfile>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
            val functionId = configuration.discoverProfilesFunctionId
            if (!functionId.isNullOrBlank()) {
                val functionProfilesResult = runCatching {
                    loadProfilesFromFunction(functionId, currentUserId)
                }
                val functionProfiles = functionProfilesResult.getOrNull().orEmpty()
                if (functionProfiles.isNotEmpty()) {
                    return@runCatching functionProfiles
                }

                val fallbackProfiles = runCatching { loadProfilesFromTables(currentUserId) }
                    .getOrDefault(emptyList())
                if (fallbackProfiles.isNotEmpty()) {
                    return@runCatching fallbackProfiles
                }

                return@runCatching functionProfilesResult.getOrThrow()
            }

            loadProfilesFromTables(currentUserId)
        }
    }

    private suspend fun loadProfilesFromFunction(
        functionId: String,
        currentUserId: String
    ): List<DiscoveryProfile> {
        val requestPayload = mapOf("currentUserId" to currentUserId)
        val directPayload = configuration.discoverProfilesFunctionDomain
            ?.let { functionUrl ->
                runCatching {
                    gateway.executeFunctionDirectly(
                        functionUrl = functionUrl,
                        payload = requestPayload
                    )
                }.getOrNull()
            }
            ?.takeIf { it.entrySet().isNotEmpty() }

        val payload = directPayload ?: gateway.executeFunction(
            functionId = functionId,
            payload = requestPayload
        )
        return payload.arrayOrEmpty("profiles")
            .mapNotNull { element ->
                if (element.isJsonObject) {
                    mapProfile(element.asJsonObject)
                } else {
                    null
                }
            }
    }

    private suspend fun loadProfilesFromTables(currentUserId: String): List<DiscoveryProfile> {
        val currentProfile = gateway.fetchProfileRow(currentUserId) ?: return emptyList()
        val currentContext = profileContext(currentProfile) ?: return emptyList()

        val rows = gateway.listRows(
            tableId = configuration.profilesTableId,
            queries = listOf(gateway.queryLimit(100))
        )

        val compatibleProfiles = rows
            .asSequence()
            .filter { row -> candidateUserId(row) != currentUserId }
            .filter { row -> isCompatibleCandidate(row, currentContext) }
            .mapNotNull { row -> mapProfile(row, currentContext) }
            .rankedProfiles()

        if (compatibleProfiles.isNotEmpty()) {
            return compatibleProfiles
        }

        val relaxedProfiles = rows
            .asSequence()
            .filter { row -> candidateUserId(row) != currentUserId }
            .filter { row -> isFallbackDiscoverableCandidate(row, currentContext) }
            .mapNotNull { row -> mapProfile(row, currentContext) }
            .rankedProfiles()

        if (relaxedProfiles.isNotEmpty()) {
            return relaxedProfiles
        }

        return rows
            .asSequence()
            .filter { row -> candidateUserId(row) != currentUserId }
            .filter { row -> isBasicDiscoverableCandidate(row) }
            .mapNotNull { row -> mapProfile(row, currentContext) }
            .rankedProfiles()
    }

    private fun isCompatibleCandidate(row: JsonObject, currentUser: ProfileContext): Boolean {
        if (!isProfileReady(row)) {
            return false
        }

        val candidate = profileContext(row) ?: return false
        val candidateGender = candidate.gender ?: return false
        val currentGender = currentUser.gender ?: return false

        if (candidate.age < 18 || currentUser.age < 18) {
            return false
        }

        if (candidateGender !in currentUser.preferredGenders) {
            return false
        }

        if (currentGender !in candidate.preferredGenders) {
            return false
        }

        if (candidate.age !in currentUser.minPreferredAge..currentUser.maxPreferredAge) {
            return false
        }

        if (currentUser.age !in candidate.minPreferredAge..candidate.maxPreferredAge) {
            return false
        }

        val distanceKm = distanceKmBetween(currentUser, candidate)
        if (distanceKm != null) {
            if (currentUser.maxDistanceKm != null && distanceKm > currentUser.maxDistanceKm) {
                return false
            }
            if (candidate.maxDistanceKm != null && distanceKm > candidate.maxDistanceKm) {
                return false
            }
        } else if (currentUser.maxDistanceKm != null || candidate.maxDistanceKm != null) {
            return false
        }

        return true
    }

    private fun isFallbackDiscoverableCandidate(row: JsonObject, currentUser: ProfileContext): Boolean {
        if (!isProfileReady(row)) {
            return false
        }

        val candidate = profileContext(row) ?: return false
        val candidateGender = candidate.gender ?: return false

        if (candidate.age in 1..17) {
            return false
        }

        if (candidateGender !in currentUser.preferredGenders) {
            return false
        }

        if (candidate.age >= 18 && candidate.age !in currentUser.minPreferredAge..currentUser.maxPreferredAge) {
            return false
        }

        val distanceKm = distanceKmBetween(currentUser, candidate)
        if (distanceKm != null && currentUser.maxDistanceKm != null && distanceKm > currentUser.maxDistanceKm) {
            return false
        }

        return true
    }

    private fun isBasicDiscoverableCandidate(row: JsonObject): Boolean {
        if (!isProfileReady(row)) {
            return false
        }

        val candidate = profileContext(row) ?: return false
        if (candidate.gender == null) {
            return false
        }

        return candidate.age == 0 || candidate.age >= 18
    }

    private fun isProfileReady(row: JsonObject): Boolean {
        if (row.booleanOrNull("profileReady") == true) {
            return true
        }

        return row.stringOrNull("firstName").orEmpty().isNotBlank() &&
            row.stringOrNull("city").orEmpty().isNotBlank() &&
            normalizeGender(row.stringOrNull("gender")) != null &&
            (row.intOrNull("age") ?: ageFromBirthDate(row.stringOrNull("birthDate")) ?: 0) >= 18 &&
            row.stringOrNull("bio").orEmpty().isNotBlank()
    }

    private fun profileContext(row: JsonObject): ProfileContext? {
        val minPreferredAge = (row.intOrNull("minPreferredAge") ?: DefaultMinAge).coerceIn(18, 98)
        val maxPreferredAge = (row.intOrNull("maxPreferredAge") ?: DefaultMaxAge)
            .coerceIn(maxOf(minPreferredAge + 1, 19), 99)

        return ProfileContext(
            gender = normalizeGender(row.stringOrNull("gender")),
            age = row.intOrNull("age") ?: ageFromBirthDate(row.stringOrNull("birthDate")) ?: 0,
            preferredGenders = preferredGenders(row),
            minPreferredAge = minPreferredAge,
            maxPreferredAge = maxPreferredAge,
            maxDistanceKm = row.intOrNull("maxDistanceKm")?.coerceAtLeast(5),
            latitude = row["latitude"]?.asDoubleOrNull(),
            longitude = row["longitude"]?.asDoubleOrNull()
        )
    }

    private fun preferredGenders(row: JsonObject): List<String> {
        val fromArray = row.arrayOrEmpty("preferredGenders")
            .mapNotNull { element ->
                if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                    normalizeGender(element.asString)
                } else {
                    null
                }
            }

        val fromCsv = row.stringOrNull("preferredGenders")
            ?.split(',', '|', '\n')
            ?.mapNotNull(::normalizeGender)
            .orEmpty()

        return (fromArray + fromCsv)
            .distinct()
            .ifEmpty { AllGenders }
    }

    private fun candidateUserId(row: JsonObject): String? {
        return row.stringOrNull("id")
            ?: row.stringOrNull("userId")
            ?: row.stringOrNull("\$id")
    }

    private fun distanceKmBetween(lhs: ProfileContext, rhs: ProfileContext): Double? {
        val lhsLatitude = lhs.latitude ?: return null
        val lhsLongitude = lhs.longitude ?: return null
        val rhsLatitude = rhs.latitude ?: return null
        val rhsLongitude = rhs.longitude ?: return null

        val earthRadiusKm = 6371.0
        val latDelta = Math.toRadians(rhsLatitude - lhsLatitude)
        val lonDelta = Math.toRadians(rhsLongitude - lhsLongitude)
        val lhsLat = Math.toRadians(lhsLatitude)
        val rhsLat = Math.toRadians(rhsLatitude)
        val haversine = sin(latDelta / 2) * sin(latDelta / 2) +
            cos(lhsLat) * cos(rhsLat) * sin(lonDelta / 2) * sin(lonDelta / 2)
        val arc = 2 * atan2(sqrt(haversine), sqrt(1 - haversine))
        return earthRadiusKm * arc
    }

    private fun normalizeGender(value: String?): String? {
        return when (value?.replace(Regex("[\\s_-]"), "")?.lowercase(Locale.ROOT)) {
            "male" -> "male"
            "female" -> "female"
            "nonbinary" -> "nonBinary"
            "other" -> "other"
            else -> null
        }
    }

    private fun normalizeIntent(value: String?): String? {
        val normalized = value
            ?.trim()
            ?.lowercase(Locale.ROOT)
            ?.replace(Regex("[\\s_-]"), "")
            ?: return null

        return when {
            normalized in setOf("relationship", "relazione", "relazioneseria") -> "relationship"
            normalized in setOf("casual", "dating", "qualcosadileggero", "connessionicasual") -> "casual"
            normalized in setOf("friendship", "amicizia", "nuoveamicizie", "conoscerenuovepersone") -> "friendship"
            normalized in setOf("notsure", "nonlosoancora", "stoancoraesplorando") -> "notSure"
            else -> null
        }
    }

    private fun ageFromBirthDate(value: String?): Int? {
        val birthDate = parseBirthDate(value) ?: return null
        return Period.between(birthDate, LocalDate.now(ZoneOffset.UTC)).years
    }

    private fun parseBirthDate(value: String?): LocalDate? {
        val trimmed = value?.trim().orEmpty()
        if (trimmed.isBlank()) return null

        return runCatching {
            LocalDate.parse(trimmed, DateTimeFormatter.ofPattern("dd/MM/yyyy"))
        }.recoverCatching {
            LocalDate.parse(trimmed, DateTimeFormatter.ISO_LOCAL_DATE)
        }.recoverCatching {
            Instant.parse(trimmed).atZone(ZoneOffset.UTC).toLocalDate()
        }.recoverCatching { error ->
            if (error is DateTimeParseException) {
                OffsetDateTime.parse(trimmed).toLocalDate()
            } else {
                throw error
            }
        }.getOrNull()
    }

    private fun roundedDistanceBetween(currentContext: ProfileContext?, row: JsonObject): Int? {
        val current = currentContext ?: return null
        val candidate = profileContext(row) ?: return null
        return distanceKmBetween(current, candidate)
            ?.roundToInt()
            ?.coerceAtLeast(1)
    }

    private data class ProfileContext(
        val gender: String?,
        val age: Int,
        val preferredGenders: List<String>,
        val minPreferredAge: Int,
        val maxPreferredAge: Int,
        val maxDistanceKm: Int?,
        val latitude: Double?,
        val longitude: Double?
    )

    override suspend fun submitDecision(
        profile: DiscoveryProfile,
        liked: Boolean
    ): Result<SwipeOutcome> {
        return runCatching {
            val functionId = configuration.recordSwipeFunctionId
                ?: throw AppwriteConfigurationException("Funzione swipe Appwrite non configurata")
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val response = gateway.executeFunction(
                functionId = functionId,
                payload = mapOf(
                    "currentUserId" to currentUserId,
                    "otherUserId" to profile.id,
                    "otherUserName" to profile.name,
                    "decision" to if (liked) "liked" else "passed"
                )
            )

            val matched = response.booleanOrNull("matched") == true
            val threadId = if (!matched) {
                null
            } else {
                response.stringOrNull("threadId")
                    ?: fetchThreadIdFromCreateOrGet(
                        currentUserId = currentUserId,
                        otherUserId = profile.id
                    )
            }
            SwipeOutcome(
                matched = matched,
                threadId = threadId
            )
        }
    }

    private suspend fun fetchThreadIdFromCreateOrGet(
        currentUserId: String,
        otherUserId: String
    ): String? {
        val functionId = configuration.createOrGetThreadFunctionId
        if (functionId.isBlank()) {
            return null
        }

        return runCatching {
            val payload = gateway.executeFunction(
                functionId = functionId,
                payload = mapOf(
                    "currentUserId" to currentUserId,
                    "otherUserId" to otherUserId
                )
            )
            payload.stringOrNull("threadId")
        }.getOrNull()
    }

    private fun mapProfile(row: JsonObject, currentContext: ProfileContext? = null): DiscoveryProfile? {
        val id = candidateUserId(row)
            ?: return null

        val name = row.stringOrNull("name")
            ?: row.stringOrNull("firstName")
            ?: row.stringOrNull("email")?.substringBefore("@")
            ?: "Utente"

        val age = row.intOrNull("age") ?: ageFromBirthDate(row.stringOrNull("birthDate")) ?: 18
        val city = row.stringOrNull("city") ?: "Citta sconosciuta"
        val distance = (
            row.intOrNull("distanceKm")
                ?: row.intOrNull("distance")
                ?: roundedDistanceBetween(currentContext, row)
                ?: 0
            ).coerceAtLeast(0)
        val bio = row.stringOrNull("bio") ?: "Profilo Fyre"
        val intent = normalizeIntent(row.stringOrNull("intent"))
            ?: row.stringOrNull("intent")
            ?: "relationship"

        val interests = row.arrayOrEmpty("commonInterests")
            .mapNotNull { element ->
                if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                    element.asString.trim().takeIf { it.isNotBlank() }
                } else {
                    null
                }
            }
            .ifEmpty {
                row.stringOrNull("interests")
                    ?.split(',', '|', '\n')
                    ?.map { it.trim() }
                    ?.filter { it.isNotBlank() }
                    .orEmpty()
            }
            .ifEmpty { listOf("Fyre") }

        val socialTags = listOfNotNull(
            row.stringOrNull("instagramTag")?.let(::socialTag),
            row.stringOrNull("spotifyTag")?.let(::socialTag)
        ).ifEmpty { listOf("@fyre") }

        val photoUrls = row.arrayOrEmpty("photos")
            .mapNotNull { element ->
                if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                    element.asString.trim().takeIf { it.startsWith("http") }
                } else {
                    null
                }
            }
            .ifEmpty {
                row.arrayOrEmpty("photoFileIds")
                    .mapNotNull { element ->
                        if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                            gateway.avatarUrl(element.asString)
                        } else {
                            null
                        }
                    }
            }
            .ifEmpty { listOfNotNull(gateway.avatarUrl(row.stringOrNull("avatarFileId"))) }

        return DiscoveryProfile(
            id = id,
            name = name,
            age = age.coerceAtLeast(18),
            isVerified = row.booleanOrNull("verified")
                ?: row.booleanOrNull("isVerified")
                ?: false,
            city = city,
            distanceKm = distance,
            bio = bio,
            intent = intent,
            interests = interests,
            socialTags = socialTags,
            photoUrls = photoUrls,
            compatibilityScore = (row.intOrNull("compatibilityScore") ?: row.intOrNull("compatibility") ?: 82)
                .coerceIn(1, 100),
            gender = normalizeGender(row.stringOrNull("gender")),
            orientation = normalizeOrientation(row.stringOrNull("orientation")),
            smokes = row.booleanOrNull("smokes"),
            drinks = row.booleanOrNull("drinks")
        )
    }

    private fun socialTag(value: String): String? {
        val normalized = value.trim().removePrefix("@").takeIf { it.isNotBlank() } ?: return null
        return "@$normalized"
    }

    private fun normalizeOrientation(value: String?): String? {
        return when (value?.replace(Regex("[\\s_-]"), "")?.lowercase(Locale.ROOT)) {
            "straight" -> "straight"
            "gay" -> "gay"
            "lesbian" -> "lesbian"
            "bisexual" -> "bisexual"
            "pansexual" -> "pansexual"
            "other" -> "other"
            else -> null
        }
    }

    private fun Sequence<DiscoveryProfile>.rankedProfiles(): List<DiscoveryProfile> {
        return sortedWith(
            compareByDescending<DiscoveryProfile> { it.compatibilityScore }
                .thenBy { it.distanceKm }
        )
            .take(MaxProfiles)
            .toList()
    }

    private companion object {
        private const val MaxProfiles = 40
        private const val DefaultMinAge = 18
        private const val DefaultMaxAge = 35
        private val AllGenders = listOf("male", "female", "nonBinary", "other")
    }
}
