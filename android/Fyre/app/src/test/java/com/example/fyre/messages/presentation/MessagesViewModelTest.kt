package com.example.fyre.messages.presentation

import com.example.fyre.messages.data.MockMessagesRepository
import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.MessageAuthor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MessagesViewModelTest {

    @Before
    fun setup() {
        MockMessagesRepository.resetLocalState()
    }

    @Test
    fun open_thread_marks_it_as_read() {
        val viewModel = MessagesViewModel()

        viewModel.openThread("thread_p2")

        val thread = viewModel.threads.value.first { it.id == "thread_p2" }
        assertEquals(0, thread.unreadCount)
    }

    @Test
    fun send_current_message_appends_message_and_clears_draft() {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")
        viewModel.updateDraft("Ciao dalla test chat")

        viewModel.sendCurrentMessage()

        val last = viewModel.messages.value.lastOrNull()
        assertNotNull(last)
        assertEquals("Ciao dalla test chat", last?.text)
        assertTrue(last?.author == MessageAuthor.Me)
        assertEquals("", viewModel.draft.value)
    }

    @Test
    fun send_text_with_reply_sets_reply_to_message_id() {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")
        val targetId = viewModel.messages.value.first().id

        viewModel.setReplyToMessage(targetId)
        viewModel.updateDraft("Questa e una risposta")
        viewModel.sendCurrentMessage()

        val last = viewModel.messages.value.last()
        assertEquals(targetId, last.replyToMessageId)
        assertEquals(null, viewModel.replyToMessageId.value)
    }

    @Test
    fun send_mock_attachment_creates_attachment_message() {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")

        viewModel.sendMockAttachment(AttachmentType.File)

        val last = viewModel.messages.value.last()
        assertTrue(last.attachments.isNotEmpty())
        assertEquals(AttachmentType.File, last.attachments.first().type)
    }

    @Test
    fun send_voice_message_creates_voice_note_message() {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")

        viewModel.sendVoiceMessage(localPath = "C:/tmp/v1.m4a", durationSec = 5)

        val last = viewModel.messages.value.last()
        assertEquals(5, last.voiceNote?.durationSec)
    }
}


