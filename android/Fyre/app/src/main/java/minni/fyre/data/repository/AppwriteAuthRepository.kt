package minni.fyre.data.repository

import android.content.Context
import android.location.Address
import android.location.Geocoder
import minni.fyre.core.notifications.RealtimeNotificationSeenStore
import minni.fyre.data.appwrite.AppwriteApiException
import minni.fyre.data.appwrite.AppwriteConfiguration
import minni.fyre.data.appwrite.AppwriteConfigurationException
import minni.fyre.data.appwrite.AppwriteGateway
import minni.fyre.data.appwrite.AppwritePrivateMediaStore
import minni.fyre.data.appwrite.ManageProfilePayload
import minni.fyre.data.appwrite.asDoubleOrNull
import minni.fyre.data.appwrite.arrayOrEmpty
import minni.fyre.data.appwrite.booleanOrNull
import minni.fyre.data.appwrite.intOrNull
import minni.fyre.data.appwrite.stringOrNull
import minni.fyre.data.local.LocalRecentChatStore
import minni.fyre.data.model.ProfileFieldValues
import minni.fyre.data.model.User
import minni.fyre.data.model.UserProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.Locale
import coil.annotation.ExperimentalCoilApi
import coil.imageLoader

@OptIn(ExperimentalCoilApi::class)
class AppwriteAuthRepository(
    private val gateway: AppwriteGateway,
    private val context: Context? = null
) : AuthRepository {

    private val localRecentChatStore = context?.let { LocalRecentChatStore() }
    private val notificationSeenStore = context?.let { RealtimeNotificationSeenStore() }
    private val appContext = context?.applicationContext

    constructor(
        context: Context,
        configuration: AppwriteConfiguration
    ) : this(AppwriteGateway(context, configuration), context.applicationContext)

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
        displayName: String
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

            hydrateUser(account)
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
            val preferredGenders = ProfileFieldValues.canonicalPreferredGenders(profile.preferredGenders)
            require(preferredGenders.isNotEmpty()) {
                "Seleziona almeno una preferenza di genere"
            }
            val gender = ProfileFieldValues.canonicalGenderOrNull(profile.gender)
                ?: throw IllegalArgumentException("Seleziona un genere valido")
            val orientation = ProfileFieldValues.canonicalOrientationOrNull(profile.orientation)
                ?: throw IllegalArgumentException("Seleziona un orientamento valido")
            val (minPreferredAge, maxPreferredAge) = ProfileFieldValues.preferredAgeRange(
                profile.minPreferredAge,
                profile.maxPreferredAge
            )
            val maxDistanceKm = ProfileFieldValues.maxDistanceKm(profile.maxDistanceKm)
            val intent = ProfileFieldValues.canonicalIntent(profile.intent)

            val account = gateway.fetchCurrentAccount(required = true)
                ?: throw AppwriteConfigurationException("Sessione backend non valida")
            val accountId = account.stringOrNull("\$id")
                ?: throw AppwriteConfigurationException("Missing account id")

            val existingProfile = gateway.fetchProfileRow(accountId)
            val existingAvatarFileId = existingProfile?.stringOrNull("avatarFileId")
            val existingPhotoFileIds = existingProfile?.arrayOrEmpty("photoFileIds")
                ?.mapNotNull { element ->
                    if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                        element.asString
                    } else {
                        null
                    }
                }
                ?.filter { it.isNotBlank() }
                .orEmpty()
            val existingCity = existingProfile?.stringOrNull("city").orEmpty().trim()
            val existingLatitude = existingProfile?.get("latitude")?.asDoubleOrNull()
            val existingLongitude = existingProfile?.get("longitude")?.asDoubleOrNull()
            val resolvedLocation = resolveCityLocation(
                city = profile.city,
                existingCity = existingCity,
                existingLatitude = existingLatitude,
                existingLongitude = existingLongitude
            ) ?: throw IllegalStateException("Non riesco a trovare questa città")

            val uploadedAvatarFileId = if (!profile.avatarUri.isNullOrBlank() && !isRemoteUri(profile.avatarUri)) {
                gateway.uploadAvatarFromUri(profile.avatarUri)
            } else {
                null
            }

            val avatarFileId = uploadedAvatarFileId
                ?: profile.avatarUri?.takeIf(::isRemoteUri)?.let(gateway::storageFileIdFromUrl)
                ?: existingAvatarFileId
            val profilePhotoFileIds = resolveProfilePhotoFileIds(profile, existingPhotoFileIds)
            val payload = ManageProfilePayload.upsert(
                linkedMapOf(
                    "firstName" to profile.firstName.trim(),
                    "lastName" to profile.lastName.trim(),
                    "city" to resolvedLocation.displayName,
                    "birthDate" to gateway.normalizeBirthDate(profile.birthDate),
                    "bio" to profile.bio.trim(),
                    "gender" to gender,
                    "orientation" to orientation,
                    "preferredGenders" to preferredGenders,
                    "minPreferredAge" to minPreferredAge,
                    "maxPreferredAge" to maxPreferredAge,
                    "maxDistanceKm" to maxDistanceKm,
                    "latitude" to resolvedLocation.latitude,
                    "longitude" to resolvedLocation.longitude,
                    "smokes" to profile.smokes,
                    "drinks" to profile.drinks,
                    "excludeSmokers" to profile.excludeSmokers,
                    "excludeDrinkers" to profile.excludeDrinkers,
                    "intent" to intent,
                    "interests" to profile.interests.trim(),
                    "instagramTag" to normalizedSocialTag(profile.instagramTag),
                    "spotifyTag" to normalizedSocialTag(profile.spotifyTag),
                    "avatarFileId" to avatarFileId,
                    "photoFileIds" to profilePhotoFileIds
                )
            )

            gateway.executeFunction(
                functionId = gateway.configuration.manageProfileFunctionId,
                payload = payload
            )

            val refreshedAccount = gateway.fetchCurrentAccount(required = true)
                ?: throw AppwriteConfigurationException("Account backend non disponibile")
            hydrateUser(refreshedAccount)
        }
    }

    override suspend fun restoreSession(): Result<User?> {
        return runCatching {
            val account = gateway.fetchCurrentAccount(required = false) ?: return@runCatching null
            hydrateUser(account)
        }
    }

    override suspend fun logout(): Result<Unit> {
        return withContext(Dispatchers.IO) {
            performLogoutWithLocalCleanup(
                remoteLogout = gateway::deleteCurrentSession,
                clearHttpSession = gateway::clearSession,
                clearLocalData = {
                    val chatsCleared = localRecentChatStore?.clearAll() != false
                    val notificationsCleared = notificationSeenStore?.clearAll() != false
                    val mediaFilesCleared = appContext?.let(AppwritePrivateMediaStore::clearCache) != false
                    appContext?.imageLoader?.memoryCache?.clear()
                    appContext?.imageLoader?.diskCache?.clear()
                    check(chatsCleared && notificationsCleared && mediaFilesCleared) {
                        "Impossibile cancellare tutti i dati locali di sessione"
                    }
                }
            )
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
            val preferredGenders = ProfileFieldValues.canonicalPreferredGenders(
                it.arrayOrEmpty("preferredGenders").mapNotNull { element ->
                    if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                        element.asString
                    } else {
                        null
                    }
                }
            )
            val (minPreferredAge, maxPreferredAge) = ProfileFieldValues.preferredAgeRange(
                it.intOrNull("minPreferredAge") ?: 18,
                it.intOrNull("maxPreferredAge") ?: 35
            )
            UserProfile(
                firstName = firstName,
                lastName = lastName,
                city = it.stringOrNull("city").orEmpty(),
                birthDate = it.stringOrNull("birthDate").orEmpty(),
                bio = it.stringOrNull("bio").orEmpty(),
                avatarUri = gateway.avatarUrl(avatarFileId),
                gender = ProfileFieldValues.canonicalGenderOrNull(it.stringOrNull("gender")).orEmpty(),
                orientation = ProfileFieldValues.canonicalOrientationOrNull(
                    it.stringOrNull("orientation")
                ).orEmpty(),
                preferredGenders = preferredGenders,
                minPreferredAge = minPreferredAge,
                maxPreferredAge = maxPreferredAge,
                maxDistanceKm = ProfileFieldValues.maxDistanceKm(it.intOrNull("maxDistanceKm")),
                latitude = it["latitude"]?.asDoubleOrNull(),
                longitude = it["longitude"]?.asDoubleOrNull(),
                smokes = it.booleanOrNull("smokes") ?: false,
                drinks = it.booleanOrNull("drinks") ?: false,
                excludeSmokers = it.booleanOrNull("excludeSmokers") ?: false,
                excludeDrinkers = it.booleanOrNull("excludeDrinkers") ?: false,
                intent = ProfileFieldValues.canonicalIntent(it.stringOrNull("intent")),
                interests = it.stringOrNull("interests").orEmpty(),
                instagramTag = it.stringOrNull("instagramTag"),
                spotifyTag = it.stringOrNull("spotifyTag"),
                profilePhotoUris = photoFileIds.mapNotNull(gateway::avatarUrl)
            )
        }

        User(
            email = email,
            displayName = displayName,
            profile = userProfile,
            appwriteUserId = accountId,
            avatarFileId = avatarFileId,
            photoFileIds = photoFileIds
        )
    }

    private suspend fun resolveProfilePhotoFileIds(
        profile: UserProfile,
        existingPhotoFileIds: List<String>
    ): List<String> {
        if (profile.profilePhotoUris.isEmpty()) {
            return existingPhotoFileIds.take(MaxProfilePhotoCount)
        }

        return profile.profilePhotoUris
            .take(MaxProfilePhotoCount)
            .mapNotNull { uri ->
                if (isRemoteUri(uri)) {
                    gateway.storageFileIdFromUrl(uri)
                        ?: existingPhotoFileIds.firstOrNull { existingFileId -> gateway.avatarUrl(existingFileId) == uri }
                } else {
                    gateway.uploadProfilePhotoFromUri(uri)
                }
            }
    }

    private fun isRemoteUri(value: String): Boolean {
        return value.startsWith("http://") || value.startsWith("https://")
    }

    private suspend fun resolveCityLocation(
        city: String,
        existingCity: String,
        existingLatitude: Double?,
        existingLongitude: Double?
    ): ResolvedCityLocation? {
        val normalizedCity = city.trim()
        if (normalizedCity.isBlank()) {
            return null
        }

        if (existingCity.isNotBlank() &&
            existingLatitude != null &&
            existingLongitude != null &&
            existingCity.equals(normalizedCity, ignoreCase = true)
        ) {
            return ResolvedCityLocation(existingCity, existingLatitude, existingLongitude)
        }

        val appContext = context ?: return null
        return withContext(Dispatchers.IO) {
            val geocoder = Geocoder(appContext, Locale.getDefault())
            try {
                @Suppress("DEPRECATION")
                val results = geocoder.getFromLocationName(normalizedCity, 1)
                val address = results?.firstOrNull() ?: return@withContext null
                ResolvedCityLocation(
                    displayName = normalizedCityFromAddress(address, normalizedCity),
                    latitude = address.latitude,
                    longitude = address.longitude
                )
            } catch (_: IOException) {
                null
            }
        }
    }

    private fun normalizedCityFromAddress(address: Address, fallback: String): String {
        val parts = listOf(
            address.locality,
            address.subAdminArea,
            address.adminArea,
            address.countryName
        )
            .mapNotNull { it?.trim() }
            .filter { it.isNotEmpty() }

        return parts.firstOrNull() ?: fallback.trim()
    }

    private fun normalizedSocialTag(value: String?): String? {
        val trimmed = value?.trim().orEmpty()
        if (trimmed.isBlank()) return null

        val withoutAtPrefix = trimmed.dropWhile { it == '@' }
        val withoutWhitespace = withoutAtPrefix.replace(Regex("\\s+"), "")
        val withoutAt = withoutWhitespace.replace("@", "")
        return withoutAt.take(64).takeIf { it.isNotBlank() }
    }

    private companion object {
        private const val MaxProfilePhotoCount = 6
    }
}

private data class ResolvedCityLocation(
    val displayName: String,
    val latitude: Double,
    val longitude: Double
)
