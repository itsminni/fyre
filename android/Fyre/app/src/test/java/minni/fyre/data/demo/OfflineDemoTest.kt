package minni.fyre.data.demo

import kotlinx.coroutines.test.runTest
import minni.fyre.data.model.hasCompleteProfile
import minni.fyre.messages.data.MessageSendRequest
import minni.fyre.events.model.EventUserState
import org.junit.Assert.*
import org.junit.Test

class OfflineDemoTest {
    @Test fun `demo is immediately usable and logs out locally`() = runTest {
        val demo = OfflineDemo()
        assertTrue(demo.auth.restoreSession().getOrThrow()!!.hasCompleteProfile())
        demo.auth.logout().getOrThrow()
        assertNull(demo.auth.restoreSession().getOrThrow())
        demo.auth.authenticateUser("demo@example.invalid", "not-a-real-password").getOrThrow()
        assertNotNull(demo.auth.restoreSession().getOrThrow())
    }
    @Test fun `a like creates a chat and retrying the same send adds one message`() = runTest {
        val demo = OfflineDemo()
        val profile = demo.discovery.loadProfiles().getOrThrow().first()
        val outcome = demo.discovery.submitDecision(profile, true).getOrThrow()
        assertTrue(outcome.matched)
        val id = requireNotNull(outcome.threadId)
        demo.chat.ensureThread(id).getOrThrow()
        val request = MessageSendRequest(id, text = "Local hello")
        assertEquals(demo.chat.sendMessage(request).getOrThrow(), demo.chat.sendMessage(request).getOrThrow())
        assertEquals(1, demo.chat.getMessages(id).getOrThrow().size)
        assertFalse(demo.discovery.loadProfiles().getOrThrow().any { it.id == profile.id })
    }
    @Test fun `demo history has three pages and can reach its first message`() = runTest {
        val demo = OfflineDemo()
        val first = demo.chat.getMessagePage("demo-chat").getOrThrow()
        val second = demo.chat.getMessagePage("demo-chat", first.nextCursor).getOrThrow()
        val third = demo.chat.getMessagePage("demo-chat", second.nextCursor).getOrThrow()
        assertEquals(120, (third.messages + second.messages + first.messages).distinctBy { it.id }.size)
        assertEquals("demo-history-1", third.messages.first().id)
        assertNull(third.nextCursor)
    }
    @Test fun `join and cancellation update only the local event and preserve counts`() = runTest {
        val demo = OfflineDemo()
        val event = demo.eventRepository.getEventsForUser(OfflineDemo.ACCOUNT_ID, "Alex").getOrThrow().first()
        repeat(2) { demo.eventRepository.joinEvent(event.id, OfflineDemo.ACCOUNT_ID, "Alex").getOrThrow() }
        val joined = demo.eventRepository.getEventsForUser(OfflineDemo.ACCOUNT_ID, "Alex").getOrThrow().first()
        assertEquals(event.registeredCount + 1, joined.registeredCount)
        assertEquals(EventUserState.Registered, joined.userState)
        demo.eventRepository.cancelEvent(event.id, OfflineDemo.ACCOUNT_ID).getOrThrow()
        assertEquals(event.registeredCount, demo.eventRepository.getEventsForUser(OfflineDemo.ACCOUNT_ID, "Alex").getOrThrow().first().registeredCount)
        assertEquals(EventUserState.NotRegistered, OfflineDemo().eventRepository.getEventsForUser(OfflineDemo.ACCOUNT_ID, "Alex").getOrThrow().first().userState)
    }

    @Test fun `history reports explicit cancellation and never guesses attendance from a past date`() = runTest {
        val event = OfflineDemo().eventRepository.getEventsForUser(OfflineDemo.ACCOUNT_ID, "Alex").getOrThrow().first()
        assertEquals(minni.fyre.account.model.EventHistoryStatus.Cancelled,
            minni.fyre.account.presentation.eventHistoryStatus(event.copy(ownRegistrationStatus = "cancelled")))
        assertEquals(minni.fyre.account.model.EventHistoryStatus.Registered,
            minni.fyre.account.presentation.eventHistoryStatus(event.copy(userState = EventUserState.Registered,
                startsAt = java.time.Instant.EPOCH)))
    }

    @Test fun `demo administrators update participant states without a backend`() = runTest {
        val demo = OfflineDemo()
        val event = demo.eventRepository.getEventsForUser(OfflineDemo.ACCOUNT_ID, "Alex").getOrThrow().first()
        assertEquals(minni.fyre.events.model.EventUserRole.Admin, event.userRole)
        val person = event.participants.first()
        demo.eventRepository.adminSetParticipantStatus(event.id, person.id, person.registrationId,
            minni.fyre.events.model.RegistrationStatus.Waitlist).getOrThrow()
        val updated = demo.eventRepository.getEventsForUser(OfflineDemo.ACCOUNT_ID, "Alex").getOrThrow().first()
        assertEquals(event.registeredCount - 1, updated.registeredCount)
        assertEquals(1, updated.waitingListCount)
    }
}
