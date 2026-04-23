package com.example.fyre.data.repository

import android.content.Context
import com.example.fyre.data.appwrite.AppwriteApiException
import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteConfigurationException
import com.example.fyre.data.appwrite.AppwriteGateway
import com.example.fyre.data.appwrite.asDoubleOrNull
import com.example.fyre.data.appwrite.arrayOrEmpty
import com.example.fyre.data.appwrite.intOrNull
import com.example.fyre.data.appwrite.stringOrNull
import com.example.fyre.data.model.User
import com.example.fyre.data.model.UserProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AppwriteAuthRepository(
    context: Context,
    configuration: AppwriteConfiguration
) : AuthRepository {

    private val gateway = AppwriteGateway(context, configuration)

    override suspend fun findUserByEmail(email: String): User? {
        val account = gateway.fetchCurrentAccount(required = false) ?: return null
        val accountEmail = account.stringOrNull("email")?.trim()?.lowercase() ?: return null
        if (accountEmail != email.trim().lowercase()) {
            return null
        }
        return hydrateUser(account)
    }

    override suspend fun registerUser(
        email: String,
        password: String,
        displayName: String,
        termsAcceptedAt: Long?,
        privacyAcceptedAt: Long?
    ): Result<User> {
        return runCatching {
            val normalizedEmail = email.trim().lowercase()

            try {
                gateway.createAccount(
                    email = normalizedEmail,
                    password = password,
                    displayName = displayName.trim()
                )
            } catch (api: AppwriteApiException) {
                if (api.statusCode != 409) {
                    throw api
                }
            }

            gateway.createEmailSession(normalizedEmail, password)
            val account = gateway.fetchCurrentAccount(required = true)
                ?: throw AppwriteConfigurationException("Account backend non disponibile")

            val user = hydrateUser(account)
            user.copy(
                termsAcceptedAt = user.termsAcceptedAt ?: termsAcceptedAt,
                privacyAcceptedAt = user.privacyAcceptedAt ?: privacyAcceptedAt
            )
        }
    }

    override suspend fun authenticateUser(email: String, password: String): Result<User> {
        return runCatching {
            gateway.createEmailSession(email.trim().lowercase(), password)
            val account = gateway.fetchCurrentAccount(required = true)
                ?: throw AppwriteConfigurationException("Account backend non disponibile")
            hydrateUser(account)
        }
    }

    override suspend fun updateUserProfile(email: String, profile: UserProfile): Result<User> {
        return runCatching {
            val account = gateway.fetchCurrentAccount(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non valida")
            val accountId = account.stringOrNull("\$id")
                ?: throw AppwriteConfigurationException("Missing account id")

            val normalizedEmail = account.stringOrNull("email")?.trim()?.lowercase()
                ?: email.trim().lowercase()

            val existingProfile = gateway.fetchProfileRow(accountId)
            val existingAvatarFileId = existingProfile?.stringOrNull("avatarFileId")
            val uploadedAvatarFileId = if (!profile.avatarUri.isNullOrBlank() &&
                !profile.avatarUri.startsWith("http://") &&
                !profile.avatarUri.startsWith("https://")
            ) {
                gateway.uploadAvatarFromUri(profile.avatarUri)
            } else {
                null
            }

            val avatarFileId = uploadedAvatarFileId ?: existingAvatarFileId
            val payload = com.google.gson.JsonObject().apply {
                addProperty("userId", accountId)
                addProperty("email", normalizedEmail)
                addProperty("firstName", profile.firstName.trim())
                addProperty("lastName", profile.lastName.trim())
                addProperty("username", profile.username.trim())
                addProperty("city", profile.city.trim())
                addProperty("birthDate", gateway.normalizeBirthDate(profile.birthDate))
                addProperty("bio", profile.bio.trim())
                addProperty("gender", profile.gender.ifBlank { "male" })
                addProperty("orientation", profile.orientation.ifBlank { "straight" })
                add("preferredGenders", com.example.fyre.data.appwrite.toJsonArray(profile.preferredGenders))
                addProperty("minPreferredAge", profile.minPreferredAge.coerceAtLeast(18))
                addProperty("maxPreferredAge", profile.maxPreferredAge.coerceAtLeast(profile.minPreferredAge + 1))
                addProperty("maxDistanceKm", profile.maxDistanceKm.coerceAtLeast(5))
                addProperty("latitude", profile.latitude)
                addProperty("longitude", profile.longitude)
                addProperty("interests", profile.interests.trim())
                addProperty("instagramTag", profile.instagramTag?.trim())
                addProperty("spotifyTag", profile.spotifyTag?.trim())
                addProperty("avatarFileId", avatarFileId)
                add("photoFileIds", com.example.fyre.data.appwrite.toJsonArray(listOfNotNull(avatarFileId)))
                addProperty("profileReady", profile.isComplete())
                addProperty("presenceUpdatedAt", gateway.nowIso())
                addProperty("lastSeenAt", gateway.nowIso())
            }

            if (existingProfile == null) {
                gateway.createRow(
                    tableId = gateway.configuration.profilesTableId,
                    rowId = accountId,
                    data = payload
                )
            } else {
                val rowId = existingProfile.stringOrNull("\$id") ?: accountId
                gateway.updateRow(
                    tableId = gateway.configuration.profilesTableId,
                    rowId = rowId,
                    data = payload
                )
            }

            val refreshedAccount = gateway.fetchCurrentAccount(required = true)
                ?: throw AppwriteConfigurationException("Account backend non disponibile")
            hydrateUser(refreshedAccount)
        }
    }

    override suspend fun restoreSession(savedEmail: String?): Result<User?> {
        return runCatching {
            val account = gateway.fetchCurrentAccount(required = false) ?: return@runCatching null
            val hydrated = hydrateUser(account)

            if (!savedEmail.isNullOrBlank() &&
                hydrated.email.trim().lowercase() != savedEmail.trim().lowercase()
            ) {
                null
            } else {
                hydrated
            }
        }
    }

    override suspend fun logout(): Result<Unit> {
        return runCatching {
            gateway.deleteCurrentSession()
        }
    }

    private suspend fun hydrateUser(account: com.google.gson.JsonObject): User = withContext(Dispatchers.Default) {
        val accountId = account.stringOrNull("\$id").orEmpty()
        val email = account.stringOrNull("email").orEmpty()
        val profileRow = gateway.fetchProfileRow(accountId)

        val firstName = profileRow?.stringOrNull("firstName").orEmpty()
        val lastName = profileRow?.stringOrNull("lastName").orEmpty()
        val fullName = listOf(firstName, lastName)
            .filter { it.isNotBlank() }
            .joinToString(" ")

        val displayName = fullName.ifBlank {
            email.substringBefore("@").ifBlank { "Utente" }
        }

        val avatarFileId = profileRow?.stringOrNull("avatarFileId")
        val photoFileIds = profileRow?.arrayOrEmpty("photoFileIds")
            ?.mapNotNull { element ->
                if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                    element.asString
                } else {
                    null
                }
            }
            ?.filter { it.isNotBlank() }
            ?: listOfNotNull(avatarFileId)

        val userProfile = profileRow?.let {
            UserProfile(
                firstName = firstName,
                lastName = lastName,
                username = it.stringOrNull("username")
                    ?: displayName.lowercase().replace(" ", ""),
                city = it.stringOrNull("city").orEmpty(),
                birthDate = it.stringOrNull("birthDate").orEmpty(),
                bio = it.stringOrNull("bio").orEmpty(),
                avatarUri = gateway.avatarUrl(avatarFileId),
                gender = it.stringOrNull("gender") ?: "male",
                orientation = it.stringOrNull("orientation") ?: "straight",
                preferredGenders = it.arrayOrEmpty("preferredGenders")
                    .mapNotNull { element ->
                        if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                            element.asString
                        } else {
                            null
                        }
                    }
                    .ifEmpty { listOf("male", "female", "nonbinary", "other") },
                minPreferredAge = it.intOrNull("minPreferredAge") ?: 18,
                maxPreferredAge = it.intOrNull("maxPreferredAge") ?: 35,
                maxDistanceKm = it.intOrNull("maxDistanceKm") ?: 50,
                latitude = it["latitude"]?.asDoubleOrNull() ?: 44.6979,
                longitude = it["longitude"]?.asDoubleOrNull() ?: 10.6313,
                interests = it.stringOrNull("interests").orEmpty(),
                instagramTag = it.stringOrNull("instagramTag"),
                spotifyTag = it.stringOrNull("spotifyTag")
            )
        }

        User(
            email = email,
            passwordHash = "backend",
            displayName = displayName,
            profile = userProfile,
            appwriteUserId = accountId,
            avatarFileId = avatarFileId,
            photoFileIds = photoFileIds
        )
    }
}
