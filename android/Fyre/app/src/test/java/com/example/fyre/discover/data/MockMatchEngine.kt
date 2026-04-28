package com.example.fyre.discover.data

import com.example.fyre.discover.model.DiscoveryProfile
import kotlin.math.absoluteValue

/**
 * Simula il match reciproco completamente in locale.
 * Regola deterministica: alcuni profili generano match per garantire UX ripetibile nei test.
 */
object MockMatchEngine {

    data class MatchPayload(
        val profileId: String,
        val threadId: String
    )

    fun evaluateLike(profile: DiscoveryProfile): MatchPayload? {
        val shouldMatch = profile.id.hashCode().absoluteValue % 3 == 0
        if (!shouldMatch) return null

        return MatchPayload(
            profileId = profile.id,
            threadId = "thread_${profile.id}"
        )
    }
}

