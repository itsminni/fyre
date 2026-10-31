package minni.fyre.discover.data

import minni.fyre.discover.model.DiscoveryProfile

data class SwipeOutcome(
    val matched: Boolean,
    val threadId: String?
)

data class DiscoveryPage(val profiles: List<DiscoveryProfile>, val nextCursor: String?)

interface DiscoveryRepository {
    suspend fun loadPage(cursor: String? = null): Result<DiscoveryPage> = loadProfiles().map { DiscoveryPage(it, null) }

    suspend fun loadProfiles(): Result<List<DiscoveryProfile>>

    suspend fun submitDecision(
        profile: DiscoveryProfile,
        liked: Boolean
    ): Result<SwipeOutcome>
}