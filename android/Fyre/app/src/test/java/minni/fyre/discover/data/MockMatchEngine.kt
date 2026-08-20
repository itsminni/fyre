package minni.fyre.discover.data

import minni.fyre.discover.model.DiscoveryProfile
import kotlin.math.absoluteValue

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

