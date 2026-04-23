package com.example.fyre.discover.data

import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteGateway
import com.example.fyre.data.appwrite.arrayOrEmpty
import com.example.fyre.data.appwrite.booleanOrNull
import com.example.fyre.data.appwrite.intOrNull
import com.example.fyre.data.appwrite.stringOrNull
import com.example.fyre.discover.model.DiscoveryProfile
import com.google.gson.JsonObject

class AppwriteDiscoveryRepository(
    private val gateway: AppwriteGateway,
    private val configuration: AppwriteConfiguration
) : DiscoveryRepository {

    override suspend fun loadProfiles(): Result<List<DiscoveryProfile>> {
        return runCatching {
            val functionId = configuration.discoverProfilesFunctionId
            if (!functionId.isNullOrBlank()) {
                val payload = gateway.executeFunction(functionId, emptyMap())
                return@runCatching payload.arrayOrEmpty("profiles")
                    .mapNotNull { element ->
                        if (element.isJsonObject) {
                            mapProfile(element.asJsonObject)
                        } else {
                            null
                        }
                    }
            }

            val currentUserId = gateway.fetchCurrentAccountId(required = false)
            gateway.listRows(configuration.profilesTableId)
                .filter { row -> row.stringOrNull("userId") != currentUserId }
                .mapNotNull(::mapProfile)
        }
    }

    override suspend fun submitDecision(
        profile: DiscoveryProfile,
        liked: Boolean
    ): Result<SwipeOutcome> {
        return runCatching {
            val functionId = configuration.recordSwipeFunctionId
                ?: return@runCatching SwipeOutcome(matched = false, threadId = null)

            val response = gateway.executeFunction(
                functionId = functionId,
                payload = mapOf(
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
                    ?: fetchThreadIdFromCreateOrGet(otherUserId = profile.id)
            }
            SwipeOutcome(
                matched = matched,
                threadId = threadId
            )
        }
    }

    private suspend fun fetchThreadIdFromCreateOrGet(otherUserId: String): String? {
        val functionId = configuration.createOrGetThreadFunctionId
        if (functionId.isBlank()) {
            return null
        }

        return runCatching {
            val payload = gateway.executeFunction(
                functionId = functionId,
                payload = mapOf("otherUserId" to otherUserId)
            )
            payload.stringOrNull("threadId")
        }.getOrNull()
    }

    private fun mapProfile(row: JsonObject): DiscoveryProfile? {
        val id = row.stringOrNull("id")
            ?: row.stringOrNull("userId")
            ?: row.stringOrNull("\$id")
            ?: return null

        val name = row.stringOrNull("name")
            ?: row.stringOrNull("firstName")
            ?: row.stringOrNull("email")?.substringBefore("@")
            ?: "Utente"

        val age = row.intOrNull("age") ?: 18
        val city = row.stringOrNull("city") ?: "Citta sconosciuta"
        val distance = (row.intOrNull("distanceKm") ?: row.intOrNull("distance") ?: 0).coerceAtLeast(0)
        val bio = row.stringOrNull("bio") ?: "Profilo Fyre"
        val intent = row.stringOrNull("intent") ?: "relationship"

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
            row.stringOrNull("instagramTag")?.let { "@$it" },
            row.stringOrNull("spotifyTag")?.let { "@$it" }
        ).ifEmpty { listOf("@fyre") }

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
            socialTags = socialTags
        )
    }
}
