package minni.fyre.data.appwrite

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream

internal const val MAX_AVATAR_UPLOAD_BYTES = 10 * 1024 * 1024
internal const val MAX_CHAT_UPLOAD_BYTES = 20 * 1024 * 1024

internal fun readUploadPayload(maximumBytes: Int, openStream: () -> InputStream?): ByteArray {
    require(maximumBytes in 1 until Int.MAX_VALUE)
    try {
        val input = openStream()
            ?: throw AppwriteValidationException("Impossibile leggere il file selezionato")
        return input.use { stream ->
            val output = ByteArrayOutputStream(minOf(DEFAULT_BUFFER_SIZE, maximumBytes))
            val buffer = ByteArray(minOf(DEFAULT_BUFFER_SIZE, maximumBytes + 1))
            while (true) {
                val count = stream.read(buffer, 0, minOf(buffer.size, maximumBytes - output.size() + 1))
                if (count == -1) break
                if (output.size() + count > maximumBytes) {
                    throw AppwriteValidationException("Il file supera la dimensione massima consentita")
                }
                output.write(buffer, 0, count)
            }
            if (output.size() == 0) {
                throw AppwriteValidationException("Il file selezionato è vuoto")
            }
            output.toByteArray()
        }
    } catch (_: IOException) {
        throw AppwriteValidationException("Impossibile leggere il file selezionato")
    } catch (_: SecurityException) {
        throw AppwriteValidationException("Accesso al file selezionato non consentito")
    }
}
