package minni.fyre.core.notifications

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import minni.fyre.R
import minni.fyre.data.AppGraphProvider
import minni.fyre.data.local.UserSettingsDataStore
import java.time.Instant
import java.util.concurrent.TimeUnit

class EventReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val eventId = inputData.getString(KEY_EVENT_ID).orEmpty()
        val expectedAccountId = inputData.getString(KEY_ACCOUNT_ID).orEmpty()
        val milestone = EventReminderMilestone.fromKey(inputData.getString(KEY_MILESTONE))
        if (eventId.isBlank() || expectedAccountId.isBlank() || milestone == null) {
            return Result.success()
        }

        val isStillScheduled = EventReminderScheduler.isReminderActive(applicationContext, eventId, milestone)
        val settings = UserSettingsDataStore(applicationContext).currentNotificationSettingsOrNull()
            ?: return finishWithoutNotification(eventId, milestone)
        if (!isStillScheduled || !settings.pushEnabled || !settings.eventReminders) {
            return finishWithoutNotification(eventId, milestone)
        }

        val appGraph = AppGraphProvider.get(applicationContext)
        val currentUser = appGraph.authRepository.restoreSession().getOrNull()
            ?: return finishWithoutNotification(eventId, milestone)
        val currentAccountId = currentUser.appwriteUserId
        if (currentAccountId.isNullOrBlank() || currentAccountId != expectedAccountId) {
            return finishWithoutNotification(eventId, milestone)
        }

        val event = appGraph.eventsRepository.getEventsForUser(
            userId = currentAccountId,
            displayName = currentUser.displayName
        ).getOrNull()?.firstOrNull { candidate -> candidate.id == eventId }
        if (!EventReminderTiming.shouldDeliver(
                isStillScheduled = EventReminderScheduler.isReminderActive(applicationContext, eventId, milestone),
                remindersEnabled = settings.pushEnabled && settings.eventReminders,
                expectedAccountId = expectedAccountId,
                currentAccountId = currentAccountId,
                userState = event?.userState
            )
        ) {
            return finishWithoutNotification(eventId, milestone)
        }

        val eventTitle = inputData.getString(KEY_EVENT_TITLE).orEmpty()
        val eventDate = inputData.getString(KEY_EVENT_DATE).orEmpty()
        val title = applicationContext.getString(R.string.events_reminder_notification_title)
        val body = if (eventDate.isBlank()) {
            applicationContext.getString(
                if (milestone == EventReminderMilestone.OneHour) {
                    R.string.events_reminder_notification_body_one_hour
                } else {
                    R.string.events_reminder_notification_body_twenty_four_hours
                },
                eventTitle
            )
        } else {
            applicationContext.getString(
                R.string.events_reminder_notification_body_with_date,
                eventTitle,
                eventDate
            )
        }

        val gateway = AndroidNotificationGateway(applicationContext)
        gateway.createChannels()
        gateway.showLocalNotification(
            title = title,
            body = body,
            channelId = NotificationChannels.EVENTS
        )
        EventReminderScheduler.markReminderFinished(applicationContext, eventId, milestone)
        return Result.success()
    }

    private fun finishWithoutNotification(
        eventId: String,
        milestone: EventReminderMilestone
    ): Result {
        EventReminderScheduler.markReminderFinished(applicationContext, eventId, milestone)
        return Result.success()
    }

    companion object {
        const val KEY_EVENT_ID = "key_event_id"
        const val KEY_ACCOUNT_ID = "key_account_id"
        const val KEY_MILESTONE = "key_milestone"
        const val KEY_EVENT_TITLE = "key_event_title"
        const val KEY_EVENT_DATE = "key_event_date"
    }
}

object EventReminderScheduler {
    private const val EVENT_REMINDER_TAG = "event_reminder"

    internal fun workName(eventId: String, milestone: EventReminderMilestone): String =
        "event_reminder_${eventId}_${milestone.key}"

