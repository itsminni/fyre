package com.example.fyre.discover.data

import com.example.fyre.discover.model.DiscoveryProfile

/** Dataset mock realistico per la schermata discovery. */
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
            socialTags = listOf("@giu.design", "#brunchlover")
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
            socialTags = listOf("@lorenzocode", "#citybreak")
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
            socialTags = listOf("@sara.frame", "#film35mm")
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
            socialTags = listOf("@mat.arc", "#hikingdays")
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
            socialTags = listOf("@elena.words", "#indienight")
        )
    )
}

