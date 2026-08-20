package minni.fyre.core.notifications

internal class AccountScopedSeenRegistry(
    private val maxIdentifiersPerAccount: Int = 80
) {
    private val lock = Any()
    private val seenByAccount = mutableMapOf<String, LinkedHashSet<String>>()

    init {
        require(maxIdentifiersPerAccount > 0)
    }

    fun markSeen(accountId: String, identifier: String): Boolean {
        val normalizedAccountId = accountId.trim()
        val normalizedIdentifier = identifier.trim()
        if (normalizedAccountId.isBlank() || normalizedIdentifier.isBlank()) return false

        return synchronized(lock) {
            val identifiers = seenByAccount.getOrPut(normalizedAccountId) { linkedSetOf() }
            if (!identifiers.add(normalizedIdentifier)) {
                return@synchronized false
            }

            while (identifiers.size > maxIdentifiersPerAccount) {
                val iterator = identifiers.iterator()
                iterator.next()
                iterator.remove()
            }
            true
        }
    }

    fun clearAccount(accountId: String) {
        val normalizedAccountId = accountId.trim()
        if (normalizedAccountId.isBlank()) return
        synchronized(lock) {
            seenByAccount.remove(normalizedAccountId)
        }
    }

    fun clearAll() {
        synchronized(lock) {
            seenByAccount.clear()
        }
    }
}

/**
 * Process-local notification deduplication. Match identifiers are deliberately not persisted.
 */
class RealtimeNotificationSeenStore {
    fun markMatchSeen(accountId: String, identifier: String): Boolean =
        Registry.markSeen(accountId, identifier)

    fun clearAccount(accountId: String): Boolean {
        Registry.clearAccount(accountId)
        return true
    }

    fun clearAll(): Boolean {
        Registry.clearAll()
        return true
    }

    private companion object {
        private val Registry = AccountScopedSeenRegistry()
    }
}
