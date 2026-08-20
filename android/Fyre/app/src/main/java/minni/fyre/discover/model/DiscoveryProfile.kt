package minni.fyre.discover.model

data class DiscoveryProfile(
    val id: String,
    val name: String,
    val age: Int,
    val isVerified: Boolean,
    val city: String,
    val distanceKm: Int,
    val bio: String,
    val intent: String,
    val interests: List<String>,
    val instagramTag: String? = null,
    val spotifyTag: String? = null,
    val photoUrls: List<String> = emptyList(),
    val compatibilityScore: Int = 82,
    val gender: String? = null
)
