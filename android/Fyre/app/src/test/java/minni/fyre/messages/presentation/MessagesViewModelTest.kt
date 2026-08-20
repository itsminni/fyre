package minni.fyre.messages.presentation

import minni.fyre.messages.data.MockMessagesDataRepository
import minni.fyre.messages.data.MockMessagesRepository
import minni.fyre.messages.model.AttachmentType
import minni.fyre.messages.model.MessageAuthor
import minni.fyre.messages.model.RelationshipAction
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

    private fun viewModel(): MessagesViewModel {
        return MessagesViewModel(MockMessagesDataRepository())
    }

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
        val viewModel = viewModel()

        viewModel.openThread("thread_p2")
        advanceUntilIdle()

        val thread = viewModel.threads.value.first { it.id == "thread_p2" }
        assertEquals(0, thread.unreadCount)
    }

    @Test
    fun send_current_message_appends_message_and_clears_draft() = runTest {
        val viewModel = viewModel()
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
        val viewModel = viewModel()
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
        val viewModel = viewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()

        viewModel.sendAttachment(
            type = AttachmentType.File,
            displayName = "documento.pdf",
            localUri = "content://documents/documento",
            mimeType = "application/pdf"
        )
        advanceUntilIdle()

        val last = viewModel.messages.value.last()
        assertTrue(last.attachments.isNotEmpty())
        assertEquals(AttachmentType.File, last.attachments.first().type)
    }

    @Test
    fun send_attachment_uses_picker_metadata() = runTest {
        val viewModel = viewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()

        viewModel.sendAttachment(
            type = AttachmentType.Image,
            displayName = "scatto.jpg",
            localUri = "content://media/picker/scatto",
            mimeType = "image/jpeg"
        )
        advanceUntilIdle()

        val attachment = viewModel.messages.value.last().attachments.first()
        assertEquals("scatto.jpg", attachment.displayName)
        assertEquals("content://media/picker/scatto", attachment.localUri)
        assertEquals("image/jpeg", attachment.mimeType)
    }

    @Test
    fun send_voice_message_creates_voice_note_message() = runTest {
        val viewModel = viewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()

        viewModel.sendVoiceMessage(localPath = "C:/tmp/v1.m4a", durationSec = 5)
        advanceUntilIdle()

        val last = viewModel.messages.value.last()
        assertEquals(5, last.voiceNote?.durationSec)
    }

    @Test
    fun show_inbox_resets_thread_state_and_reply() = runTest {
        val viewModel = viewModel()
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

    @Test
    fun relationship_action_removes_thread_and_returns_to_inbox() = runTest {
        val viewModel = viewModel()
        viewModel.openThread("thread_p4")
        advanceUntilIdle()

        viewModel.updateRelationship(RelationshipAction.Archive)
        advanceUntilIdle()

        assertEquals(null, viewModel.selectedThreadId.value)
        assertTrue(viewModel.messages.value.isEmpty())
        assertTrue(viewModel.threads.value.none { it.id == "thread_p4" })
    }
}
