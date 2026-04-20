package com.example.fyre.data.remote

import android.content.Context
import io.appwrite.Client

/**
 * Factory minimale per il client Appwrite.
 *
 * Mantiene la configurazione in un solo punto in vista di un layer remoto piu strutturato.
 */
class AppwriteClientProvider(
    context: Context,
    endpoint: String,
    projectId: String
) {
    val client: Client = Client(context)
        .setEndpoint(endpoint)
        .setProject(projectId)
}

