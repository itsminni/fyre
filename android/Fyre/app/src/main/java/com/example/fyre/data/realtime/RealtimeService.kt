package com.example.fyre.data.realtime

import kotlinx.coroutines.flow.Flow

/**
 * Contratto realtime agnostico al provider (Appwrite oggi, estendibile domani).
 */
interface RealtimeService {
    fun subscribe(channel: String): Flow<String>
}

