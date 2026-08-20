package minni.fyre.discover.data

import minni.fyre.data.model.ProfileFieldValues
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
            assertTrue("intent canonico", profile.intent in ProfileFieldValues.SupportedIntents)
            assertTrue("interests obbligatori", profile.interests.isNotEmpty())
        }
    }
}
