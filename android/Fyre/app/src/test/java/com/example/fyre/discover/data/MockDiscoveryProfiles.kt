package com.example.fyre.discover.data

import com.example.fyre.discover.model.DiscoveryProfile


object MockDiscoveryProfiles {
    val items: List<DiscoveryProfile> = listOf(
        DiscoveryProfile(
            id = "p1",
            name = "Giulia",
            age = 27,
            isVerified = true,
            city = "Milano",
            distanceKm = 3,
            bio = "Product designer, caffe specialty e mostre nel weekend.",
            intent = "Relazione seria",
            interests = listOf("Design", "Running", "Cinema d'autore"),
            socialTags = listOf("@giu.design", "#brunchlover"),
            photoUrls = listOf(
                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900",
                "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=900"
            ),
            compatibilityScore = 92,
            drinks = true
        ),
        DiscoveryProfile(
            id = "p2",
            name = "Lorenzo",
            age = 30,
            isVerified = false,
            city = "Bologna",
            distanceKm = 8,
            bio = "Sviluppatore mobile, fan di viaggi in treno e cucina asiatica.",
            intent = "Conoscere nuove persone",
            interests = listOf("Tech", "Food", "Viaggi"),
            socialTags = listOf("@lorenzocode", "#citybreak"),
            photoUrls = listOf(
                "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=900",
                "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=900"
            ),
            compatibilityScore = 78,
            smokes = false
        ),
        DiscoveryProfile(
            id = "p3",
            name = "Sara",
            age = 25,
            isVerified = true,
            city = "Torino",
            distanceKm = 5,
            bio = "Fotografia analogica, yoga al parco e aperitivi lenti.",
            intent = "Dating leggero",
            interests = listOf("Fotografia", "Yoga", "Aperitivi"),
            socialTags = listOf("@sara.frame", "#film35mm"),
            photoUrls = listOf(
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=900",
                "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=900"
            ),
            compatibilityScore = 86,
            drinks = false
        ),
        DiscoveryProfile(
            id = "p4",
            name = "Matteo",
            age = 29,
            isVerified = true,
            city = "Roma",
            distanceKm = 11,
            bio = "Architetto, trekking in Appennino e podcast true crime.",
            intent = "Relazione seria",
            interests = listOf("Architettura", "Trekking", "Podcast"),
            socialTags = listOf("@mat.arc", "#hikingdays"),
            photoUrls = listOf(
                "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=900",
                "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=900"
            ),
            compatibilityScore = 89,
            smokes = false,
            drinks = true
        ),
        DiscoveryProfile(
            id = "p5",
            name = "Elena",
            age = 26,
            isVerified = false,
            city = "Firenze",
            distanceKm = 2,
            bio = "Copywriter, libri in biblioteca e concerti indie.",
            intent = "Conoscere nuove persone",
            interests = listOf("Scrittura", "Musica live", "Libri"),
            socialTags = listOf("@elena.words", "#indienight"),
            photoUrls = listOf(
                "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=900",
                "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=900"
            ),
            compatibilityScore = 81
        )
    )
}

