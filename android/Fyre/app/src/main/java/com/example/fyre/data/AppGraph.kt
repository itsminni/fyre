package com.example.fyre.data

import android.content.Context
import com.example.fyre.data.appwrite.AppwriteConfiguration
import com.example.fyre.data.appwrite.AppwriteGateway
import com.example.fyre.data.repository.AppwriteAuthRepository
import com.example.fyre.data.repository.AuthRepository
import com.example.fyre.data.repository.UserRepository
import com.example.fyre.discover.data.AppwriteDiscoveryRepository
import com.example.fyre.discover.data.DiscoveryRepository
import com.example.fyre.discover.data.MockDiscoveryRepository
import com.example.fyre.events.data.AppwriteEventsRepository
import com.example.fyre.events.data.EventsRepository
import com.example.fyre.events.data.MockEventsDataRepository
import com.example.fyre.messages.data.AppwriteMessagesRepository
import com.example.fyre.messages.data.MessagesRepository
import com.example.fyre.messages.data.MockMessagesDataRepository

class AppGraph(
    context: Context
) {
    private val appContext = context.applicationContext

    val appwriteConfiguration: AppwriteConfiguration? = AppwriteConfiguration.fromBuildConfig()
    private val appwriteGateway: AppwriteGateway? = appwriteConfiguration
        ?.let { configuration -> AppwriteGateway(appContext, configuration) }

    val authRepository: AuthRepository = if (appwriteConfiguration != null) {
        AppwriteAuthRepository(appContext, appwriteConfiguration)
    } else {
        UserRepository(appContext)
    }

    val discoveryRepository: DiscoveryRepository = if (
        appwriteConfiguration != null && appwriteGateway != null
    ) {
        AppwriteDiscoveryRepository(appwriteGateway, appwriteConfiguration)
    } else {
        MockDiscoveryRepository()
    }

    val messagesRepository: MessagesRepository = if (
        appwriteConfiguration != null && appwriteGateway != null
    ) {
        AppwriteMessagesRepository(appwriteGateway, appwriteConfiguration)
    } else {
        MockMessagesDataRepository()
    }

    val eventsRepository: EventsRepository = if (
        appwriteConfiguration != null && appwriteGateway != null
    ) {
        AppwriteEventsRepository(appwriteGateway, appwriteConfiguration)
    } else {
        MockEventsDataRepository()
    }

    val isBackendEnabled: Boolean
        get() = appwriteConfiguration != null
}

object AppGraphProvider {
    @Volatile
    private var instance: AppGraph? = null

    fun get(context: Context): AppGraph {
        return instance ?: synchronized(this) {
            instance ?: AppGraph(context).also { created ->
                instance = created
            }
        }
    }
}
