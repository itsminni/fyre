package minni.fyre.data.appwrite

internal object ManageProfilePayload {
    private val serverManagedIdentityFields = setOf("userId", "email")

    fun upsert(fields: Map<String, Any?>): Map<String, Any?> {
        val forbiddenFields = fields.keys.intersect(serverManagedIdentityFields)
        require(forbiddenFields.isEmpty()) {
            "Profile identity is managed by the authenticated server function"
        }
        return LinkedHashMap(fields)
    }

    fun presence(isOnline: Boolean): Map<String, Any?> {
        return linkedMapOf(
            "action" to "presence",
            "online" to isOnline
        )
    }
}
