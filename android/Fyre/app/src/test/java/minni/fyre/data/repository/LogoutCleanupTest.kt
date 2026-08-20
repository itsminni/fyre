package minni.fyre.data.repository

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class LogoutCleanupTest {
    @Test
    fun `session and cache are cleared when remote logout fails`() = runTest {
        val remoteFailure = IllegalStateException("remote delete failed")
        val calls = mutableListOf<String>()

        val result = performLogoutWithLocalCleanup(
            remoteLogout = {
                calls += "remote"
                throw remoteFailure
            },
            clearHttpSession = { calls += "session" },
            clearLocalData = { calls += "cache" }
        )

        assertTrue(result.isFailure)
        assertSame(remoteFailure, result.exceptionOrNull())
        assertEquals(listOf("remote", "session", "cache"), calls)
    }

    @Test
    fun `cache cleanup still runs if session cleanup fails`() = runTest {
        val sessionFailure = IllegalStateException("session clear failed")
        var cacheCleared = false

        val result = performLogoutWithLocalCleanup(
            remoteLogout = {},
            clearHttpSession = { throw sessionFailure },
            clearLocalData = { cacheCleared = true }
        )

        assertTrue(cacheCleared)
        assertSame(sessionFailure, result.exceptionOrNull())
    }

    @Test
    fun `cleanup failures are retained without hiding the remote failure`() = runTest {
        val remoteFailure = IllegalStateException("remote")
        val sessionFailure = IllegalStateException("session")
        val cacheFailure = IllegalStateException("cache")

        val result = performLogoutWithLocalCleanup(
            remoteLogout = { throw remoteFailure },
            clearHttpSession = { throw sessionFailure },
            clearLocalData = { throw cacheFailure }
        )

        assertSame(remoteFailure, result.exceptionOrNull())
        assertEquals(listOf(sessionFailure, cacheFailure), remoteFailure.suppressed.toList())
    }

    @Test
    fun `cancellation is rethrown only after local cleanup`() = runTest {
        val cancellation = CancellationException("cancelled")
        val calls = mutableListOf<String>()

        try {
            performLogoutWithLocalCleanup(
                remoteLogout = { throw cancellation },
                clearHttpSession = { calls += "session" },
                clearLocalData = { calls += "cache" }
            )
            throw AssertionError("Expected cancellation")
        } catch (thrown: CancellationException) {
            assertSame(cancellation, thrown)
        }

        assertEquals(listOf("session", "cache"), calls)
    }
}
