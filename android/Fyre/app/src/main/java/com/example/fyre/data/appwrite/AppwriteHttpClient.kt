package com.example.fyre.data.appwrite

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class AppwriteHttpClient(
    context: Context,
    private val configuration: AppwriteConfiguration,
    private val gson: Gson = Gson()
) {

    private val cookieJar = PersistentCookieJar(context.applicationContext)

    private val client = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(DEFAULT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()

    suspend fun get(path: String, query: List<String> = emptyList()): JsonObject {
        return requestJson(
            method = "GET",
            path = path,
            body = null,
            queryItems = query
        )
    }

    suspend fun post(path: String, body: JsonObject?): JsonObject {
        return requestJson(
            method = "POST",
            path = path,
            body = body
        )
    }

    suspend fun patch(path: String, body: JsonObject?): JsonObject {
        return requestJson(
            method = "PATCH",
            path = path,
            body = body
        )
    }

    suspend fun delete(path: String, expectedStatusCodes: Set<Int> = setOf(204)): JsonObject {
        return requestJson(
            method = "DELETE",
            path = path,
            body = null,
            expectedStatusCodes = expectedStatusCodes
        )
    }

    suspend fun uploadFile(
        bucketId: String,
        fileId: String,
        fileName: String,
        mimeType: String,
        bytes: ByteArray,
        permissions: List<String> = emptyList()
    ): JsonObject {
        return withContext(Dispatchers.IO) {
            val multipartBuilder = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("fileId", fileId)
                .addFormDataPart(
                    "file",
                    fileName,
                    bytes.toRequestBody(mimeType.toMediaType())
                )

            for (permission in permissions) {
                multipartBuilder.addFormDataPart("permissions[]", permission)
            }

            val request = Request.Builder()
                .url("${normalizedEndpoint()}/storage/buckets/$bucketId/files")
                .header("X-Appwrite-Project", configuration.projectId)
                .header("X-Appwrite-Response-Format", RESPONSE_FORMAT)
                .post(multipartBuilder.build())
                .build()

            executeRequest(request, expectedStatusCodes = setOf(201))
        }
    }

    suspend fun fetchBinary(path: String): ByteArray {
        return withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url("${normalizedEndpoint()}$path")
                .header("X-Appwrite-Project", configuration.projectId)
                .header("X-Appwrite-Response-Format", RESPONSE_FORMAT)
                .get()
                .build()

            try {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        val payload = parseJsonPayload(response.body?.string().orEmpty())
                        throw AppwriteApiException(
                            statusCode = response.code,
                            responseType = payload.stringOrNull("type"),
                            message = payload.stringOrNull("message")
                                ?: "Request failed with status ${response.code}"
                        )
                    }

                    return@use response.body?.bytes() ?: ByteArray(0)
                }
            } catch (io: IOException) {
                throw AppwriteNetworkException(io)
            }
        }
    }

    suspend fun executeFunction(functionId: String, payload: Map<String, Any?>): JsonObject {
        val execution = post(
            path = "/functions/$functionId/executions",
            body = jsonObject(
                "body" to gson.toJson(payload),
                "async" to false
            )
        )

        val executionId = execution.stringOrNull("\$id")
            ?: throw AppwriteDecodingException(
                IllegalStateException("Missing function execution id")
            )

        var lastExecution = execution
        repeat(MAX_EXECUTION_POLLS) { pollIndex ->
            val status = lastExecution.stringOrNull("status")?.lowercase()
            if (status != "processing") {
                return@repeat
            }
            if (pollIndex < MAX_EXECUTION_POLLS - 1) {
                delay(EXECUTION_POLL_DELAY_MS)
                lastExecution = get("/functions/$functionId/executions/$executionId")
            }
        }

        return decodeExecutionResponse(lastExecution)
    }

    suspend fun executeFunctionDirectly(functionUrl: String, payload: Map<String, Any?>): JsonObject {
        val directUrl = normalizedFunctionUrl(functionUrl)
        val currentUserId = fetchCurrentAccountIdForFunction()
        val payloadUserId = payload["currentUserId"]?.toString()?.trim().orEmpty()
        if (payloadUserId.isNotBlank() && payloadUserId != currentUserId) {
            throw AppwriteApiException(
                statusCode = 403,
                responseType = "user_mismatch",
                message = "Authenticated user mismatch"
            )
        }
        val jwt = post(
            path = "/account/jwts",
            body = jsonObject("duration" to 900)
        ).stringOrNull("jwt")
            ?: throw AppwriteDecodingException(
                IllegalStateException("Missing Appwrite function JWT")
            )

        return withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(directUrl)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("x-appwrite-user-jwt", jwt)
                .header("x-appwrite-user-id", currentUserId)
                .post(gson.toJson(payload).toRequestBody(JSON_MEDIA_TYPE))
                .build()

            executeRequest(request, expectedStatusCodes = emptySet())
        }
    }

    private suspend fun fetchCurrentAccountIdForFunction(): String {
        val account = get("/account")
        return account.stringOrNull("\$id")
            ?: throw AppwriteDecodingException(
                IllegalStateException("Missing current account id")
            )
    }

    fun clearSession() {
        cookieJar.clear()
    }

    private suspend fun requestJson(
        method: String,
        path: String,
        body: JsonObject?,
        queryItems: List<String> = emptyList(),
        expectedStatusCodes: Set<Int> = emptySet()
    ): JsonObject {
        return withContext(Dispatchers.IO) {
            val urlBuilder = StringBuilder()
                .append(normalizedEndpoint())
                .append(path)

            if (queryItems.isNotEmpty()) {
                queryItems.forEachIndexed { index, value ->
                    urlBuilder
                        .append(if (index == 0) "?" else "&")
                        .append("queries[]=")
                        .append(java.net.URLEncoder.encode(value, Charsets.UTF_8.name()))
                }
            }

            val requestBuilder = Request.Builder()
                .url(urlBuilder.toString())
                .header("X-Appwrite-Project", configuration.projectId)
                .header("X-Appwrite-Response-Format", RESPONSE_FORMAT)

            when (method) {
                "GET" -> requestBuilder.get()
                "DELETE" -> requestBuilder.delete()
                else -> {
                    val payload = (body ?: JsonObject()).toString()
                    requestBuilder.method(
                        method,
                        payload.toRequestBody(JSON_MEDIA_TYPE)
                    )
                }
            }

            executeRequest(
                request = requestBuilder.build(),
                expectedStatusCodes = expectedStatusCodes
            )
        }
    }

    private fun executeRequest(
        request: Request,
        expectedStatusCodes: Set<Int>
    ): JsonObject {
        try {
            client.newCall(request).execute().use { response ->
                val payload = parseJsonPayload(response.body?.string().orEmpty())
                val ok = if (expectedStatusCodes.isEmpty()) {
                    response.code in 200..299
                } else {
                    expectedStatusCodes.contains(response.code)
                }

                if (!ok) {
                    throw AppwriteApiException(
                        statusCode = response.code,
                        responseType = payload.stringOrNull("type"),
                        message = payload.stringOrNull("message")
                            ?: payload.stringOrNull("messageKey")
                            ?: "Request failed with status ${response.code}"
                    )
                }

                return payload
            }
        } catch (io: IOException) {
            throw AppwriteNetworkException(io)
        }
    }

    private fun decodeExecutionResponse(execution: JsonObject): JsonObject {
        val statusCode = execution.intOrNull("responseStatusCode")
            ?: execution.intOrNull("statusCode")
            ?: 200

        val bodyElement = execution["responseBody"] ?: execution["response"]
        val payload = when {
            bodyElement == null || bodyElement.isJsonNull -> JsonObject()
            bodyElement.isJsonObject -> bodyElement.asJsonObject
            bodyElement.isJsonPrimitive && bodyElement.asJsonPrimitive.isString -> {
                parseJsonPayload(bodyElement.asString)
            }
            else -> JsonObject()
        }

        if (statusCode !in 200..299) {
            throw AppwriteApiException(
                statusCode = statusCode,
                responseType = payload.stringOrNull("type"),
                message = payload.stringOrNull("message")
                    ?: payload.stringOrNull("messageKey")
                    ?: "Function execution failed"
            )
        }

        return payload
    }

    private fun parseJsonPayload(raw: String): JsonObject {
        if (raw.isBlank()) {
            return JsonObject()
        }

        return try {
            val parsed = JsonParser.parseString(raw)
            when {
                parsed.isJsonObject -> parsed.asJsonObject
                else -> JsonObject().apply { addProperty("value", raw) }
            }
        } catch (_: Throwable) {
            JsonObject().apply { addProperty("message", raw) }
        }
    }

    private fun normalizedFunctionUrl(rawUrl: String): HttpUrl {
        val withScheme = if (rawUrl.contains("://")) {
            rawUrl
        } else {
            "https://$rawUrl"
        }
        val httpUrl = withScheme.toHttpUrlOrNull()
            ?: throw AppwriteConfigurationException("Dominio funzione Appwrite non valido")

        if (httpUrl.queryParameter("type") != null) {
            return httpUrl
        }

        return httpUrl.newBuilder()
            .addQueryParameter("type", "json")
            .build()
    }

    private fun normalizedEndpoint(): String {
        return if (configuration.endpoint.endsWith("/")) {
            configuration.endpoint.dropLast(1)
        } else {
            configuration.endpoint
        }
    }

    private companion object {
        private const val RESPONSE_FORMAT = "1.8.0"
        private const val DEFAULT_TIMEOUT_SECONDS = 35L
        private const val EXECUTION_POLL_DELAY_MS = 250L
        private const val MAX_EXECUTION_POLLS = 8
        private val JSON_MEDIA_TYPE = "application/json".toMediaType()
    }
}

