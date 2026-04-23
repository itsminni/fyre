package com.example.fyre.discover.model

/**
 * Modello locale per la card di discovery.
 * Nessuna chiamata backend: i dati vengono mockati in app.
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
    val socialTags: List<String>
)

