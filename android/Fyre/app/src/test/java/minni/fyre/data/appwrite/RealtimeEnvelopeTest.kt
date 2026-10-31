package minni.fyre.data.appwrite

import org.junit.Assert.*
import org.junit.Test

class RealtimeEnvelopeTest {
    @Test fun `Appwrite event envelopes expose the actual row payload`() {
        val event = parseRealtimeEvent("""{"type":"event","data":{"events":["tablesdb.db.tables.messages.rows.id.create"],"channels":["messages"],"payload":{"threadId":"thread"}}}""")!!
        assertTrue(event.isCreate)
        assertEquals("thread", event.stringValue("threadId"))
        assertEquals(listOf("messages"), event.channels)
    }
    @Test fun `connection events reconcile without generating a notification mutation`() {
        val event = parseRealtimeEvent("""{"type":"connected","data":{}}""")!!
        assertTrue(event.isReconnect)
        assertFalse(event.isMutation)
        assertNull(parseRealtimeEvent("invalid"))
    }
}
