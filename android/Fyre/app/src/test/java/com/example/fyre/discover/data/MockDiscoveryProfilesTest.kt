package com.example.fyre.discover.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MockDiscoveryProfilesTest {

    @Test
    fun mock_profiles_have_required_fields() {
        val profiles = MockDiscoveryProfiles.items

        assertFalse("La lista profili non deve essere vuota", profiles.isEmpty())

        profiles.forEach { profile ->
            assertTrue("name obbligatorio", profile.name.isNotBlank())
            assertTrue("eta deve essere > 17", profile.age > 17)
            assertTrue("city obbligatoria", profile.city.isNotBlank())
            assertTrue("distanceKm non valida", profile.distanceKm >= 0)
            assertTrue("bio obbligatoria", profile.bio.isNotBlank())
            assertTrue("intent obbligatorio", profile.intent.isNotBlank())
            assertTrue("interests obbligatori", profile.interests.isNotEmpty())
            assertTrue("socialTags obbligatori", profile.socialTags.isNotEmpty())
        }
    }
}

