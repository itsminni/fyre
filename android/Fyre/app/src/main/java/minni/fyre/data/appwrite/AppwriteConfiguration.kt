package minni.fyre.data.appwrite

import minni.fyre.BuildConfig
import java.net.URI

data class AppwriteConfiguration(
    val endpoint: String,
    val projectId: String,
    val databaseId: String,
    val profilesTableId: String,
    val avatarsBucketId: String,
    val chatAttachmentsBucketId: String?,
    val eventsTableId: String,
    val eventRegistrationsTableId: String,
    val threadsTableId: String,
    val threadParticipantsTableId: String,
    val messagesTableId: String,
    val swipesTableId: String?,
    val matchesTableId: String?,
    val relationshipsTableId: String?,
    val registerForEventFunctionId: String,
    val cancelEventRegistrationFunctionId: String,
    val manageProfileFunctionId: String,
    val eventAdminFunctionId: String?,
    val createOrGetThreadFunctionId: String,
    val sendMessageFunctionId: String,
    val recordSwipeFunctionId: String?,
    val discoverProfilesFunctionId: String?,
    val manageRelationshipFunctionId: String?,
    val createOrGetThreadFunctionDomain: String?,
    val sendMessageFunctionDomain: String?,
    val recordSwipeFunctionDomain: String?,
    val discoverProfilesFunctionDomain: String?,
    val eventAdminFunctionDomain: String?
) {
    companion object {
        internal fun loadOrNull(
            loader: () -> AppwriteConfiguration? = { fromBuildConfig() }
        ): AppwriteConfiguration? = try {
            loader()
        } catch (_: AppwriteConfigurationException) {
            null
        }

        fun fromBuildConfig(): AppwriteConfiguration? {
            if (!BuildConfig.APPWRITE_BACKEND_ENABLED) {
                return null
            }

            val endpoint = normalize(BuildConfig.APPWRITE_ENDPOINT)
            val projectId = normalize(BuildConfig.APPWRITE_PROJECT_ID)
            val databaseId = normalize(BuildConfig.APPWRITE_DATABASE_ID)
            val profilesTableId = normalize(BuildConfig.APPWRITE_PROFILES_TABLE_ID)
            val avatarsBucketId = normalize(BuildConfig.APPWRITE_AVATARS_BUCKET_ID)
            val eventsTableId = normalize(BuildConfig.APPWRITE_EVENTS_TABLE_ID)
            val eventRegistrationsTableId = normalize(BuildConfig.APPWRITE_EVENT_REGISTRATIONS_TABLE_ID)
            val threadsTableId = normalize(BuildConfig.APPWRITE_THREADS_TABLE_ID)
            val threadParticipantsTableId = normalize(BuildConfig.APPWRITE_THREAD_PARTICIPANTS_TABLE_ID)
            val messagesTableId = normalize(BuildConfig.APPWRITE_MESSAGES_TABLE_ID)
            val swipesTableId = normalize(BuildConfig.APPWRITE_SWIPES_TABLE_ID)
            val matchesTableId = normalize(BuildConfig.APPWRITE_MATCHES_TABLE_ID)
            val relationshipsTableId = normalize(BuildConfig.APPWRITE_RELATIONSHIPS_TABLE_ID)
            val registerForEventFunctionId = normalize(BuildConfig.APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID)
            val cancelEventRegistrationFunctionId = normalize(BuildConfig.APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID)
            val manageProfileFunctionId = normalize(BuildConfig.APPWRITE_MANAGE_PROFILE_FUNCTION_ID)
            val createOrGetThreadFunctionId = normalize(BuildConfig.APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID)
            val sendMessageFunctionId = normalize(BuildConfig.APPWRITE_SEND_MESSAGE_FUNCTION_ID)
            val recordSwipeFunctionId = normalize(BuildConfig.APPWRITE_RECORD_SWIPE_FUNCTION_ID)
            val discoverProfilesFunctionId = normalize(BuildConfig.APPWRITE_DISCOVER_PROFILES_FUNCTION_ID)
            val manageRelationshipFunctionId = normalize(BuildConfig.APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID)

            val required = linkedMapOf(
                "APPWRITE_ENDPOINT" to endpoint,
                "APPWRITE_PROJECT_ID" to projectId,
                "APPWRITE_DATABASE_ID" to databaseId,
                "APPWRITE_PROFILES_TABLE_ID" to profilesTableId,
                "APPWRITE_AVATARS_BUCKET_ID" to avatarsBucketId,
                "APPWRITE_EVENTS_TABLE_ID" to eventsTableId,
                "APPWRITE_EVENT_REGISTRATIONS_TABLE_ID" to eventRegistrationsTableId,
                "APPWRITE_THREADS_TABLE_ID" to threadsTableId,
                "APPWRITE_THREAD_PARTICIPANTS_TABLE_ID" to threadParticipantsTableId,
                "APPWRITE_MESSAGES_TABLE_ID" to messagesTableId,
                "APPWRITE_SWIPES_TABLE_ID" to swipesTableId,
                "APPWRITE_MATCHES_TABLE_ID" to matchesTableId,
                "APPWRITE_RELATIONSHIPS_TABLE_ID" to relationshipsTableId,
                "APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID" to registerForEventFunctionId,
                "APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID" to cancelEventRegistrationFunctionId,
                "APPWRITE_MANAGE_PROFILE_FUNCTION_ID" to manageProfileFunctionId,
                "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID" to createOrGetThreadFunctionId,
                "APPWRITE_SEND_MESSAGE_FUNCTION_ID" to sendMessageFunctionId,
                "APPWRITE_RECORD_SWIPE_FUNCTION_ID" to recordSwipeFunctionId,
                "APPWRITE_DISCOVER_PROFILES_FUNCTION_ID" to discoverProfilesFunctionId,
                "APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID" to manageRelationshipFunctionId
            )

            val missingKeys = required.filterValues { it.isNullOrBlank() }.keys
            if (missingKeys.isNotEmpty()) {
                throw AppwriteConfigurationException(
                    "Configurazione Appwrite incompleta. Valori mancanti o placeholder: " +
                        missingKeys.joinToString(", ")
                )
            }

            if (!isSecureEndpoint(endpoint.orEmpty())) {
                throw AppwriteConfigurationException(
                    "APPWRITE_ENDPOINT deve usare HTTPS; HTTP è consentito solo per localhost o un IP di loopback"
                )
            }

            return AppwriteConfiguration(
                endpoint = endpoint.orEmpty(),
                projectId = projectId.orEmpty(),
                databaseId = databaseId.orEmpty(),
                profilesTableId = profilesTableId.orEmpty(),
                avatarsBucketId = avatarsBucketId.orEmpty(),
                chatAttachmentsBucketId = normalize(BuildConfig.APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID),
                eventsTableId = eventsTableId.orEmpty(),
                eventRegistrationsTableId = eventRegistrationsTableId.orEmpty(),
                threadsTableId = threadsTableId.orEmpty(),
                threadParticipantsTableId = threadParticipantsTableId.orEmpty(),
                messagesTableId = messagesTableId.orEmpty(),
                swipesTableId = swipesTableId,
                matchesTableId = matchesTableId,
                relationshipsTableId = relationshipsTableId,
                registerForEventFunctionId = registerForEventFunctionId.orEmpty(),
                cancelEventRegistrationFunctionId = cancelEventRegistrationFunctionId.orEmpty(),
                manageProfileFunctionId = manageProfileFunctionId.orEmpty(),
                eventAdminFunctionId = normalize(BuildConfig.APPWRITE_EVENT_ADMIN_FUNCTION_ID),
                createOrGetThreadFunctionId = createOrGetThreadFunctionId.orEmpty(),
                sendMessageFunctionId = sendMessageFunctionId.orEmpty(),
                recordSwipeFunctionId = recordSwipeFunctionId,
                discoverProfilesFunctionId = discoverProfilesFunctionId,
                manageRelationshipFunctionId = manageRelationshipFunctionId,
                createOrGetThreadFunctionDomain = secureOptionalUrl(
                    "APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN",
                    BuildConfig.APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN
                ),
                sendMessageFunctionDomain = secureOptionalUrl(
                    "APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN",
                    BuildConfig.APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN
                ),
                recordSwipeFunctionDomain = secureOptionalUrl(
                    "APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN",
                    BuildConfig.APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN
                ),
                discoverProfilesFunctionDomain = secureOptionalUrl(
                    "APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN",
                    BuildConfig.APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN
                ),
                eventAdminFunctionDomain = secureOptionalUrl(
                    "APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN",
                    BuildConfig.APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN
                )
            )
        }

        private fun normalize(value: String?): String? {
            if (value == null) {
                return null
            }
            val trimmed = value.trim()
            val isPlaceholder = trimmed.startsWith("<") && trimmed.endsWith(">")
            return if (trimmed.isEmpty() || isPlaceholder) null else trimmed
        }

        private fun secureOptionalUrl(name: String, value: String?): String? {
            val configured = normalize(value) ?: return null
            val normalized = if (configured.contains("://")) configured else "https://$configured"
            if (!isSecureEndpoint(normalized)) {
                throw AppwriteConfigurationException(
                    "$name deve usare HTTPS; HTTP è consentito solo per localhost o un IP di loopback"
                )
            }
            return normalized
        }

        internal fun isSecureEndpoint(value: String): Boolean {
            return runCatching {
                val uri = URI(value)
                val host = uri.host
                    ?.removePrefix("[")
                    ?.removeSuffix("]")
                    ?.lowercase()
                val isHttps = uri.scheme.equals("https", ignoreCase = true)
                val isLoopbackHttp = uri.scheme.equals("http", ignoreCase = true) && isLoopbackHost(host)
                uri.isAbsolute &&
                    !host.isNullOrBlank() &&
                    uri.rawUserInfo == null &&
                    uri.rawQuery == null &&
                    uri.rawFragment == null &&
                    (isHttps || isLoopbackHttp)
            }.getOrDefault(false)
        }

        private fun isLoopbackHost(host: String?): Boolean {
            if (host == null) return false
            if (host == "localhost" || host == "::1") return true

            val octets = host.split('.')
            return octets.size == 4 &&
                octets.first() == "127" &&
                octets.all { octet ->
                    octet.isNotEmpty() && octet.length <= 3 &&
                        octet.all(Char::isDigit) && (octet.toIntOrNull() ?: 256) <= 255
                }
        }
    }
}
