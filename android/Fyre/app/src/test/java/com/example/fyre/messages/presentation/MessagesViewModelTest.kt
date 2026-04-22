package com.example.fyre.messages.presentation

import com.example.fyre.messages.data.MockMessagesRepository
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
}


