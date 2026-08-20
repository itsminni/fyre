package minni.fyre.core.notifications

import minni.fyre.events.model.EventUserState
import java.time.Duration
import java.time.Instant

internal enum class EventReminderReconciliationAction {
    Schedule,
    Cancel
}

internal enum class EventReminderMilestone(
    val key: String,
    val leadTime: Duration
) {
    TwentyFourHours("24h", Duration.ofHours(24)),
    OneHour("1h", Duration.ofHours(1));

    companion object {
        fun fromKey(value: String?): EventReminderMilestone? = entries.firstOrNull { it.key == value }
    }
}

internal data class ScheduledEventReminder(
    val milestone: EventReminderMilestone,
    val delayMillis: Long
)

internal object EventReminderTiming {
    fun delayMillis(
        startsAt: Instant,
        now: Instant,
        milestone: EventReminderMilestone = EventReminderMilestone.TwentyFourHours
    ): Long? {
        if (!startsAt.isAfter(now)) return null

        val reminderAt = startsAt.minus(milestone.leadTime)
        if (!reminderAt.isAfter(now)) return null

        return Duration.between(now, reminderAt).toMillis()
    }

    fun scheduledReminders(startsAt: Instant, now: Instant): List<ScheduledEventReminder> {
        return EventReminderMilestone.entries.mapNotNull { milestone ->
            delayMillis(startsAt, now, milestone)?.let { delay ->
                ScheduledEventReminder(milestone, delay)
            }
        }
    }

    fun reconciliationAction(
        userState: EventUserState,
        remindersEnabled: Boolean,
        startsAt: Instant?,
        now: Instant = Instant.now()
    ): EventReminderReconciliationAction {
        if (!remindersEnabled) return EventReminderReconciliationAction.Cancel
        if (userState != EventUserState.Registered && userState != EventUserState.Promoted) {
            return EventReminderReconciliationAction.Cancel
        }
        return if (startsAt != null && scheduledReminders(startsAt, now).isNotEmpty()) {
            EventReminderReconciliationAction.Schedule
        } else {
            EventReminderReconciliationAction.Cancel
        }
    }

    fun reminderIdsToCancel(
        scheduledEventIds: Set<String>,
        authoritativeEventIds: Set<String>
    ): Set<String> = scheduledEventIds - authoritativeEventIds

    fun shouldDeliver(
        isStillScheduled: Boolean,
        remindersEnabled: Boolean,
        expectedAccountId: String,
        currentAccountId: String?,
        userState: EventUserState?
    ): Boolean {
        if (!isStillScheduled || !remindersEnabled) return false
        if (expectedAccountId.isBlank() || expectedAccountId != currentAccountId) return false
        return userState == EventUserState.Registered || userState == EventUserState.Promoted
    }
}