internal fun jsonObject(vararg pairs: Pair<String, Any?>): JsonObject {
    val objectValue = JsonObject()
    for ((key, value) in pairs) {
        val element = when (value) {
            null -> null
            is JsonElement -> value
            is Number -> com.google.gson.JsonPrimitive(value)
            is Boolean -> com.google.gson.JsonPrimitive(value)
            else -> com.google.gson.JsonPrimitive(value.toString())
        }

        if (element == null) {
            objectValue.add(key, null)
        } else {
            objectValue.add(key, element)
        }
    }
    return objectValue
}

internal fun JsonObject.stringOrNull(key: String): String? {
    val element = this[key] ?: return null
    if (!element.isJsonPrimitive || !element.asJsonPrimitive.isString) {
        return null
    }
    val value = element.asString.trim()
    return if (value.isEmpty()) null else value
}

internal fun JsonObject.intOrNull(key: String): Int? {
    val element = this[key] ?: return null
    return runCatching {
        if (element.isJsonPrimitive && element.asJsonPrimitive.isNumber) {
            element.asInt
        } else if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
            element.asString.toInt()
        } else {
            null
        }
    }.getOrNull()
}

internal fun JsonObject.booleanOrNull(key: String): Boolean? {
    val element = this[key] ?: return null
    return runCatching {
        if (element.isJsonPrimitive && element.asJsonPrimitive.isBoolean) {
            element.asBoolean
        } else if (element.isJsonPrimitive && element.asJsonPrimitive.isString) {
            when (element.asString.trim().lowercase()) {
                "true" -> true
                "false" -> false
                else -> null
            }
        } else {
            null
        }
    }.getOrNull()
}
