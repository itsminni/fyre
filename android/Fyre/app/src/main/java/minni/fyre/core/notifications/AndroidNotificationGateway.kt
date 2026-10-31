package minni.fyre.core.notifications

import android.annotation.SuppressLint
import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import minni.fyre.MainActivity
import minni.fyre.R
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

class AndroidNotificationGateway(
    private val context: Context
) : NotificationGateway {

    override fun createChannels() {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channels = listOf(
            NotificationChannel(
                NotificationChannels.GENERAL,
                context.getString(R.string.notification_channel_general),
                NotificationManager.IMPORTANCE_DEFAULT
            ),
            NotificationChannel(
                NotificationChannels.MATCHES,
                context.getString(R.string.account_switch_matches),
                NotificationManager.IMPORTANCE_DEFAULT
            ),
            NotificationChannel(
                NotificationChannels.MESSAGES,
                context.getString(R.string.tab_messages),
                NotificationManager.IMPORTANCE_DEFAULT
            ),
            NotificationChannel(
                NotificationChannels.EVENTS,
                context.getString(R.string.tab_events),
                NotificationManager.IMPORTANCE_DEFAULT
            )
        )
        manager.createNotificationChannels(channels)
    }

    @SuppressLint("MissingPermission")
    override fun showLocalNotification(
        title: String,
        body: String,
        channelId: String
    ) = showLocalNotification(title, body, channelId, null)

    @SuppressLint("MissingPermission")
    override fun showLocalNotification(title: String, body: String, channelId: String, destination: NotificationDestination?) {
        if (!canPostNotifications()) return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            destination?.let {
                putExtra("notification_account", it.accountId)
                putExtra("notification_kind", it.kind)
                putExtra("notification_resource", it.resourceId)
                data = android.net.Uri.Builder().scheme("fyre").authority("notification")
                    .appendPath(it.accountId).appendPath(it.kind).appendPath(it.resourceId).build()
            }
        }
        val pendingIntent = PendingIntent.getActivity(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        NotificationManagerCompat.from(context).notify(
            System.currentTimeMillis().toInt(),
            notification
        )
    }

    private fun canPostNotifications(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }
}
