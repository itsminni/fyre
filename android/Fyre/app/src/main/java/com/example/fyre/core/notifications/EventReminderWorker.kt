package com.example.fyre.core.notifications

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class EventReminderWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val eventTitle = inputData.getString(KEY_EVENT_TITLE).orEmpty()
        val eventDate = inputData.getString(KEY_EVENT_DATE).orEmpty()
        val title = "Promemoria evento"
        val body = if (eventDate.isBlank()) {
            "Tra poco inizia $eventTitle"
        } else {
            "$eventTitle - $eventDate"
        }

        val gateway = AndroidNotificationGateway(applicationContext)
        gateway.createChannels()
        gateway.showLocalNotification(
            title = title,
            body = body,
            channelId = NotificationChannels.EVENTS
        )
        return Result.success()
    }

    companion object {
        const val KEY_EVENT_ID = "key_event_id"
        const val KEY_EVENT_TITLE = "key_event_title"
        const val KEY_EVENT_DATE = "key_event_date"
    }
}

object EventReminderScheduler {
    fun scheduleSimulatedReminder(
        context: Context,
        eventId: String,
        eventTitle: String,
        eventDate: String,
        delaySeconds: Long = 30L
    ) {
        val data = Data.Builder()
            .putString(EventReminderWorker.KEY_EVENT_ID, eventId)
            .putString(EventReminderWorker.KEY_EVENT_TITLE, eventTitle)
            .putString(EventReminderWorker.KEY_EVENT_DATE, eventDate)
            .build()

        val request = OneTimeWorkRequestBuilder<EventReminderWorker>()
            .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
            .setInputData(data)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            "event_reminder_$eventId",
            ExistingWorkPolicy.REPLACE,
            request
        )
    }
}

