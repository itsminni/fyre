package com.example.fyre.discover.data

import com.example.fyre.discover.model.DiscoveryProfile

class MockDiscoveryRepository : DiscoveryRepository {
    override suspend fun loadProfiles(): Result<List<DiscoveryProfile>> {
        return Result.success(MockDiscoveryProfiles.items)
    }

    override suspend fun submitDecision(
        profile: DiscoveryProfile,
        liked: Boolean
    ): Result<SwipeOutcome> {
        if (!liked) {
            return Result.success(SwipeOutcome(matched = false, threadId = null))
        }

        val payload = MockMatchEngine.evaluateLike(profile)
        return Result.success(
            SwipeOutcome(
                matched = payload != null,
                threadId = payload?.threadId
            )
        )
    }
}
