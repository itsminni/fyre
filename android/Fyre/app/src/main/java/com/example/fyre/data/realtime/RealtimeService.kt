package com.example.fyre.data.realtime

import kotlinx.coroutines.flow.Flow

/**
 * Contratto realtime agnostico al provider, estendibile in base al backend scelto.
 */
interface RealtimeService {
    fun subscribe(channel: String): Flow<String>
}

