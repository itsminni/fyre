package minni.fyre.core.notifications

interface NotificationGateway {
    fun showLocalNotification(title: String, body: String, channelId: String, destination: NotificationDestination?) {
        showLocalNotification(title, body, channelId)
    }
    fun createChannels()
    fun showLocalNotification(
        title: String,
        body: String,
        channelId: String = NotificationChannels.GENERAL
    )
}


data class NotificationDestination(val accountId: String, val kind: String, val resourceId: String) {
    fun isFor(account: String?): Boolean = accountId.isNotBlank() && accountId == account &&
        kind in setOf("chat", "event") && resourceId.isNotBlank() && resourceId.length <= 128
}
