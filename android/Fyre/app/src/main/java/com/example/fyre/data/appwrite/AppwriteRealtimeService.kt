package com.example.fyre.data.appwrite

import android.content.Context
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

data class AppwriteRealtimeEvent(
    val events: List<String>,
    val channels: List<String>,
    val payload: JsonObject,
    val raw: JsonObject
) {
    val isMutation: Boolean
        get() = events.any { event ->
            event.contains(".create") || event.contains(".update") || event.contains(".delete")
        }

    val isCreate: Boolean
        get() = events.any { it.contains(".create") }

    val isUpdate: Boolean
        get() = events.any { it.contains(".update") }

    val isDelete: Boolean
        get() = events.any { it.contains(".delete") }

    fun stringValue(key: String): String? = payload.stringOrNull(key)

    fun hasPayloadKey(key: String): Boolean {
        val value = payload[key] ?: return false
        return !value.isJsonNull
    }
}

class AppwriteRealtimeService(
    context: Context,
    private val configuration: AppwriteConfiguration
) {
    private val cookieJar = PersistentCookieJar(context.applicationContext)
    private val client = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    fun makeNotificationSubscription(
        onEvent: (AppwriteRealtimeEvent) -> Unit,
        onError: (Throwable) -> Unit = {}
    ): AppwriteRealtimeSubscription {
        val channels = buildList {
            add(configuration.messagesRealtimeChannel)
            add(configuration.threadParticipantsRealtimeChannel)
            configuration.matchesRealtimeChannel?.let(::add)
        }

        return makeSubscription(
            channels = channels,
            onEvent = { event ->
                if (event.isMutation) {
                    onEvent(event)
                }
            },
            onError = onError
        )
    }

    fun makeInboxSubscription(
        onEvent: (AppwriteRealtimeEvent) -> Unit,
        onError: (Throwable) -> Unit = {}
    ): AppwriteRealtimeSubscription {
        val channels = buildList {
            add(configuration.messagesRealtimeChannel)
            add(configuration.threadsRealtimeChannel)
            add(configuration.threadParticipantsRealtimeChannel)
            configuration.matchesRealtimeChannel?.let(::add)
        }

        return makeSubscription(
            channels = channels,
            onEvent = { event ->
                if (event.isMutation) {
                    onEvent(event)
                }
            },
            onError = onError
        )
    }

    fun makeSubscription(
        channels: List<String>,
        onEvent: (AppwriteRealtimeEvent) -> Unit,
        onError: (Throwable) -> Unit = {}
    ): AppwriteRealtimeSubscription {
        return AppwriteRealtimeSubscription(
            client = client,
            cookieJar = cookieJar,
            configuration = configuration,
            channels = channels,
            onEvent = onEvent,
            onError = onError
        )
    }
}

class AppwriteRealtimeSubscription internal constructor(
    private val client: OkHttpClient,
    private val cookieJar: PersistentCookieJar,
    private val configuration: AppwriteConfiguration,
    channels: List<String>,
    private val onEvent: (AppwriteRealtimeEvent) -> Unit,
    private val onError: (Throwable) -> Unit
) {
    private val channels = channels.distinct().sorted()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var webSocket: WebSocket? = null
    @Volatile private var isCancelled = false
    private var reconnectJob: Job? = null

    fun start() {
        if (webSocket != null || isCancelled) return
        connect()
    }

    fun cancel() {
        isCancelled = true
        reconnectJob?.cancel()
        scope.cancel()
        webSocket?.close(NORMAL_CLOSURE_STATUS, null)
        webSocket = null
    }

    private fun connect() {
        if (isCancelled || channels.isEmpty()) return

        val request = Request.Builder()
            .url(realtimeUrl())
            .header("X-Appwrite-Project", configuration.projectId)
            .header("X-Appwrite-Response-Format", RESPONSE_FORMAT)
            .apply {
                cookieHeader()?.let { header("Cookie", it) }
            }
            .build()

        webSocket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    parseEvent(text)?.let(onEvent)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    this@AppwriteRealtimeSubscription.webSocket = null
                    if (!isCancelled) {
                        onError(t)
                        scheduleReconnect()
                    }
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    this@AppwriteRealtimeSubscription.webSocket = null
                    if (!isCancelled) {
                        scheduleReconnect()
                    }
                }
            }
        )
    }

    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(RECONNECT_DELAY_MS)
            connect()
        }
    }

    private fun parseEvent(rawText: String): AppwriteRealtimeEvent? {
        return runCatching {
            val raw = JsonParser.parseString(rawText).asJsonObject
            val payload = when {
                raw["payload"]?.isJsonObject == true -> raw["payload"].asJsonObject
                raw["data"]?.isJsonObject == true -> raw["data"].asJsonObject
                else -> JsonObject()
            }

            AppwriteRealtimeEvent(
                events = raw.arrayOrEmpty("events").mapNotNull { element ->
                    if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                        element.asString
                    } else {
                        null
                    }
                },
                channels = raw.arrayOrEmpty("channels").mapNotNull { element ->
                    if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
                        element.asString
                    } else {
                        null
                    }
                },
                payload = payload,
                raw = raw
            )
        }.getOrNull()
    }

    private fun realtimeUrl(): String {
        val endpoint = configuration.endpoint.trimEnd('/')
        val websocketEndpoint = when {
            endpoint.startsWith("https://", ignoreCase = true) ->
                "wss://" + endpoint.substringAfter("://")
            endpoint.startsWith("http://", ignoreCase = true) ->
                "ws://" + endpoint.substringAfter("://")
            else -> "wss://$endpoint"
        }

        val query = buildString {
            append("project=")
            append(configuration.projectId.urlEncoded())
            channels.forEach { channel ->
                append("&channels[]=")
                append(channel.urlEncoded())
            }
        }

        return "$websocketEndpoint/realtime?$query"
    }

    private fun cookieHeader(): String? {
        val endpointUrl = configuration.endpoint.toHttpUrlOrNull() ?: return null
        val cookies = cookieJar.loadForRequest(endpointUrl)
        if (cookies.isEmpty()) return null
        return cookies.joinToString("; ") { cookie -> "${cookie.name}=${cookie.value}" }
    }

    private fun String.urlEncoded(): String =
        URLEncoder.encode(this, Charsets.UTF_8.name())

    private companion object {
        private const val RESPONSE_FORMAT = "1.8.0"
        private const val NORMAL_CLOSURE_STATUS = 1000
        private const val RECONNECT_DELAY_MS = 1_000L
    }
}

val AppwriteConfiguration.messagesRealtimeChannel: String
    get() = "tablesdb.$databaseId.tables.$messagesTableId.rows"

val AppwriteConfiguration.threadsRealtimeChannel: String
    get() = "tablesdb.$databaseId.tables.$threadsTableId.rows"

val AppwriteConfiguration.threadParticipantsRealtimeChannel: String
    get() = "tablesdb.$databaseId.tables.$threadParticipantsTableId.rows"

val AppwriteConfiguration.matchesRealtimeChannel: String?
    get() = matchesTableId
        ?.takeIf { it.isNotBlank() }
        ?.let { "tablesdb.$databaseId.tables.$it.rows" }
