package minni.fyre.data.appwrite

sealed class AppwriteException(
    message: String,
    cause: Throwable? = null
) : Exception(message, cause)

class AppwriteApiException(
    val statusCode: Int,
    val responseType: String?,
    message: String
) : AppwriteException(message) {
    val isUnauthorized: Boolean
        get() = statusCode == 401
}

class AppwriteNetworkException(cause: Throwable) : AppwriteException(
    message = "Errore di rete durante la comunicazione con il backend",
    cause = cause
)

class AppwriteConfigurationException(message: String) : AppwriteException(message)

class AppwriteDecodingException(cause: Throwable) : AppwriteException(
    message = "Risposta backend non valida",
    cause = cause
)

class AppwriteValidationException(message: String) : AppwriteException(message)