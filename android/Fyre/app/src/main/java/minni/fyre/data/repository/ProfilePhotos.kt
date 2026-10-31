package minni.fyre.data.repository

internal suspend fun resolveProfilePhotos(
    desiredUris: List<String>,
    resolveRemote: (String) -> String?,
    upload: suspend (String) -> String?
): List<String> = desiredUris.take(6).map { uri ->
    val id = if (uri.startsWith("https://") || uri.startsWith("http://")) resolveRemote(uri) else upload(uri)
    requireNotNull(id?.takeIf(String::isNotBlank)) { "Impossibile salvare la foto selezionata" }
}
