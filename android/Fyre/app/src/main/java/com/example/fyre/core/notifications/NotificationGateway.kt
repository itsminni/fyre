package com.example.fyre.core.notifications

/**
 * Gateway per notifiche locali/push, separato dalla UI.
 */
interface NotificationGateway {
    fun createChannels()
    fun showLocalNotification(title: String, body: String)
}

