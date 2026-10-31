package minni.fyre.data.demo

import minni.fyre.data.model.*
import minni.fyre.data.repository.AuthRepository
import minni.fyre.discover.data.*
import minni.fyre.discover.model.DiscoveryProfile
import minni.fyre.events.data.EventsRepository
import minni.fyre.events.model.*
import minni.fyre.messages.data.*
import minni.fyre.messages.model.*
import java.time.Instant
import java.time.temporal.ChronoUnit

/** Fictional, process-local data. No SDK, credentials, transport or server fallback. */
class OfflineDemo {
    private var user = User("demo@example.invalid", "Alex Demo", appwriteUserId = ACCOUNT_ID,
        profile = UserProfile(firstName = "Alex", lastName = "Demo", city = "Modena",
            birthDate = "01/01/2000", bio = "Profilo dimostrativo: cinema, musica e nuove amicizie.",
            intent = ProfileFieldValues.IntentFriendship,
            preferredGenders = ProfileFieldValues.SupportedGenders, interests = "Cinema, Musica, Viaggi"))
    private var signedIn = true
    private val now = System.currentTimeMillis()
    private val profiles = listOf(
        DiscoveryProfile("demo-sam", "Sam", 25, false, "Modena", 3,
            "Concerti, fotografia e passeggiate. Profilo fittizio della demo.", "friendship", listOf("Musica", "Fotografia")),
        DiscoveryProfile("demo-jules", "Jules", 27, false, "Bologna", 35,
            "Cinema e gite fuori porta. Profilo fittizio della demo.", "friendship", listOf("Cinema", "Viaggi")),
        DiscoveryProfile("demo-robin", "Robin", 24, false, "Reggio Emilia", 22,
            "Un libro e un buon caffè. Profilo fittizio della demo.", "relationship", listOf("Libri", "Caffè"))
    )
    private val swiped = mutableSetOf<String>()
    private val threads = linkedMapOf<String, MessageThread>()
    private val messages = mutableMapOf<String, MutableList<ChatMessage>>()
    private val committedSends = mutableMapOf<String, ChatMessage>()
    private val events = linkedMapOf<String, EventItem>()

    init {
        addThread("demo-chat", "Taylor")
        messages.getValue("demo-chat").addAll((1..120).map { index ->
            ChatMessage("demo-history-$index", "demo-chat", if (index % 3 == 0) MessageAuthor.Me else MessageAuthor.Other,
                if (index == 120) "Benvenuto nella demo! Puoi scrivere qui senza configurare Appwrite."
                else "Messaggio dimostrativo $index", now - (121 - index) * 60_000L, true,
                backendMessageId = "demo-history-$index", syncStatus = MessageSyncStatus.Synced)
        })
        threads["demo-chat"] = threads.getValue("demo-chat").copy(lastMessage = messages.getValue("demo-chat").last().text, unreadCount = 1)
        for ((index, title) in listOf("Aperitivo Fyre · Demo", "Cinema insieme · Demo").withIndex()) {
            val start = Instant.now().plus((index + 3).toLong(), ChronoUnit.DAYS)
            val id = "demo-event-$index"
            events[id] = EventItem(id, title, start.atZone(java.time.ZoneId.systemDefault()).format(
                java.time.format.DateTimeFormatter.ofLocalizedDateTime(java.time.format.FormatStyle.MEDIUM)),
                "Modena · luogo dimostrativo", "Evento fittizio. Le iscrizioni rimangono soltanto in questa demo.",
                listOf("Rispetta gli altri partecipanti", "Dati dimostrativi"), RegistrationStatus.NotRegistered,
                EventUserState.NotRegistered, EventUserRole.Admin, 24, 8, maleCount = 4, femaleCount = 4,
                participants = listOf("Sam", "Jules", "Robin", "Taylor", "Casey", "Morgan", "Jordan", "Riley").mapIndexed { number, name ->
                    EventParticipant("demo-person-$number", name, RegistrationStatus.Registered,
                        gender = if (number < 4) "male" else "female", registrationId = "demo-registration-$number")
                }, deadlineText = "", liveMetrics = LiveMetrics(null, null, null),
                startsAt = start, registrationClosesAt = start.minus(1, ChronoUnit.DAYS),
                cancellationClosesAt = start.minus(6, ChronoUnit.HOURS), syncStatus = EventSyncStatus.LocalOnly)
        }
    }

