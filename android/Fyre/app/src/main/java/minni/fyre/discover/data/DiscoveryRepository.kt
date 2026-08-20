package minni.fyre.discover.data

import minni.fyre.discover.model.DiscoveryProfile

data class SwipeOutcome(
    val matched: Boolean,
    val threadId: String?
)

interface DiscoveryRepository {
    suspend fun loadProfiles(): Result<List<DiscoveryProfile>>

    suspend fun submitDecision(
        profile: DiscoveryProfile,
        liked: Boolean
    ): Result<SwipeOutcome>
}