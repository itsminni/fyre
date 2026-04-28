package com.example.fyre.discover.presentation

import com.example.fyre.account.model.DiscoveryPreferences
import com.example.fyre.discover.model.DiscoveryProfile
import org.junit.Assert.assertEquals
import org.junit.Test

class DiscoverFilteringTest {

    @Test
    fun filters_matching_profiles_when_filter_has_results() {
        val matching = profile(id = "match", age = 28, intent = "relationship", verified = true, distanceKm = 12)
        val hidden = profile(id = "hidden", age = 44, intent = "casual", verified = false, distanceKm = 80)

        val result = discoverProfilesForDisplay(
            profiles = listOf(matching, hidden),
            discoveryPreferences = DiscoveryPreferences(
                minAge = 25,
                maxAge = 35,
                maxDistanceKm = 30,
                showOnlyVerified = true,
                intent = "relationship"
            )
        )

        assertEquals(listOf(matching), result)
    }

    @Test
    fun falls_back_to_backend_profiles_when_local_filters_hide_everything() {
        val backendProfile = profile(id = "backend", age = 44, intent = "casual", verified = false, distanceKm = 80)

        val result = discoverProfilesForDisplay(
            profiles = listOf(backendProfile),
            discoveryPreferences = DiscoveryPreferences(
                minAge = 25,
                maxAge = 35,
                maxDistanceKm = 30,
                showOnlyVerified = true,
                intent = "relationship"
            )
        )

        assertEquals(listOf(backendProfile), result)
    }

    @Test
    fun unknown_distance_does_not_exclude_profile() {
        val unknownDistance = profile(id = "near-enough", distanceKm = 0)

        val result = discoverProfilesForDisplay(
            profiles = listOf(unknownDistance),
            discoveryPreferences = DiscoveryPreferences(maxDistanceKm = 1)
        )

        assertEquals(listOf(unknownDistance), result)
    }

    private fun profile(
        id: String,
        age: Int = 28,
        intent: String = "relationship",
        verified: Boolean = true,
        distanceKm: Int = 12
    ): DiscoveryProfile {
        return DiscoveryProfile(
            id = id,
            name = id,
            age = age,
            isVerified = verified,
            city = "Milano",
            distanceKm = distanceKm,
            bio = "Bio",
            intent = intent,
            interests = emptyList(),
            socialTags = emptyList()
        )
    }
}
