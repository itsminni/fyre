package com.example.fyre.messages.presentation

import android.Manifest
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.fyre.R
import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageAuthor
import com.example.fyre.messages.model.MessageThread
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MessageThreadScreen(
    thread: MessageThread,
    messages: List<ChatMessage>,
    draft: String,
    replyToMessageId: String?,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onReply: (String) -> Unit,
    onCancelReply: () -> Unit,
    onSendAttachment: (AttachmentType) -> Unit,
    onSendVoice: (String, Int) -> Unit,
    compactBubbles: Boolean = false,
    showTimestamps: Boolean = true,
    onBack: () -> Unit
) {
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val voiceController = remember { LocalVoiceNoteController() }
    val micPermission = rememberPermissionState(permission = Manifest.permission.RECORD_AUDIO)

    var recordingPath by remember { mutableStateOf<String?>(null) }
    var recordingStartMs by remember { mutableLongStateOf(0L) }
    var isRecording by remember { mutableStateOf(false) }
    var playingPath by remember { mutableStateOf<String?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            voiceController.release()
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    val replyTarget = messages.firstOrNull { it.id == replyToMessageId }
    val replyVoiceLabel = stringResource(R.string.messages_preview_voice)
    val replyGenericLabel = stringResource(R.string.messages_preview_generic)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.messages_back_to_inbox_cd)
                )
            }
            Text(
                text = thread.displayName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
        }

        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(if (compactBubbles) 4.dp else 8.dp)
        ) {
            itemsIndexed(messages, key = { _, message -> message.id }) { _, message ->
                MessageBubble(
                    message = message,
                    repliedMessage = message.replyToMessageId?.let { replyId ->
                        messages.firstOrNull { it.id == replyId }
                    },
                    isPlayingVoice = message.voiceNote?.localPath == playingPath,
                    compact = compactBubbles,
                    showTimestamp = showTimestamps,
                    replyVoiceLabel = replyVoiceLabel,
                    replyGenericLabel = replyGenericLabel,
                    onPlayVoice = { path ->
                        if (playingPath == path) {
                            voiceController.stopPlayback()
                            playingPath = null
                        } else {
                            voiceController.play(path) {
                                playingPath = null
                            }
                            playingPath = path
                        }
                    },
                    onReply = { onReply(message.id) }
                )
            }
        }

        if (replyTarget != null) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                shape = RoundedCornerShape(10.dp),
                tonalElevation = 1.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(
                            R.string.messages_reply_to,
                            previewForReply(replyTarget, replyVoiceLabel, replyGenericLabel)
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedButton(onClick = onCancelReply) {
                        Text(stringResource(R.string.common_cancel))
                    }
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            AssistChip(
                onClick = { onSendAttachment(AttachmentType.Image) },
                label = { Text(stringResource(R.string.messages_attachment_image)) }
            )
            AssistChip(
                onClick = { onSendAttachment(AttachmentType.Video) },
                label = { Text(stringResource(R.string.messages_attachment_video)) }
            )
            AssistChip(
                onClick = { onSendAttachment(AttachmentType.File) },
                label = { Text(stringResource(R.string.messages_attachment_file)) }
            )
            AssistChip(
                onClick = {
                    if (isRecording) {
                        voiceController.stopRecording()
                        val path = recordingPath
                        if (!path.isNullOrBlank()) {
                            val duration = ((System.currentTimeMillis() - recordingStartMs) / 1000L)
                                .coerceAtLeast(1L)
                                .toInt()
                            onSendVoice(path, duration)
                        }
                        isRecording = false
                        recordingPath = null
                        recordingStartMs = 0L
                    } else {
                        if (micPermission.status.isGranted) {
                            val targetFile = File(context.cacheDir, "voice_${System.currentTimeMillis()}.m4a")
                            val started = voiceController.startRecording(targetFile.absolutePath)
                            if (started) {
                                recordingPath = targetFile.absolutePath
                                recordingStartMs = System.currentTimeMillis()
                                isRecording = true
                            }
                        } else {
                            micPermission.launchPermissionRequest()
                        }
                    }
                },
                label = {
                    Text(
                        if (isRecording) {
                            stringResource(R.string.messages_stop_voice)
                        } else {
                            stringResource(R.string.messages_record_voice)
                        }
                    )
                }
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = onDraftChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text(stringResource(R.string.messages_draft_placeholder)) },
                maxLines = 4
            )
            IconButton(onClick = onSend) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = stringResource(R.string.messages_send_cd)
                )
            }
        }
    }
}

@Composable
private fun MessageBubble(
    message: ChatMessage,
    repliedMessage: ChatMessage?,
    isPlayingVoice: Boolean,
    compact: Boolean,
    showTimestamp: Boolean,
    replyVoiceLabel: String,
    replyGenericLabel: String,
    onPlayVoice: (String) -> Unit,
    onReply: () -> Unit
) {
    val isMine = message.author == MessageAuthor.Me
    val bubbleColor = if (isMine) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }
    val textColor = if (isMine) {
        MaterialTheme.colorScheme.onPrimary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = bubbleColor,
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth(if (compact) 0.64f else 0.78f)
        ) {
            Column(
                modifier = Modifier
                    .background(bubbleColor)
                    .padding(
                        horizontal = if (compact) 10.dp else 12.dp,
                        vertical = if (compact) 6.dp else 8.dp
                    ),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                if (repliedMessage != null) {
                    Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 1.dp) {
                        Text(
                            text = stringResource(
                                R.string.messages_reply_prefix,
                                previewForReply(repliedMessage, replyVoiceLabel, replyGenericLabel)
                            ),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                if (message.text.isNotBlank()) {
                    Text(
                        text = message.text,
                        color = textColor,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                message.attachments.forEach { attachment ->
                    Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 1.dp) {
                        val typeLabel = when (attachment.type) {
                            AttachmentType.Image -> stringResource(R.string.messages_attachment_image)
                            AttachmentType.Video -> stringResource(R.string.messages_attachment_video)
                            AttachmentType.File -> stringResource(R.string.messages_attachment_file)
                        }
                        Text(
                            text = stringResource(
                                R.string.messages_attachment_item,
                                typeLabel,
                                attachment.displayName
                            ),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
                        )
                    }
                }

                val voice = message.voiceNote
                if (voice != null) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedButton(onClick = { onPlayVoice(voice.localPath) }) {
                            Text(
                                if (isPlayingVoice) {
                                    stringResource(R.string.messages_stop)
                                } else {
                                    stringResource(R.string.messages_play_voice)
                                }
                            )
                        }
                        Text(stringResource(R.string.messages_voice_duration, voice.durationSec))
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(onClick = onReply) {
                        Text(stringResource(R.string.messages_reply_action))
                    }
                    if (showTimestamp) {
                        Text(
                            text = formatMessageTimestamp(message.timestamp),
                            style = MaterialTheme.typography.labelSmall,
                            color = textColor.copy(alpha = 0.75f)
                        )
                    }
                }
            }
        }
    }
}

private fun previewForReply(
    message: ChatMessage,
    voiceFallback: String,
    genericFallback: String
): String {
    if (message.text.isNotBlank()) return message.text
    if (message.voiceNote != null) return voiceFallback
    return message.attachments.firstOrNull()?.displayName ?: genericFallback
}

private fun formatMessageTimestamp(timestamp: Long): String {
    return SimpleDateFormat("HH:mm", Locale.ITALY).format(Date(timestamp))
}