    fun scheduleReminder(
        context: Context,
        accountId: String,
        eventId: String,
        eventTitle: String,
        eventDate: String,
        eventStartsAt: Instant,
        now: Instant = Instant.now()
    ): Boolean {
        val reminders = EventReminderTiming.scheduledReminders(
            startsAt = eventStartsAt,
            now = now
        )
        if (reminders.isEmpty()) {
            cancelReminder(context, eventId)
            return false
        }

        if (accountId.isBlank() || eventId.isBlank()) {
            cancelReminder(context, eventId)
            return false
        }

        cancelReminder(context, eventId)
        reminders.forEach { reminder ->
            val data = Data.Builder()
                .putString(EventReminderWorker.KEY_EVENT_ID, eventId)
                .putString(EventReminderWorker.KEY_ACCOUNT_ID, accountId)
                .putString(EventReminderWorker.KEY_MILESTONE, reminder.milestone.key)
                .putString(EventReminderWorker.KEY_EVENT_TITLE, eventTitle)
                .putString(EventReminderWorker.KEY_EVENT_DATE, eventDate)
                .build()

            val request = OneTimeWorkRequestBuilder<EventReminderWorker>()
                .setInitialDelay(reminder.delayMillis, TimeUnit.MILLISECONDS)
                .setInputData(data)
                .addTag(EVENT_REMINDER_TAG)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                workName(eventId, reminder.milestone),
                ExistingWorkPolicy.REPLACE,
                request
            )
        }
        updateActiveReminderKeys(context) { activeKeys ->
            activeKeys + reminders.map { reminderKey(eventId, it.milestone) }
        }
        return true
    }

    fun cancelReminder(context: Context, eventId: String) {
        EventReminderMilestone.entries.forEach { milestone ->
            WorkManager.getInstance(context).cancelUniqueWork(workName(eventId, milestone))
        }
        updateActiveReminderKeys(context) { activeKeys ->
            activeKeys.filterNotTo(mutableSetOf()) { key ->
                key == eventId || eventIdFromReminderKey(key) == eventId
            }
        }
    }

    fun cancelRemindersForMissingEvents(context: Context, authoritativeEventIds: Set<String>) {
        val activeIds = activeReminderKeys(context).mapNotNullTo(mutableSetOf(), ::eventIdFromReminderKey)
        EventReminderTiming.reminderIdsToCancel(activeIds, authoritativeEventIds)
            .forEach { eventId -> cancelReminder(context, eventId) }
    }

    fun cancelAllReminders(context: Context) {
        WorkManager.getInstance(context).cancelAllWorkByTag(EVENT_REMINDER_TAG)
        updateActiveReminderKeys(context) { emptySet() }
    }

    internal fun isReminderActive(
        context: Context,
        eventId: String,
        milestone: EventReminderMilestone
    ): Boolean {
        return reminderKey(eventId, milestone) in activeReminderKeys(context)
    }

    internal fun markReminderFinished(
        context: Context,
        eventId: String,
        milestone: EventReminderMilestone
    ) {
        updateActiveReminderKeys(context) { activeKeys ->
            activeKeys - reminderKey(eventId, milestone)
        }
    }

    private fun activeReminderKeys(context: Context): Set<String> = synchronized(ReminderRegistryLock) {
        context.applicationContext
            .getSharedPreferences(ReminderRegistryPreferences, Context.MODE_PRIVATE)
            .getStringSet(ReminderRegistryKey, emptySet())
            ?.toSet()
            .orEmpty()
    }

    private fun updateActiveReminderKeys(
        context: Context,
        update: (Set<String>) -> Set<String>
    ) = synchronized(ReminderRegistryLock) {
        val preferences = context.applicationContext.getSharedPreferences(
            ReminderRegistryPreferences,
            Context.MODE_PRIVATE
        )
        val current = preferences.getStringSet(ReminderRegistryKey, emptySet())?.toSet().orEmpty()
        preferences.edit().putStringSet(ReminderRegistryKey, update(current)).commit()
    }

    private fun reminderKey(eventId: String, milestone: EventReminderMilestone): String =
        "$eventId|${milestone.key}"

    private fun eventIdFromReminderKey(key: String): String? {
        val eventId = key.substringBefore('|').trim()
        return eventId.takeIf { it.isNotBlank() }
    }

    private const val ReminderRegistryPreferences = "fyre_event_reminders_v1"
    private const val ReminderRegistryKey = "active_event_ids"
    private val ReminderRegistryLock = Any()
}
