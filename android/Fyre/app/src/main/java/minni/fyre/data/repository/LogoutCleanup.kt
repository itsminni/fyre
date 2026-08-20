package minni.fyre.data.repository

import kotlinx.coroutines.CancellationException

internal suspend fun performLogoutWithLocalCleanup(
    remoteLogout: suspend () -> Unit,
    clearHttpSession: () -> Unit,
    clearLocalData: () -> Unit
): Result<Unit> {
    var failure: Throwable? = null

    try {
        remoteLogout()
    } catch (throwable: Throwable) {
        failure = throwable
    }

    listOf(clearHttpSession, clearLocalData).forEach { cleanup ->
        try {
            cleanup()
        } catch (throwable: Throwable) {
            val primaryFailure = failure
            if (primaryFailure == null) {
                failure = throwable
            } else if (primaryFailure !== throwable) {
                primaryFailure.addSuppressed(throwable)
            }
        }
    }

    val throwable = failure
    if (throwable != null) {
        if (throwable is CancellationException) {
            throw throwable
        }
        return Result.failure(throwable)
    }
    return Result.success(Unit)
}
