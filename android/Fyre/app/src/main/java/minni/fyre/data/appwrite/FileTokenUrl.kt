package minni.fyre.data.appwrite

import java.net.URI
import java.util.Locale

internal fun tokenizedFileViewUrl(value: String?): String? {
    val trimmed = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    return runCatching {
        val uri = URI(trimmed)
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        val host = uri.host
            ?.removePrefix("[")
            ?.removeSuffix("]")
            ?.lowercase(Locale.ROOT)
        val secureTransport = scheme == "https" || (scheme == "http" && isLoopbackHost(host))
        val hasToken = uri.rawQuery
            ?.split('&')
            ?.any { queryPart ->
                val separator = queryPart.indexOf('=')
                separator > 0 &&
                    queryPart.substring(0, separator) == "token" &&
                    queryPart.substring(separator + 1).isNotBlank()
            } == true

        trimmed.takeIf {
            uri.isAbsolute &&
                !host.isNullOrBlank() &&
                uri.rawUserInfo == null &&
                uri.rawFragment == null &&
                secureTransport &&
                hasToken
        }
    }.getOrNull()
}

private fun isLoopbackHost(host: String?): Boolean {
    if (host == null) return false
    if (host == "localhost" || host == "::1") return true

    val octets = host.split('.')
    return octets.size == 4 &&
        octets.first() == "127" &&
        octets.all { octet ->
            octet.isNotEmpty() && octet.length <= 3 &&
                octet.all(Char::isDigit) && (octet.toIntOrNull() ?: 256) <= 255
        }
}
