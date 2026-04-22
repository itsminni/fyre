package com.example.fyre.messages.data

import com.example.fyre.messages.model.AttachmentType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MockMessagesRepositoryTest {

    @Before
    fun setup() {
        MockMessagesRepository.resetLocalState()
    }

    @Test
    fun mark_as_read_sets_unread_count_to_zero() {
        val before = MockMessagesRepository.getThreads().first { it.id == "thread_p2" }
        assertTrue(before.unreadCount > 0)

        MockMessagesRepository.markAsRead("thread_p2")

        val after = MockMessagesRepository.getThreads().first { it.id == "thread_p2" }
        assertEquals(0, after.unreadCount)
    }

    @Test
    fun send_message_updates_last_message_preview() {
        MockMessagesRepository.sendMessage("thread_p4", "Messaggio di test")

        val thread = MockMessagesRepository.getThreads().first { it.id == "thread_p4" }
        val lastMessage = MockMessagesRepository.getMessages("thread_p4").last()

        assertEquals("Messaggio di test", thread.lastMessage)
        assertEquals("Messaggio di test", lastMessage.text)
    }

    @Test
    fun send_attachment_message_creates_attachment_payload() {
        MockMessagesRepository.sendAttachmentMessage(
            threadId = "thread_p4",
            type = AttachmentType.Image,
            displayName = "foto.jpg",
            localUri = "local://image/test",
            mimeType = "image/jpeg"
        )

        val last = MockMessagesRepository.getMessages("thread_p4").last()
        assertTrue(last.attachments.isNotEmpty())
        assertEquals(AttachmentType.Image, last.attachments.first().type)
    }

    @Test
    fun send_voice_message_creates_voice_payload() {
        MockMessagesRepository.sendVoiceMessage(
            threadId = "thread_p4",
            localPath = "C:/tmp/voice.m4a",
            durationSec = 7
        )

        val last = MockMessagesRepository.getMessages("thread_p4").last()
        assertNotNull(last.voiceNote)
        assertEquals(7, last.voiceNote?.durationSec)
    }
}

