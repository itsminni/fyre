package minni.fyre.data.appwrite

import java.io.ByteArrayInputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class UploadPayloadTest {
    @Test
    fun `file at size limit is read intact and closed`() {
        val bytes = byteArrayOf(1, 2, 3, 4)
        var closed = false
        val stream = object : ByteArrayInputStream(bytes) {
            override fun close() { closed = true }
        }
        assertArrayEquals(bytes, readUploadPayload(4) { stream })
        assertTrue(closed)
    }

    @Test
    fun `oversized stream stops after limit plus one byte and closes`() {
        var consumed = 0
        var closed = false
        val stream = object : InputStream() {
            override fun read(): Int { consumed++; return 1 }
            override fun close() { closed = true }
        }
        assertThrows(AppwriteValidationException::class.java) {
            readUploadPayload(10) { stream }
        }
        assertEquals(11, consumed)
        assertTrue(closed)
    }

    @Test
    fun `unavailable empty and inaccessible files report validation errors`() {
        val sources: List<() -> InputStream?> = listOf(
            { null },
            { ByteArrayInputStream(byteArrayOf()) },
            { throw FileNotFoundException("missing") },
            { throw SecurityException("denied") }
        )
        for (source in sources) {
            assertThrows(AppwriteValidationException::class.java) {
                readUploadPayload(10, source)
            }
        }
    }

    @Test
    fun `mid-stream failure closes the file and never returns partial content`() {
        var closed = false
        val stream = object : InputStream() {
            override fun read(): Int = throw IOException("read failed")
            override fun close() { closed = true }
        }
        assertThrows(AppwriteValidationException::class.java) {
            readUploadPayload(10) { stream }
        }
        assertTrue(closed)
    }
}
