package minni.fyre.discover.data

import minni.fyre.data.appwrite.AppwriteConfiguration
import minni.fyre.data.appwrite.AppwriteConfigurationException
import minni.fyre.data.appwrite.AppwriteGateway
import minni.fyre.data.appwrite.arrayOrEmpty
import minni.fyre.data.appwrite.booleanOrNull
import minni.fyre.data.appwrite.intOrNull
import minni.fyre.data.appwrite.stringOrNull
import minni.fyre.data.appwrite.tokenizedFileViewUrl
import minni.fyre.data.local.LocalRecentChatStore
import minni.fyre.data.model.ProfileFieldValues
import minni.fyre.discover.model.DiscoveryProfile
import minni.fyre.messages.model.MessageThread
import com.google.gson.JsonObject

class AppwriteDiscoveryRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration,
    private val localRecentChatStore: LocalRecentChatStore
) : DiscoveryRepository {

    override suspend fun loadProfiles(): Result<List<DiscoveryProfile>> {
        return runCatching {
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")
            val functionId = configuration.discoverProfilesFunctionId
                ?.takeIf { it.isNotBlank() }
                ?: throw AppwriteConfigurationException(
                    "APPWRITE_DISCOVER_PROFILES_FUNCTION_ID non configurato"
                )

            loadProfilesFromFunction(functionId, currentUserId)
        }
    }

    private suspend fun loadProfilesFromFunction(
        functionId: String,
        currentUserId: String
    ): List<DiscoveryProfile> {
        return firstNonEmptyDiscoveryWindow { profileCursor ->
            val requestPayload = buildMap<String, Any?> {
                put("currentUserId", currentUserId)
                profileCursor?.let { put("profileCursor", it) }
            }
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
            val profiles = payload.get("profiles")
            if (profiles == null || !profiles.isJsonArray) {
                throw AppwriteConfigurationException("Risposta discovery Appwrite non valida")
            }

            DiscoveryFunctionPage(
                profiles = profiles.asJsonArray.mapNotNull { element ->
                    if (element.isJsonObject) projectDiscoveryProfile(element.asJsonObject) else null
                },
                nextCursor = discoveryNextCursor(payload)
            )
        }
    }

    private fun discoveryNextCursor(payload: JsonObject): String? {
        val value = payload.get("nextCursor") ?: return null
        if (value.isJsonNull) return null
        if (!value.isJsonPrimitive || !value.asJsonPrimitive.isString) {
            throw AppwriteConfigurationException("Cursore discovery Appwrite non valido")
        }

        return value.asString.trim().takeIf { it.isNotEmpty() }
            ?: throw AppwriteConfigurationException("Cursore discovery Appwrite non valido")
    }

    override suspend fun submitDecision(
        profile: DiscoveryProfile,
        liked: Boolean
    ): Result<SwipeOutcome> {
        return runCatching {
            val functionId = configuration.recordSwipeFunctionId
                ?.takeIf { it.isNotBlank() }
                ?: throw AppwriteConfigurationException("Funzione swipe Appwrite non configurata")
            val currentUserId = gateway.fetchCurrentAccountId(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non disponibile")

            val response = gateway.executeFunction(
                functionId = functionId,
                payload = mapOf(
                    "currentUserId" to currentUserId,
                    "otherUserId" to profile.id,
                    "decision" to if (liked) "liked" else "passed"
                )
            )

            if (!liked || response.booleanOrNull("matched") != true) {
                return@runCatching SwipeOutcome(matched = false, threadId = null)
            }

            val threadId = response.stringOrNull("threadId")
                ?.takeIf { it.isNotBlank() }
                ?: throw AppwriteConfigurationException("Risposta swipe Appwrite priva del thread")

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
                    participantsBackendIds = listOf(currentUserId, profile.id),
                    avatarUrl = profile.photoUrls.firstOrNull()
                )
            )

            SwipeOutcome(matched = true, threadId = threadId)
        }
    }

}

internal data class DiscoveryFunctionPage<T>(
    val profiles: List<T>,
    val nextCursor: String?
)

internal suspend fun <T> firstNonEmptyDiscoveryWindow(
    maximumWindows: Int = 4,
    fetchPage: suspend (profileCursor: String?) -> DiscoveryFunctionPage<T>
): List<T> {
    var profileCursor: String? = null
    val usedCursors = mutableSetOf<String>()

    repeat(maximumWindows.coerceAtLeast(0)) {
        val page = fetchPage(profileCursor)
        if (page.profiles.isNotEmpty()) {
            return page.profiles
        }

        val nextCursor = page.nextCursor
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: return emptyList()
        if (!usedCursors.add(nextCursor)) {
            return emptyList()
        }
        profileCursor = nextCursor
    }

    return emptyList()
}

internal fun tokenizedDiscoveryPhotoUrls(row: JsonObject): List<String> {
    val photos = row.arrayOrEmpty("photos")
        .mapNotNull { element ->
            if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                tokenizedFileViewUrl(element.asString)
            } else {
                null
            }
        }
        .distinct()
    if (photos.isNotEmpty()) return photos

    return listOfNotNull(tokenizedFileViewUrl(row.stringOrNull("imageUrl")))
}

internal fun projectDiscoveryProfile(row: JsonObject): DiscoveryProfile? {
    val id = row.stringOrNull("id") ?: return null
    val name = row.stringOrNull("name") ?: return null
    val commonInterests = row.arrayOrEmpty("commonInterests")
        .mapNotNull { element ->
            if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                element.asString.trim().takeIf { it.isNotBlank() }
            } else {
                null
            }
        }

    return DiscoveryProfile(
        id = id,
        name = name,
        age = (row.intOrNull("age") ?: 18).coerceIn(18, 99),
        isVerified = false,
        city = row.stringOrNull("city").orEmpty(),
        distanceKm = (row.intOrNull("distanceKm") ?: row.intOrNull("distance") ?: 0)
            .coerceAtLeast(0),
        bio = row.stringOrNull("bio").orEmpty(),
        intent = ProfileFieldValues.canonicalIntent(row.stringOrNull("intent")),
        interests = commonInterests,
        instagramTag = row.normalizedOptionalTag("instagramTag"),
        spotifyTag = row.normalizedOptionalTag("spotifyTag"),
        photoUrls = tokenizedDiscoveryPhotoUrls(row),
        compatibilityScore = (row.intOrNull("compatibilityScore") ?: 0).coerceIn(0, 100),
        gender = ProfileFieldValues.canonicalGenderOrNull(row.stringOrNull("gender"))
    )
}

private fun JsonObject.normalizedOptionalTag(field: String): String? {
    return stringOrNull(field)?.trim()?.takeIf { it.isNotEmpty() }
}
