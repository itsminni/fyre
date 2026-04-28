package com.example.fyre.discover.model

/**
 * Modello UI per una card di discovery proveniente da Appwrite.
 */
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
    val socialTags: List<String>,
    val photoUrls: List<String> = emptyList(),
    val compatibilityScore: Int = 82,
    val gender: String? = null,
    val orientation: String? = null,
    val smokes: Boolean? = null,
    val drinks: Boolean? = null
)

