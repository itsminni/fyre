package minni.fyre.core.notifications
import org.junit.Assert.*
import org.junit.Test
class NotificationDestinationTest {
    @Test fun `notification cannot open a destination for a different account`() {
        val target = NotificationDestination("alice", "chat", "thread-1")
        assertTrue(target.isFor("alice"))
        assertFalse(target.isFor("bob"))
        assertFalse(target.isFor(null))
        assertFalse(target.copy(kind = "anything").isFor("alice"))
        assertFalse(target.copy(resourceId = "").isFor("alice"))
    }
}
