package minni.fyre.messages.data

import minni.fyre.messages.model.AttachmentType
import java.security.MessageDigest
import java.util.UUID

data class MessageSendRequest(
    val threadId: String,
    val operationId: String = UUID.randomUUID().toString().replace("-", ""),
    val text: String = "",
    val replyToMessageId: String? = null,
    val attachmentType: AttachmentType? = null,
    val displayName: String = "",
    val localUri: String = "",
    val mimeType: String = "",
    val voiceDurationSec: Int? = null
)

internal fun messageOperationRowId(userId: String, threadId: String, operationId: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
        .digest("$userId\n$threadId\n${operationId.lowercase()}".toByteArray(Charsets.UTF_8))
    return "m_" + digest.joinToString("") { "%02x".format(it) }.take(32)
}
