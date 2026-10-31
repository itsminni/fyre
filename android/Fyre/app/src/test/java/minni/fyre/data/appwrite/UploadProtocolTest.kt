package minni.fyre.data.appwrite

import com.google.gson.JsonObject
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class UploadProtocolTest {
    @Test fun `large files use bounded ranges and the same upload ID`() = runTest {
        val requests = mutableListOf<Pair<UploadChunk, String?>>()
        val progress = mutableListOf<Float>()
        uploadInChunks("file", APPWRITE_CHUNK_BYTES * 2 + 3, progress::add) { chunk, id ->
            requests += chunk to id
            JsonObject().apply { addProperty("\$id", "file"); addProperty("chunksTotal", 3); addProperty("chunksUploaded", requests.size) }
        }
        assertEquals(listOf(null, "file", "file"), requests.map { it.second })
        assertEquals("bytes 0-5242879/10485763", requests.first().first.contentRange)
        assertEquals("bytes 10485760-10485762/10485763", requests.last().first.contentRange)
        assertEquals(1f, progress.last())
    }

    @Test fun `an incomplete final response is never accepted as success`() = runTest {
        val error = runCatching { uploadInChunks("file", 8) { _, _ ->
            JsonObject().apply { addProperty("\$id", "file"); addProperty("chunksTotal", 2); addProperty("chunksUploaded", 1) }
        } }.exceptionOrNull()
        assertTrue(error is IllegalStateException)
    }

    @Test fun `retry resumes after the acknowledged chunk`() = runTest {
        val sent = mutableListOf<UploadChunk>()
        uploadInChunks("file", APPWRITE_CHUNK_BYTES + 4, initialOffset = APPWRITE_CHUNK_BYTES) { chunk, id ->
            assertEquals("file", id)
            sent += chunk
            JsonObject().apply { addProperty("\$id", "file"); addProperty("chunksTotal", 2); addProperty("chunksUploaded", 2) }
        }
        assertEquals(1, sent.size)
        assertEquals(APPWRITE_CHUNK_BYTES, sent.single().offset)
    }
}
