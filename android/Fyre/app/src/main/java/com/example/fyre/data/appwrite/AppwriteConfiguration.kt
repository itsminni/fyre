package com.example.fyre.data.appwrite

import com.example.fyre.BuildConfig

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
            val registerForEventFunctionId = normalize(BuildConfig.APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID)
            val cancelEventRegistrationFunctionId = normalize(BuildConfig.APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID)
            val createOrGetThreadFunctionId = normalize(BuildConfig.APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID)
            val sendMessageFunctionId = normalize(BuildConfig.APPWRITE_SEND_MESSAGE_FUNCTION_ID)

            val required = listOf(
                endpoint,
                projectId,
                databaseId,
                profilesTableId,
                avatarsBucketId,
                eventsTableId,
                eventRegistrationsTableId,
                threadsTableId,
                threadParticipantsTableId,
                messagesTableId,
                registerForEventFunctionId,
                cancelEventRegistrationFunctionId,
                createOrGetThreadFunctionId,
                sendMessageFunctionId
            )

            if (required.any { it.isNullOrBlank() }) {
                return null
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
                swipesTableId = normalize(BuildConfig.APPWRITE_SWIPES_TABLE_ID),
                matchesTableId = normalize(BuildConfig.APPWRITE_MATCHES_TABLE_ID),
                relationshipsTableId = normalize(BuildConfig.APPWRITE_RELATIONSHIPS_TABLE_ID),
                registerForEventFunctionId = registerForEventFunctionId.orEmpty(),
                cancelEventRegistrationFunctionId = cancelEventRegistrationFunctionId.orEmpty(),
                eventAdminFunctionId = normalize(BuildConfig.APPWRITE_EVENT_ADMIN_FUNCTION_ID),
                createOrGetThreadFunctionId = createOrGetThreadFunctionId.orEmpty(),
                sendMessageFunctionId = sendMessageFunctionId.orEmpty(),
                recordSwipeFunctionId = normalize(BuildConfig.APPWRITE_RECORD_SWIPE_FUNCTION_ID),
                discoverProfilesFunctionId = normalize(BuildConfig.APPWRITE_DISCOVER_PROFILES_FUNCTION_ID),
                manageRelationshipFunctionId = normalize(BuildConfig.APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID),
                createOrGetThreadFunctionDomain = normalize(BuildConfig.APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN),
                sendMessageFunctionDomain = normalize(BuildConfig.APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN),
                recordSwipeFunctionDomain = normalize(BuildConfig.APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN),
                discoverProfilesFunctionDomain = normalize(BuildConfig.APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN),
                eventAdminFunctionDomain = normalize(BuildConfig.APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN)
            )
        }

        private fun normalize(value: String?): String? {
            if (value == null) {
                return null
            }
            val trimmed = value.trim()
            return if (trimmed.isEmpty()) null else trimmed
        }
    }
}