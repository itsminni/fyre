package com.example.fyre.discover.data

import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteConfigurationException
import com.example.fyre.data.appwrite.AppwriteGateway
import com.example.fyre.data.appwrite.asDoubleOrNull
import com.example.fyre.data.appwrite.arrayOrEmpty
import com.example.fyre.data.appwrite.booleanOrNull
import com.example.fyre.data.appwrite.intOrNull
import com.example.fyre.data.appwrite.stringOrNull
import com.example.fyre.data.local.LocalMatchRequestStore
import com.example.fyre.data.local.LocalRecentChatStore
import com.example.fyre.discover.model.DiscoveryProfile
import com.example.fyre.messages.model.MessageThread
import com.google.gson.JsonObject
import java.security.MessageDigest
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
import kotlinx.coroutines.delay

class AppwriteDiscoveryRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration,
    private val localMatchRequestStore: LocalMatchRequestStore,
    private val localRecentChatStore: LocalRecentChatStore
) : DiscoveryRepository {

    override suspend fun loadProfiles(): Result<List<DiscoveryProfile>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
            val currentProfile = gateway.fetchProfileRow(currentUserId)
            val currentContext = currentProfile?.let(::profileContext)
            val functionId = configuration.discoverProfilesFunctionId
            if (!functionId.isNullOrBlank()) {
                val functionProfilesResult = runCatching {
                    loadProfilesFromFunction(functionId, currentUserId)
                        .filterForCurrentProfile(currentProfile, currentContext)
                }
                val functionProfiles = functionProfilesResult.getOrNull().orEmpty()
                if (functionProfiles.isNotEmpty()) {
                    return@runCatching functionProfiles
                }

                val fallbackProfiles = runCatching {
                    loadProfilesFromTables(currentUserId, currentProfile, currentContext)
                }
                    .getOrDefault(emptyList())
                if (fallbackProfiles.isNotEmpty()) {
                    return@runCatching fallbackProfiles
                }

                return@runCatching functionProfilesResult.getOrThrow()
            }

            loadProfilesFromTables(currentUserId, currentProfile, currentContext)
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

    private suspend fun loadProfilesFromTables(
        currentUserId: String,
        currentProfile: JsonObject?,
        currentContext: ProfileContext?
    ): List<DiscoveryProfile> {
        val currentInterests = currentProfile?.let(::interestListValue).orEmpty()
        val excludeSmokers = currentProfile?.booleanOrNull("excludeSmokers") ?: false
        val excludeDrinkers = currentProfile?.booleanOrNull("excludeDrinkers") ?: false
        val excludedUserIds = excludedDiscoverUserIds(currentUserId)

        val rows = gateway.listRows(
            tableId = configuration.profilesTableId,
            queries = listOf(gateway.queryLimit(100))
        )

        return rows
            .asSequence()
            .filter { row ->
                val userId = candidateUserId(row)
                userId != null &&
                    userId != currentUserId &&
                    userId !in excludedUserIds &&
                    !(excludeSmokers && row.booleanOrNull("smokes") == true) &&
                    !(excludeDrinkers && row.booleanOrNull("drinks") == true) &&
                    currentContext?.let {
                        isCompatibleCandidate(row, it) || isFallbackDiscoverableCandidate(row, it)
                    } ?: isBasicDiscoverableCandidate(row)
            }
            .mapNotNull { row -> mapFallbackProfile(row, currentContext, currentInterests) }
            .rankedProfiles()
    }

    private suspend fun excludedDiscoverUserIds(currentUserId: String): Set<String> {
        val excluded = mutableSetOf<String>()

        configuration.swipesTableId?.let { swipesTableId ->
            gateway.listRows(
                tableId = swipesTableId,
                queries = listOf(gateway.queryEqual("fromUserId", listOf(currentUserId)))
            ).mapNotNullTo(excluded) { row -> row.stringOrNull("toUserId") }
        }

        configuration.matchesTableId?.let { matchesTableId ->
            gateway.listRows(
                tableId = matchesTableId,
                queries = listOf(gateway.queryEqual("userAId", listOf(currentUserId)))
            ).mapNotNullTo(excluded) { row -> row.stringOrNull("userBId") }

            gateway.listRows(
                tableId = matchesTableId,
                queries = listOf(gateway.queryEqual("userBId", listOf(currentUserId)))
            ).mapNotNullTo(excluded) { row -> row.stringOrNull("userAId") }
        }

        configuration.relationshipsTableId?.let { relationshipsTableId ->
            val relationshipRows = gateway.listRows(
                tableId = relationshipsTableId,
                queries = listOf(gateway.queryEqual("userAId", listOf(currentUserId)))
            ) + gateway.listRows(
                tableId = relationshipsTableId,
                queries = listOf(gateway.queryEqual("userBId", listOf(currentUserId)))
            )

            relationshipRows.forEach { row ->
                val otherUserId = when (currentUserId) {
                    row.stringOrNull("userAId") -> row.stringOrNull("userBId")
                    row.stringOrNull("userBId") -> row.stringOrNull("userAId")
                    else -> null
                }
                val state = relationshipStateForUser(row, currentUserId)
                if (
                    !otherUserId.isNullOrBlank() &&
                    state in setOf(
                        RelationshipStateArchived,
                        RelationshipStateBlocked,
                        RelationshipStateLiked,
                        RelationshipStateMatched
                    )
                ) {
                    excluded += otherUserId
                }
            }
        }

        return excluded
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

    private fun List<DiscoveryProfile>.filterForCurrentProfile(
        currentProfile: JsonObject?,
        currentUser: ProfileContext?
    ): List<DiscoveryProfile> {
        val current = currentUser ?: return this
        val excludeSmokers = currentProfile?.booleanOrNull("excludeSmokers") ?: false
        val excludeDrinkers = currentProfile?.booleanOrNull("excludeDrinkers") ?: false

        return filter { profile ->
            val candidateGender = normalizeGender(profile.gender)
            candidateGender != null &&
                candidateGender in current.preferredGenders &&
                profile.age >= 18 &&
                profile.age in current.minPreferredAge..current.maxPreferredAge &&
                (current.maxDistanceKm == null || profile.distanceKm <= 0 || profile.distanceKm <= current.maxDistanceKm) &&
                !(excludeSmokers && profile.smokes == true) &&
                !(excludeDrinkers && profile.drinks == true)
        }
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
            if (!liked) {
                localMatchRequestStore.markProfileDismissed(profile.id)
                return@runCatching SwipeOutcome(matched = false, threadId = null)
            }

            val relationshipState = response.stringOrNull("relationshipState")
            val threadId = when {
                matched -> response.stringOrNull("threadId")
                    ?: fetchMatchedThreadIdAfterSwipe(
                        currentUserId = currentUserId,
                        otherUserId = profile.id,
                        otherUserName = profile.name
                    )

                response.entrySet().isEmpty() || relationshipState == RelationshipStateMatched ->
                    fetchMatchedThreadIdAfterSwipe(
                        currentUserId = currentUserId,
                        otherUserId = profile.id,
                        otherUserName = profile.name
                    )

                else -> null
            }

            localMatchRequestStore.markProfileDismissed(profile.id)
            if (!threadId.isNullOrBlank()) {
                localRecentChatStore.upsertThread(
                    currentUserId = currentUserId,
                    thread = MessageThread(
                        id = threadId,
                        avatarLabel = profile.name.firstOrNull()?.uppercase() ?: "M",
                        displayName = profile.name,
                        lastMessage = "Inizia la conversazione",
                        lastTimestamp = System.currentTimeMillis(),
                        unreadCount = 0,
                        backendThreadId = threadId,
                        participantsBackendIds = listOf(currentUserId, profile.id)
                    )
                )
            }
            SwipeOutcome(
                matched = !threadId.isNullOrBlank(),
                threadId = threadId
            )
        }
    }

    private suspend fun fetchMatchedThreadIdAfterSwipe(
        currentUserId: String,
        otherUserId: String,
        otherUserName: String
    ): String? {
        repeat(MatchFetchRetryCount) { attempt ->
            val threadId = runCatching {
                if (!hasMatchedRelationshipWithCurrentUser(currentUserId, otherUserId)) {
                    return@runCatching null
                }

                fetchThreadIdFromCreateOrGet(
                    currentUserId = currentUserId,
                    otherUserId = otherUserId,
                    otherUserName = otherUserName
                )
            }.getOrNull()

            if (!threadId.isNullOrBlank()) {
                return threadId
            }

            if (attempt < MatchFetchRetryCount - 1) {
                delay(MatchFetchRetryDelayMs)
            }
        }

        return null
    }

    private suspend fun hasMatchedRelationshipWithCurrentUser(
        currentUserId: String,
        otherUserId: String
    ): Boolean {
        val relationshipState = fetchRelationshipState(
            currentUserId = currentUserId,
            otherUserId = otherUserId
        )
        if (relationshipState == RelationshipStateMatched) {
            return true
        }

        return hasLegacyMatch(currentUserId, otherUserId)
    }

    private suspend fun fetchRelationshipState(
        currentUserId: String,
        otherUserId: String
    ): String {
        val relationshipRow = fetchRelationshipRow(currentUserId, otherUserId)
            ?: return when {
                hasLegacyMatch(currentUserId, otherUserId) -> RelationshipStateMatched
                configuration.relationshipsTableId == null -> RelationshipStateMatched
                else -> RelationshipStateNone
            }

        val currentState = relationshipStateForUser(relationshipRow, currentUserId)
        val otherState = relationshipStateForUser(relationshipRow, otherUserId)

        if (currentState == RelationshipStateBlocked || otherState == RelationshipStateBlocked) {
            return RelationshipStateBlocked
        }

        if (currentState == RelationshipStateArchived) {
            return RelationshipStateArchived
        }

        if (relationshipRow.hasNonNull("matchedAt") ||
            currentState == RelationshipStateMatched ||
            otherState == RelationshipStateMatched
        ) {
            return RelationshipStateMatched
        }

        if (currentState == RelationshipStateLiked) {
            return RelationshipStateLiked
        }

        return RelationshipStateNone
    }

    private suspend fun fetchRelationshipRow(
        currentUserId: String,
        otherUserId: String
    ): JsonObject? {
        val relationshipsTableId = configuration.relationshipsTableId ?: return null
        val userIds = listOf(currentUserId, otherUserId).sorted()
        val stableRelationship = gateway.getRowIfAccessible(
            tableId = relationshipsTableId,
            rowId = stableRelationshipRowId(userIds)
        )
        if (stableRelationship != null) {
            return stableRelationship
        }

        return gateway.listRows(
            tableId = relationshipsTableId,
            queries = listOf(
                gateway.queryEqual("pairKey", listOf(userIds.joinToString(":"))),
                gateway.queryLimit(1)
            )
        ).firstOrNull()
    }

    private suspend fun hasLegacyMatch(
        currentUserId: String,
        otherUserId: String
    ): Boolean {
        val matchesTableId = configuration.matchesTableId ?: return false
        val userIds = listOf(currentUserId, otherUserId).sorted()
        val stableMatch = gateway.getRowIfAccessible(
            tableId = matchesTableId,
            rowId = stableMatchRowId(userIds)
        )
        if (stableMatch != null) {
            return true
        }

        return gateway.listRows(
            tableId = matchesTableId,
            queries = listOf(
                gateway.queryEqual("matchKey", listOf(userIds.joinToString(":"))),
                gateway.queryLimit(1)
            )
        ).isNotEmpty()
    }

    private fun relationshipStateForUser(relationship: JsonObject, userId: String): String {
        return when (userId) {
            relationship.stringOrNull("userAId") -> relationship.stringOrNull("userAState") ?: RelationshipStateNone
            relationship.stringOrNull("userBId") -> relationship.stringOrNull("userBState") ?: RelationshipStateNone
            else -> RelationshipStateNone
        }
    }

    private fun JsonObject.hasNonNull(key: String): Boolean {
        val element = get(key) ?: return false
        return !element.isJsonNull
    }

    private suspend fun fetchThreadIdFromCreateOrGet(
        currentUserId: String,
        otherUserId: String,
        otherUserName: String
    ): String? {
        val functionId = configuration.createOrGetThreadFunctionId
        if (functionId.isBlank()) {
            return null
        }

        val requestPayload = mapOf(
            "currentUserId" to currentUserId,
            "otherUserId" to otherUserId,
            "otherUserName" to otherUserName
        )

        val directThreadId = configuration.createOrGetThreadFunctionDomain
            ?.let { functionUrl ->
                runCatching {
                    gateway.executeFunctionDirectly(
                        functionUrl = functionUrl,
                        payload = requestPayload
                    )
                }.getOrNull()
            }
            ?.stringOrNull("threadId")

        if (!directThreadId.isNullOrBlank()) {
            return directThreadId
        }

        return runCatching {
            val payload = gateway.executeFunction(
                functionId = functionId,
                payload = requestPayload
            )
            payload.stringOrNull("threadId")
        }.getOrNull()
    }

    private fun stableMatchRowId(userIds: List<String>): String =
        stableRowId("mt", userIds.joinToString(":"))

    private fun stableRelationshipRowId(userIds: List<String>): String =
        stableRowId("rl", userIds.joinToString(":"))

    private fun stableRowId(prefix: String, seed: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(seed.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
            .take(32)
        return "${prefix}_$digest"
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

    private fun mapFallbackProfile(
        row: JsonObject,
        currentContext: ProfileContext?,
        currentInterests: List<String>
    ): DiscoveryProfile? {
        val profile = mapProfile(row, currentContext) ?: return null
        val commonInterests = profile.interests
            .filter { interest -> currentInterests.any { it.equals(interest, ignoreCase = true) } }
            .take(4)

        return profile.copy(
            interests = commonInterests.ifEmpty { profile.interests },
            compatibilityScore = fallbackCompatibilityScore(
                commonInterests = commonInterests,
                hasPhotos = profile.photoUrls.isNotEmpty(),
                hasBio = profile.bio.isNotBlank() && profile.bio != "Profilo Fyre"
            )
        )
    }

    private fun fallbackCompatibilityScore(
        commonInterests: List<String>,
        hasPhotos: Boolean,
        hasBio: Boolean
    ): Int {
        val score = 28 +
            (commonInterests.size.coerceAtMost(4) * 11) +
            if (hasPhotos) 4 else 0 +
            if (hasBio) 3 else 0
        return score.coerceIn(28, 86)
    }

    private fun interestListValue(row: JsonObject): List<String> {
        return row.stringOrNull("interests")
            ?.split(',', '|', '\n')
            ?.map { it.trim() }
            ?.filter { it.isNotBlank() }
            .orEmpty()
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
        private const val MatchFetchRetryCount = 5
        private const val MatchFetchRetryDelayMs = 250L
        private const val RelationshipStateNone = "none"
        private const val RelationshipStateLiked = "liked"
        private const val RelationshipStateMatched = "matched"
        private const val RelationshipStateArchived = "archived"
        private const val RelationshipStateBlocked = "blocked"
    }
}
