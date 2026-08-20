package minni.fyre.data

import android.content.Context
import minni.fyre.data.appwrite.AppwriteConfiguration
import minni.fyre.data.appwrite.AppwriteConfigurationException
import minni.fyre.data.appwrite.AppwriteGateway
import minni.fyre.data.appwrite.AppwritePrivateMediaStore
import minni.fyre.data.local.LocalRecentChatStore
import minni.fyre.data.model.User
import minni.fyre.data.model.UserProfile
import minni.fyre.data.repository.AppwriteAuthRepository
import minni.fyre.data.repository.AuthRepository
import minni.fyre.discover.data.AppwriteDiscoveryRepository
import minni.fyre.discover.data.DiscoveryRepository
import minni.fyre.discover.data.SwipeOutcome
import minni.fyre.discover.model.DiscoveryProfile
import minni.fyre.events.data.AppwriteEventsRepository
import minni.fyre.events.data.EventsRepository
import minni.fyre.events.model.EventItem
import minni.fyre.events.model.RegistrationStatus
import minni.fyre.messages.data.AppwriteMessagesRepository
import minni.fyre.messages.data.MessagesRepository
import minni.fyre.messages.model.AttachmentType
import minni.fyre.messages.model.ChatMessage
import minni.fyre.messages.model.MessageThread
import minni.fyre.messages.model.RelationshipAction

class AppGraph(
    context: Context
) {
    private val appContext = context.applicationContext
    private val backendUnavailableMessage =
        "Configurazione Appwrite incompleta: l'app Android richiede il database."

    val appwriteConfiguration: AppwriteConfiguration? = AppwriteConfiguration.fromBuildConfig()
    private val appwriteGateway: AppwriteGateway? = appwriteConfiguration
        ?.let { configuration -> AppwriteGateway(appContext, configuration) }
    private val localRecentChatStore = LocalRecentChatStore()
    val privateMediaStore: AppwritePrivateMediaStore? = appwriteGateway
        ?.let { gateway -> AppwritePrivateMediaStore(appContext, gateway) }

    val authRepository: AuthRepository = appwriteGateway
        ?.let { gateway -> AppwriteAuthRepository(gateway, appContext) }
        ?: BackendUnavailableAuthRepository(backendUnavailableMessage)

    val discoveryRepository: DiscoveryRepository = if (
        appwriteConfiguration != null && appwriteGateway != null
    ) {
        AppwriteDiscoveryRepository(
            appwriteGateway,
            appwriteConfiguration,
            localRecentChatStore
        )
    } else {
        BackendUnavailableDiscoveryRepository(backendUnavailableMessage)
    }

    val messagesRepository: MessagesRepository = if (
        appwriteConfiguration != null && appwriteGateway != null
    ) {
        AppwriteMessagesRepository(appwriteGateway, appwriteConfiguration, localRecentChatStore)
    } else {
        BackendUnavailableMessagesRepository(backendUnavailableMessage)
    }

    val eventsRepository: EventsRepository = if (
        appwriteConfiguration != null && appwriteGateway != null
    ) {
        AppwriteEventsRepository(appwriteGateway, appwriteConfiguration)
    } else {
        BackendUnavailableEventsRepository(backendUnavailableMessage)
    }

    val isBackendEnabled: Boolean
        get() = appwriteConfiguration != null
}

object AppGraphProvider {
    @Volatile
    private var instance: AppGraph? = null

    fun get(context: Context): AppGraph {
        return instance ?: synchronized(this) {
            instance ?: AppGraph(context).also { created ->
                instance = created
            }
        }
    }
}

private class BackendUnavailableAuthRepository(
    private val message: String
) : AuthRepository {
    override suspend fun findUserByEmail(email: String): User? = null

    override suspend fun registerUser(
        email: String,
        password: String,
        displayName: String
    ): Result<User> = unavailable()

    override suspend fun authenticateUser(email: String, password: String): Result<User> = unavailable()

    override suspend fun updateUserProfile(email: String, profile: UserProfile): Result<User> = unavailable()

    override suspend fun restoreSession(): Result<User?> = Result.success(null)

    override suspend fun logout(): Result<Unit> = Result.success(Unit)

    private fun <T> unavailable(): Result<T> {
        return Result.failure(AppwriteConfigurationException(message))
    }
}

private class BackendUnavailableDiscoveryRepository(
    private val message: String
) : DiscoveryRepository {
    override suspend fun loadProfiles(): Result<List<DiscoveryProfile>> = unavailable()

    override suspend fun submitDecision(profile: DiscoveryProfile, liked: Boolean): Result<SwipeOutcome> =
        unavailable()

    private fun <T> unavailable(): Result<T> {
        return Result.failure(AppwriteConfigurationException(message))
    }
}

private class BackendUnavailableMessagesRepository(
    private val message: String
) : MessagesRepository {
    override suspend fun getThreads(): Result<List<MessageThread>> = unavailable()

    override suspend fun getMessages(threadId: String): Result<List<ChatMessage>> = unavailable()

    override suspend fun ensureThread(threadId: String): Result<MessageThread> = unavailable()

    override suspend fun sendTextMessage(
        threadId: String,
        text: String,
        replyToMessageId: String?
    ): Result<ChatMessage> = unavailable()

    override suspend fun sendAttachmentMessage(
        threadId: String,
        type: AttachmentType,
        displayName: String,
        localUri: String,
        mimeType: String,
        replyToMessageId: String?
    ): Result<ChatMessage> = unavailable()

    override suspend fun sendVoiceMessage(
        threadId: String,
        localPath: String,
        durationSec: Int,
        replyToMessageId: String?
    ): Result<ChatMessage> = unavailable()

    override suspend fun markAsRead(threadId: String): Result<Unit> = unavailable()

    override suspend fun setThreadNotifications(threadId: String, enabled: Boolean): Result<MessageThread> =
        unavailable()

    override suspend fun markCurrentUserPresence(isOnline: Boolean): Result<Unit> = unavailable()

    override suspend fun updateRelationship(threadId: String, action: RelationshipAction): Result<Unit> =
        unavailable()

    private fun <T> unavailable(): Result<T> {
        return Result.failure(AppwriteConfigurationException(message))
    }
}

private class BackendUnavailableEventsRepository(
    private val message: String
) : EventsRepository {
    override suspend fun getEventsForUser(
        userId: String,
        displayName: String
    ): Result<List<EventItem>> = unavailable()

    override suspend fun joinEvent(eventId: String, userId: String, displayName: String): Result<Unit> =
        unavailable()

    override suspend fun waitlistEvent(eventId: String, userId: String, displayName: String): Result<Unit> =
        unavailable()

    override suspend fun cancelEvent(eventId: String, userId: String): Result<Unit> = unavailable()

    override suspend fun adminUpdateEvent(
        eventId: String,
        title: String,
        dateText: String,
        place: String,
        description: String,
        deadlineText: String,
        capacity: Int,
        rules: List<String>,
        maleLimit: Int,
        femaleLimit: Int,
        cancellationDeadlineText: String
    ): Result<Unit> = unavailable()

    override suspend fun adminSetParticipantStatus(
        eventId: String,
        participantId: String,
        registrationId: String?,
        status: RegistrationStatus
    ): Result<Unit> = unavailable()
    private fun <T> unavailable(): Result<T> {
        return Result.failure(AppwriteConfigurationException(message))
    }
}
