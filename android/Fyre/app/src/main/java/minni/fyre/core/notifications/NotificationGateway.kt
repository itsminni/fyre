package minni.fyre.core.notifications

interface NotificationGateway {
    fun createChannels()
    fun showLocalNotification(
        title: String,
        body: String,
        channelId: String = NotificationChannels.GENERAL
    )
}

