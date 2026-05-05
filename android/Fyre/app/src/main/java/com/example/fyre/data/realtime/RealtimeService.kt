package com.example.fyre.data.realtime

import kotlinx.coroutines.flow.Flow

interface RealtimeService {
    fun subscribe(channel: String): Flow<String>
}

