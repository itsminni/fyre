package minni.fyre.data.appwrite

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AppwritePrivateMediaStore(
    context: Context,
    private val gateway: AppwriteGateway
) {
    private val appContext = context.applicationContext

    suspend fun materializeForExternalOpen(source: String, displayName: String): Uri {
        val normalizedSource = source.trim()
        require(normalizedSource.isNotBlank()) { "Sorgente allegato non disponibile" }

        val parsed = Uri.parse(normalizedSource)
        if (parsed.scheme == "content") return parsed

        val localFile = when (parsed.scheme) {
            "http", "https" -> cacheRemoteFile(normalizedSource, displayName)
            "file" -> parsed.path?.let(::File)
            null, "" -> File(normalizedSource)
            else -> null
        } ?: throw AppwriteConfigurationException("Sorgente allegato non supportata")

        require(localFile.exists() && localFile.isFile) { "Allegato locale non disponibile" }
        val shareableFile = if (localFile.isInside(cacheDirectory(appContext))) {
            localFile
        } else {
            copyLocalFileToPrivateCache(localFile, displayName)
        }
        return FileProvider.getUriForFile(
            appContext,
            "${appContext.packageName}.private-files",
            shareableFile
        )
    }

    private suspend fun cacheRemoteFile(source: String, displayName: String): File = withContext(Dispatchers.IO) {
        val bytes = gateway.downloadPrivateMedia(source)
        require(bytes.isNotEmpty()) { "Allegato remoto vuoto" }

        val cacheDirectory = cacheDirectory(appContext).apply { mkdirs() }
        require(cacheDirectory.isDirectory) { "Cache allegati non disponibile" }
        val target = File(
            cacheDirectory,
            "${stableSourcePrefix(source)}_${safePrivateAttachmentFileName(displayName)}"
        )
        val temporary = File.createTempFile("download_", ".tmp", cacheDirectory)
        try {
            temporary.writeBytes(bytes)
            if (target.exists() && !target.delete()) {
                throw IllegalStateException("Impossibile aggiornare la cache allegato")
            }
            if (!temporary.renameTo(target)) {
                temporary.copyTo(target, overwrite = true)
                temporary.delete()
            }
        } finally {
            if (temporary.exists()) temporary.delete()
        }
        target
    }

    private suspend fun copyLocalFileToPrivateCache(source: File, displayName: String): File =
        withContext(Dispatchers.IO) {
            val cacheDirectory = cacheDirectory(appContext).apply { mkdirs() }
            require(cacheDirectory.isDirectory) { "Cache allegati non disponibile" }
            val target = File(
                cacheDirectory,
                "local_${stableSourcePrefix(source.absolutePath)}_${safePrivateAttachmentFileName(displayName)}"
            )
            source.copyTo(target, overwrite = true)
            target
        }

    companion object {
        private const val CacheDirectoryName = "private_chat_attachments"

        fun clearCache(context: Context): Boolean {
            val directory = cacheDirectory(context.applicationContext)
            return !directory.exists() || directory.deleteRecursively()
        }

        private fun cacheDirectory(context: Context): File = File(context.cacheDir, CacheDirectoryName)
    }
}

private fun File.isInside(directory: File): Boolean {
    val directoryPath = directory.canonicalFile.toPath()
    return canonicalFile.toPath().startsWith(directoryPath)
}

internal fun safePrivateAttachmentFileName(displayName: String): String {
    val normalized = displayName
        .substringAfterLast('/')
        .substringAfterLast('\\')
        .replace(Regex("[^A-Za-z0-9._-]"), "_")
        .trim('.', '_')
        .take(96)
    return normalized.ifBlank { "attachment.bin" }
}

private fun stableSourcePrefix(source: String): String {
    return MessageDigest.getInstance("SHA-256")
        .digest(source.toByteArray(Charsets.UTF_8))
        .take(12)
        .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
}
