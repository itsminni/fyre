package minni.fyre.data.appwrite

import com.google.gson.JsonObject
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

internal const val APPWRITE_CHUNK_BYTES = 5 * 1024 * 1024

internal data class UploadChunk(val offset: Int, val length: Int, val total: Int) {
    val contentRange: String get() = "bytes $offset-${offset + length - 1}/$total"
}

internal suspend fun uploadInChunks(
    fileId: String,
    totalBytes: Int,
    onProgress: (Float) -> Unit = {},
    initialOffset: Int = 0,
    initialResult: JsonObject = JsonObject(),
    send: suspend (UploadChunk, String?) -> JsonObject
): JsonObject {
    require(totalBytes > 0)
    require(initialOffset in 0..totalBytes)
    require(initialOffset == totalBytes || initialOffset % APPWRITE_CHUNK_BYTES == 0)
    var offset = initialOffset
    var result = initialResult
    onProgress(offset.toFloat() / totalBytes)
    while (offset < totalBytes) {
        currentCoroutineContext().ensureActive()
        val chunk = UploadChunk(offset, minOf(APPWRITE_CHUNK_BYTES, totalBytes - offset), totalBytes)
        result = send(chunk, fileId.takeIf { offset > 0 })
        check(result.stringOrNull("\$id") == fileId) { "Risposta upload non valida" }
        offset += chunk.length
        onProgress(offset.toFloat() / totalBytes)
    }
    val total = result.intOrNull("chunksTotal")
    val uploaded = result.intOrNull("chunksUploaded")
    check(total == null || total == uploaded) { "Upload incompleto" }
    return result
}