    val auth: AuthRepository = object : AuthRepository {
        override suspend fun findUserByEmail(email: String) = user.takeIf { it.email == email }
        override suspend fun registerUser(email: String, password: String, displayName: String): Result<User> {
            signedIn = true
            user = user.copy(email = email, displayName = displayName)
            return Result.success(user)
        }
        override suspend fun authenticateUser(email: String, password: String): Result<User> {
            signedIn = true
            return Result.success(user)
        }
        override suspend fun updateUserProfile(email: String, profile: UserProfile): Result<User> {
            user = user.copy(profile = profile)
            return Result.success(user)
        }
        override suspend fun restoreSession(): Result<User?> = Result.success(user.takeIf { signedIn })
        override suspend fun logout(): Result<Unit> { signedIn = false; return Result.success(Unit) }
    }

    val discovery: DiscoveryRepository = object : DiscoveryRepository {
        override suspend fun loadProfiles() = Result.success(profiles.filterNot { it.id in swiped })
        override suspend fun submitDecision(profile: DiscoveryProfile, liked: Boolean): Result<SwipeOutcome> {
            swiped += profile.id
            val threadId = "chat-${profile.id}"
            if (liked) addThread(threadId, profile.name)
            return Result.success(SwipeOutcome(liked, threadId.takeIf { liked }))
        }
    }

    val chat: MessagesRepository = object : MessagesRepository {
        override suspend fun getThreads() = Result.success(threads.values.sortedByDescending { it.lastTimestamp })
        override suspend fun ensureThread(threadId: String) = runCatching { requireNotNull(threads[threadId]) }
        override suspend fun getMessages(threadId: String) = runCatching { messages.getValue(threadId).toList() }
        override fun pendingMessageId(threadId: String, operationId: String) = messageOperationRowId(ACCOUNT_ID, threadId, operationId)
        override suspend fun sendMessage(request: MessageSendRequest): Result<ChatMessage> = runCatching {
            require(threads.containsKey(request.threadId))
            val id = messageOperationRowId(ACCOUNT_ID, request.threadId, request.operationId)
            committedSends[id] ?: ChatMessage(id, request.threadId, MessageAuthor.Me, request.text,
                System.currentTimeMillis(), false, replyToMessageId = request.replyToMessageId,
                attachments = if (request.attachmentType != null && request.voiceDurationSec == null) listOf(
                    MessageAttachment(id, request.attachmentType, request.displayName, request.localUri, request.mimeType)) else emptyList(),
                voiceNote = request.voiceDurationSec?.let { VoiceNote(request.localUri, it) },
                backendMessageId = id, syncStatus = MessageSyncStatus.Synced).also { message ->
                committedSends[id] = message
                messages.getValue(request.threadId).add(message)
                threads[request.threadId] = threads.getValue(request.threadId).copy(
                    lastMessage = request.text.ifBlank { request.displayName.ifBlank { "Audio" } }, lastTimestamp = message.timestamp)
            }
        }
        override suspend fun sendTextMessage(threadId: String, text: String, replyToMessageId: String?) =
            sendMessage(MessageSendRequest(threadId, text = text, replyToMessageId = replyToMessageId))
        override suspend fun sendAttachmentMessage(threadId: String, type: AttachmentType, displayName: String,
            localUri: String, mimeType: String, replyToMessageId: String?) = sendMessage(MessageSendRequest(threadId,
            attachmentType = type, displayName = displayName, localUri = localUri, mimeType = mimeType, replyToMessageId = replyToMessageId))
        override suspend fun sendVoiceMessage(threadId: String, localPath: String, durationSec: Int, replyToMessageId: String?) =
            sendMessage(MessageSendRequest(threadId, localUri = localPath, voiceDurationSec = durationSec, replyToMessageId = replyToMessageId))
        override suspend fun markAsRead(threadId: String): Result<Unit> = runCatching {
            threads[threadId] = threads.getValue(threadId).copy(unreadCount = 0)
        }
        override suspend fun setThreadNotifications(threadId: String, enabled: Boolean): Result<MessageThread> = runCatching {
            threads.getValue(threadId).copy(notificationsEnabled = enabled).also { threads[threadId] = it }
        }
        override suspend fun markCurrentUserPresence(isOnline: Boolean) = Result.success(Unit)
        override suspend fun updateRelationship(threadId: String, action: RelationshipAction): Result<Unit> {
            threads.remove(threadId); messages.remove(threadId)
            return Result.success(Unit)
        }
    }

