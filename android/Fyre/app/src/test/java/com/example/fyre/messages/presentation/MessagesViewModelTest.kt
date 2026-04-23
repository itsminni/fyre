package com.example.fyre.messages.presentation

import com.example.fyre.messages.data.MockMessagesRepository
import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.MessageAuthor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MessagesViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(dispatcher)
        MockMessagesRepository.resetLocalState()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun open_thread_marks_it_as_read() = runTest {
        val viewModel = MessagesViewModel()

        viewModel.openThread("thread_p2")
        advanceUntilIdle()

        val thread = viewModel.threads.value.first { it.id == "thread_p2" }
        assertEquals(0, thread.unreadCount)
    }

    @Test
    fun send_current_message_appends_message_and_clears_draft() = runTest {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()
        viewModel.updateDraft("Ciao dalla test chat")

        viewModel.sendCurrentMessage()
        advanceUntilIdle()

        val last = viewModel.messages.value.lastOrNull()
        assertNotNull(last)
        assertEquals("Ciao dalla test chat", last?.text)
        assertTrue(last?.author == MessageAuthor.Me)
        assertEquals("", viewModel.draft.value)
    }

    @Test
    fun send_text_with_reply_sets_reply_to_message_id() = runTest {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()
        val targetId = viewModel.messages.value.first().id

        viewModel.setReplyToMessage(targetId)
        viewModel.updateDraft("Questa e una risposta")
        viewModel.sendCurrentMessage()
        advanceUntilIdle()

        val last = viewModel.messages.value.last()
        assertEquals(targetId, last.replyToMessageId)
        assertEquals(null, viewModel.replyToMessageId.value)
    }

    @Test
    fun send_attachment_creates_attachment_message() = runTest {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()

        viewModel.sendAttachment(AttachmentType.File)
        advanceUntilIdle()

        val last = viewModel.messages.value.last()
        assertTrue(last.attachments.isNotEmpty())
        assertEquals(AttachmentType.File, last.attachments.first().type)
    }

    @Test
    fun send_voice_message_creates_voice_note_message() = runTest {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()

        viewModel.sendVoiceMessage(localPath = "C:/tmp/v1.m4a", durationSec = 5)
        advanceUntilIdle()

        val last = viewModel.messages.value.last()
        assertEquals(5, last.voiceNote?.durationSec)
    }

    @Test
    fun show_inbox_resets_thread_state_and_reply() = runTest {
        val viewModel = MessagesViewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()
        val targetId = viewModel.messages.value.first().id
        viewModel.setReplyToMessage(targetId)

        viewModel.showInbox()
        advanceUntilIdle()

        assertEquals(null, viewModel.selectedThreadId.value)
        assertTrue(viewModel.messages.value.isEmpty())
        assertEquals(null, viewModel.replyToMessageId.value)
    }
}
