package com.example.fyre.data.appwrite

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap
import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AppwriteGateway(
    context: Context,
    val configuration: AppwriteConfiguration
) {
    private val appContext = context.applicationContext
    private val contentResolver: ContentResolver = appContext.contentResolver
    private val client = AppwriteHttpClient(appContext, configuration)

    suspend fun fetchCurrentAccount(required: Boolean): JsonObject? {
        return try {
            client.get("/account")
        } catch (api: AppwriteApiException) {
            if (api.isUnauthorized && !required) {
                null
            } else {
                throw api
            }
        }
    }

    suspend fun fetchCurrentAccountId(required: Boolean): String? {
        return fetchCurrentAccount(required)?.stringOrNull("\$id")
    }

    suspend fun createAccount(email: String, password: String, displayName: String) {
        client.post(
            path = "/account",
            body = jsonObject(
                "userId" to randomIdentifier(),
                "email" to email,
                "password" to password,
                "name" to displayName
            )
        )
    }

    suspend fun createEmailSession(email: String, password: String) {
        client.post(
            path = "/account/sessions/email",
            body = jsonObject(
                "email" to email,
                "password" to password
            )
        )
    }

    suspend fun deleteCurrentSession() {
        try {
            client.delete(path = "/account/sessions/current")
        } catch (api: AppwriteApiException) {
            if (!api.isUnauthorized) {
                throw api
            }
        } finally {
            client.clearSession()
        }
    }

    suspend fun executeFunction(functionId: String, payload: Map<String, Any?>): JsonObject {
        return client.executeFunction(functionId, payload)
    }

    suspend fun executeFunctionDirectly(functionUrl: String, payload: Map<String, Any?>): JsonObject {
        return client.executeFunctionDirectly(functionUrl, payload)
    }

    suspend fun getRow(tableId: String, rowId: String): JsonObject {
        return client.get("${tableRowsPath(tableId)}/$rowId")
    }

    suspend fun getRowIfAccessible(tableId: String, rowId: String): JsonObject? {
        return try {
            getRow(tableId, rowId)
        } catch (api: AppwriteApiException) {
            if (api.statusCode == 401 || api.statusCode == 403 || api.statusCode == 404) {
                null
            } else {
                throw api
            }
        }
    }

    suspend fun listRows(tableId: String, queries: List<String> = emptyList()): List<JsonObject> {
        val payload = client.get(path = tableRowsPath(tableId), query = queries)
        return payload.arrayOrEmpty("rows")
            .mapNotNull { if (it.isJsonObject) it.asJsonObject else null }
    }

    suspend fun createRow(
        tableId: String,
        rowId: String,
        data: JsonObject,
        permissions: List<String> = emptyList()
    ) {
        val body = JsonObject().apply {
            addProperty("rowId", rowId)
            add("data", data)
            if (permissions.isNotEmpty()) {
                add("permissions", toJsonArray(permissions))
            }
        }
        client.post(path = tableRowsPath(tableId), body = body)
    }

    suspend fun updateRow(
        tableId: String,
        rowId: String,
        data: JsonObject,
        permissions: List<String> = emptyList()
    ) {
        val body = JsonObject().apply {
            add("data", data)
            if (permissions.isNotEmpty()) {
                add("permissions", toJsonArray(permissions))
            }
        }
        client.patch(path = "${tableRowsPath(tableId)}/$rowId", body = body)
    }

    suspend fun fetchProfileRow(accountId: String): JsonObject? {
        if (accountId.isBlank()) return null

        return try {
            getRow(configuration.profilesTableId, accountId)
        } catch (api: AppwriteApiException) {
            if (api.statusCode != 401 && api.statusCode != 403 && api.statusCode != 404) {
                throw api
            }
            try {
                val rows = listRows(
                    tableId = configuration.profilesTableId,
                    queries = listOf(
                        queryEqual("userId", listOf(accountId)),
                        queryLimit(1)
                    )
                )
                rows.firstOrNull()
            } catch (fallbackApi: AppwriteApiException) {
                if (fallbackApi.statusCode == 401 || fallbackApi.statusCode == 403 || fallbackApi.statusCode == 404) {
                    null
                } else {
                    throw fallbackApi
                }
            }
        }
    }

    suspend fun uploadAvatarFromUri(avatarUri: String): String? {
        return uploadImageToAvatarBucket(avatarUri, fileNamePrefix = "avatar")
    }

    suspend fun uploadProfilePhotoFromUri(photoUri: String): String? {
        return uploadImageToAvatarBucket(photoUri, fileNamePrefix = "profile_photo")
    }

    private suspend fun uploadImageToAvatarBucket(source: String, fileNamePrefix: String): String? {
        val bytes = readBinaryPayload(source)
        if (bytes.isEmpty()) return null

        val mimeType = resolveMimeType(source, fallback = "image/jpeg")
        val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) ?: "jpg"
        val fileId = randomIdentifier()

        client.uploadFile(
            bucketId = configuration.avatarsBucketId,
            fileId = fileId,
            fileName = "${fileNamePrefix}_${System.currentTimeMillis()}.$extension",
            mimeType = mimeType,
            bytes = bytes
        )

        return fileId
    }

    suspend fun uploadChatAttachment(
        threadId: String,
        displayName: String,
        localUri: String,
        mimeType: String
    ): UploadedFile {
        val bucketId = configuration.chatAttachmentsBucketId
            ?: throw AppwriteConfigurationException("Bucket allegati chat non configurato")

        val currentUserId = fetchCurrentAccountId(required = true)
            ?: throw AppwriteConfigurationException("Sessione backend non valida")

        val permissions = listOf(
            "read(\"user:$currentUserId\")",
            "update(\"user:$currentUserId\")",
            "delete(\"user:$currentUserId\")"
        )

        val bytes = readBinaryPayload(localUri)
        val fileId = randomIdentifier()
        val safeName = displayName.ifBlank { "attachment_${System.currentTimeMillis()}" }

        client.uploadFile(
            bucketId = bucketId,
            fileId = fileId,
            fileName = safeName,
            mimeType = mimeType,
            bytes = bytes,
            permissions = permissions
        )

        return UploadedFile(
            fileId = fileId,
            fileName = safeName,
            mimeType = mimeType,
            sizeBytes = bytes.size
        )
    }

    suspend fun readBinaryPayload(source: String): ByteArray = withContext(Dispatchers.IO) {
        val bytesFromUri = runCatching {
            val parsed = Uri.parse(source)
            if (parsed.scheme == "content" || parsed.scheme == "file") {
                contentResolver.openInputStream(parsed)?.use { it.readBytes() }
            } else {
                null
            }
        }.getOrNull()

        if (bytesFromUri != null && bytesFromUri.isNotEmpty()) {
            return@withContext bytesFromUri
        }

        val bytesFromFile = runCatching {
            val file = File(source)
            if (file.exists()) file.readBytes() else null
        }.getOrNull()

        if (bytesFromFile != null && bytesFromFile.isNotEmpty()) {
            return@withContext bytesFromFile
        }

        source.toByteArray()
    }

    fun resolveMimeType(source: String, fallback: String): String {
        val parsed = Uri.parse(source)
        val fromResolver = if (parsed.scheme == "content") contentResolver.getType(parsed) else null
        if (!fromResolver.isNullOrBlank()) {
            return fromResolver
        }

        val extension = MimeTypeMap.getFileExtensionFromUrl(source)
        if (!extension.isNullOrBlank()) {
            val fromExtension = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.lowercase(Locale.ROOT))
            if (!fromExtension.isNullOrBlank()) {
                return fromExtension
            }
        }

        return fallback
    }

    fun avatarUrl(fileId: String?): String? {
        if (fileId.isNullOrBlank()) return null
        return storageViewUrl(configuration.avatarsBucketId, fileId)
    }

    fun attachmentUrl(fileId: String?): String? {
        val bucketId = configuration.chatAttachmentsBucketId
        if (fileId.isNullOrBlank() || bucketId.isNullOrBlank()) return null
        return storageViewUrl(bucketId, fileId)
    }

    fun storageViewUrl(bucketId: String, fileId: String): String {
        return "${normalizedEndpoint()}/storage/buckets/$bucketId/files/$fileId/view?project=${configuration.projectId}"
    }

    fun storageFileIdFromUrl(url: String): String? {
        val marker = "/files/"
        val markerIndex = url.indexOf(marker)
        if (markerIndex == -1) return null

        return url
            .substring(markerIndex + marker.length)
            .substringBefore("/")
            .substringBefore("?")
            .takeIf { it.isNotBlank() }
    }

    fun tableRowsPath(tableId: String): String {
        return "/tablesdb/${configuration.databaseId}/tables/$tableId/rows"
    }

    fun queryEqual(field: String, values: List<String>): String {
        return "{" +
            "\"method\":\"equal\"," +
            "\"attribute\":\"$field\"," +
            "\"values\":${toJsonArray(values)}" +
            "}"
    }

    fun queryOrderAsc(field: String): String {
        return "{" +
            "\"method\":\"orderAsc\"," +
            "\"attribute\":\"$field\"" +
            "}"
    }

    fun queryLimit(value: Int): String {
        return "{" +
            "\"method\":\"limit\"," +
            "\"values\":[${value.coerceAtLeast(1)}]" +
            "}"
    }

    fun normalizeBirthDate(value: String): String {
        val trimmed = value.trim()
        if (trimmed.isBlank()) return ""

        val parsed = try {
            LocalDate.parse(trimmed, DateTimeFormatter.ofPattern("dd/MM/yyyy"))
        } catch (_: DateTimeParseException) {
            try {
                LocalDate.parse(trimmed)
            } catch (_: DateTimeParseException) {
                null
            }
        }

        return parsed?.atStartOfDay()?.toInstant(ZoneOffset.UTC)?.toString() ?: trimmed
    }

    fun nowIso(): String = Instant.now().toString()

    fun randomIdentifier(): String = UUID.randomUUID().toString().replace("-", "")

    fun clearSession() {
        client.clearSession()
    }

    private fun normalizedEndpoint(): String {
        return if (configuration.endpoint.endsWith('/')) {
            configuration.endpoint.dropLast(1)
        } else {
            configuration.endpoint
        }
    }
}

data class UploadedFile(
    val fileId: String,
    val fileName: String,
    val mimeType: String,
    val sizeBytes: Int
)

internal fun JsonObject.arrayOrEmpty(key: String): JsonArray {
    val element = this[key] ?: return JsonArray()
    return if (element.isJsonArray) element.asJsonArray else JsonArray()
}

internal fun toJsonArray(values: List<String>): JsonArray {
    return JsonArray().apply {
        values.filter { it.isNotBlank() }.forEach { add(it) }
    }
}

internal fun JsonElement.asDoubleOrNull(): Double? {
    return runCatching {
        if (isJsonPrimitive && asJsonPrimitive.isNumber) {
            asDouble
        } else if (isJsonPrimitive && asJsonPrimitive.isString) {
            asString.toDouble()
        } else {
            null
        }
    }.getOrNull()
}