    val eventRepository: EventsRepository = object : EventsRepository {
        override suspend fun getEventsForUser(userId: String, displayName: String) = Result.success(events.values.toList())
        override suspend fun joinEvent(eventId: String, userId: String, displayName: String) = setRegistration(eventId, RegistrationStatus.Registered)
        override suspend fun waitlistEvent(eventId: String, userId: String, displayName: String) = setRegistration(eventId, RegistrationStatus.Waitlist)
        override suspend fun cancelEvent(eventId: String, userId: String) = setRegistration(eventId, RegistrationStatus.NotRegistered)
        override suspend fun adminUpdateEvent(eventId: String, title: String, dateText: String, place: String,
            description: String, deadlineText: String, capacity: Int, rules: List<String>, maleLimit: Int,
            femaleLimit: Int, cancellationDeadlineText: String): Result<Unit> = runCatching {
            require(title.isNotBlank() && capacity >= 2 && maleLimit >= 0 && femaleLimit >= 0)
            events[eventId] = events.getValue(eventId).copy(title = title.trim(), dateText = dateText, place = place,
                description = description, deadlineText = deadlineText, cancellationDeadlineText = cancellationDeadlineText,
                capacity = capacity, maleLimit = maleLimit, femaleLimit = femaleLimit, rules = rules,
                startsAt = Instant.parse(minni.fyre.events.data.normalizeRequiredEventDateTime(dateText)))
        }
        override suspend fun adminSetParticipantStatus(eventId: String, participantId: String, registrationId: String?,
            status: RegistrationStatus): Result<Unit> = runCatching {
            val event = events.getValue(eventId)
            val participants = if (status == RegistrationStatus.NotRegistered) event.participants.filterNot { it.id == participantId }
                else event.participants.map { if (it.id == participantId) it.copy(status = status) else it }
            events[eventId] = withParticipants(event, participants)
        }
    }

    private fun setRegistration(eventId: String, status: RegistrationStatus): Result<Unit> = runCatching {
        val event = events.getValue(eventId)
        val participants = event.participants.filterNot { it.id == ACCOUNT_ID }.toMutableList()
        if (status != RegistrationStatus.NotRegistered) participants += EventParticipant(ACCOUNT_ID,
            user.displayName, status, user.profile?.gender, "demo-own-registration")
        val updated = withParticipants(event, participants)
        events[eventId] = updated.copy(ownRegistrationStatus = when (status) {
            RegistrationStatus.Registered -> "confirmed"
            RegistrationStatus.Promoted -> "promoted"
            RegistrationStatus.Waitlist -> "waitlisted"
            else -> "cancelled"
        })
    }

    private fun withParticipants(event: EventItem, participants: List<EventParticipant>): EventItem {
        val registered = participants.filter { it.status in setOf(RegistrationStatus.Registered, RegistrationStatus.Promoted) }
        val ownStatus = participants.firstOrNull { it.id == ACCOUNT_ID }?.status ?: RegistrationStatus.NotRegistered
        return event.copy(participants = participants, registrationStatus = ownStatus,
            userState = when (ownStatus) {
                RegistrationStatus.Registered -> EventUserState.Registered
                RegistrationStatus.Promoted -> EventUserState.Promoted
                RegistrationStatus.Waitlist -> EventUserState.Waitlist
                else -> EventUserState.NotRegistered
            }, registeredCount = registered.size, maleCount = registered.count { it.gender == "male" },
            femaleCount = registered.count { it.gender == "female" },
            waitingListCount = participants.count { it.status == RegistrationStatus.Waitlist })
    }

    private fun addThread(id: String, name: String) {
        threads.putIfAbsent(id, MessageThread(id, name.take(1), name, "Inizia una conversazione nella demo", now, 0,
            participantsBackendIds = listOf(ACCOUNT_ID, "peer-$id")))
        messages.putIfAbsent(id, mutableListOf())
    }

    companion object { const val ACCOUNT_ID = "offline-demo-user" }
}
