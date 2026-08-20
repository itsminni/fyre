package minni.fyre.core.notifications

import minni.fyre.events.model.EventUserState
import java.time.Duration
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EventReminderTimingTest {
    private val now = Instant.parse("2026-07-21T12:00:00Z")

    @Test
    fun schedules_twenty_four_hours_before_a_later_event() {
        val startsAt = now.plus(Duration.ofHours(48))

        assertEquals(
            Duration.ofHours(24).toMillis(),
            EventReminderTiming.delayMillis(startsAt, now) ?: error("Reminder was not scheduled")
        )
    }

    @Test
    fun schedules_both_twenty_four_hour_and_one_hour_milestones() {
        val reminders = EventReminderTiming.scheduledReminders(
            startsAt = now.plus(Duration.ofHours(48)),
            now = now
        )

        assertEquals(
            setOf(EventReminderMilestone.TwentyFourHours, EventReminderMilestone.OneHour),
            reminders.mapTo(mutableSetOf()) { it.milestone }
        )
    }

    @Test
    fun skips_when_the_twenty_four_hour_reminder_time_has_passed() {
        val startsAt = now.plus(Duration.ofHours(2))

        assertNull(EventReminderTiming.delayMillis(startsAt, now))
    }

    @Test
    fun does_not_schedule_for_an_event_that_already_started() {
        val startsAt = now.minusSeconds(1)

        assertNull(EventReminderTiming.delayMillis(startsAt, now))
    }

    @Test
    fun reminder_work_name_is_stable_for_cancellation() {
        assertEquals(
            "event_reminder_event-42_1h",
            EventReminderScheduler.workName("event-42", EventReminderMilestone.OneHour)
        )
    }

    @Test
    fun bootstrap_schedules_only_confirmed_future_reminders() {
        assertEquals(
            EventReminderReconciliationAction.Schedule,
            EventReminderTiming.reconciliationAction(
                EventUserState.Registered,
                remindersEnabled = true,
                startsAt = now.plus(Duration.ofHours(48)),
                now = now
            )
        )
        assertEquals(
            EventReminderReconciliationAction.Cancel,
            EventReminderTiming.reconciliationAction(
                EventUserState.Promoted,
                remindersEnabled = true,
                startsAt = now.plus(Duration.ofMinutes(30)),
                now = now
            )
        )
    }

    @Test
    fun one_hour_reminder_is_still_scheduled_after_the_twenty_four_hour_window() {
        assertEquals(
            EventReminderReconciliationAction.Schedule,
            EventReminderTiming.reconciliationAction(
                EventUserState.Promoted,
                remindersEnabled = true,
                startsAt = now.plus(Duration.ofHours(2)),
                now = now
            )
        )
    }

    @Test
    fun settings_disable_and_waitlist_both_cancel() {
        assertEquals(
            EventReminderReconciliationAction.Cancel,
            EventReminderTiming.reconciliationAction(
                EventUserState.Registered,
                remindersEnabled = false,
                startsAt = now.plus(Duration.ofHours(48)),
                now = now
            )
        )
        assertEquals(
            EventReminderReconciliationAction.Cancel,
            EventReminderTiming.reconciliationAction(
                EventUserState.Waitlist,
                remindersEnabled = true,
                startsAt = now.plus(Duration.ofHours(48)),
                now = now
            )
        )
    }

    @Test
    fun missing_authoritative_events_are_cancelled() {
        assertEquals(
            setOf("deleted", "cancelled"),
            EventReminderTiming.reminderIdsToCancel(
                scheduledEventIds = setOf("active", "deleted", "cancelled"),
                authoritativeEventIds = setOf("active", "new")
            )
        )
    }

    @Test
    fun worker_delivery_fails_closed_for_account_or_registration_changes() {
        assertTrue(
            EventReminderTiming.shouldDeliver(
                isStillScheduled = true,
                remindersEnabled = true,
                expectedAccountId = "account-a",
                currentAccountId = "account-a",
                userState = EventUserState.Registered
            )
        )
        assertFalse(
            EventReminderTiming.shouldDeliver(
                isStillScheduled = true,
                remindersEnabled = true,
                expectedAccountId = "account-a",
                currentAccountId = "account-b",
                userState = EventUserState.Registered
            )
        )
        assertFalse(
            EventReminderTiming.shouldDeliver(
                isStillScheduled = true,
                remindersEnabled = true,
                expectedAccountId = "account-a",
                currentAccountId = "account-a",
                userState = EventUserState.Waitlist
            )
        )
    }
}
