package com.example.fyre.messages.presentation

import android.Manifest
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.fyre.R
import com.example.fyre.account.model.ChatBackgroundStyle
import com.example.fyre.account.model.ChatBubblePalette
import com.example.fyre.account.model.ChatCustomizationSettings
import com.example.fyre.messages.model.AttachmentType
import com.example.fyre.messages.model.ChatMessage
import com.example.fyre.messages.model.MessageAuthor
import com.example.fyre.messages.model.MessageSyncStatus
import com.example.fyre.messages.model.MessageThread
import com.example.fyre.messages.model.RelationshipAction
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class PickedMessageAttachment(
    val type: AttachmentType,
    val displayName: String,
    val localUri: String,
    val mimeType: String
)

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MessageThreadScreen(
    thread: MessageThread,
    messages: List<ChatMessage>,
    draft: String,
    replyToMessageId: String?,
    errorMessage: String? = null,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onReply: (String) -> Unit,
    onCancelReply: () -> Unit,
    onSendAttachment: (PickedMessageAttachment) -> Unit,
    onSendVoice: (String, Int) -> Unit,
    onRelationshipAction: (RelationshipAction) -> Unit,
    chatSettings: ChatCustomizationSettings = ChatCustomizationSettings(),
    onBack: () -> Unit
) {
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val voiceController = remember { LocalVoiceNoteController() }
    val micPermission = rememberPermissionState(permission = Manifest.permission.RECORD_AUDIO)
    val imagePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        uri?.let {
            onSendAttachment(
                context.resolvePickedAttachment(
                    uri = it,
                    type = AttachmentType.Image,
                    fallbackMimeType = "image/jpeg",
                    fallbackNamePrefix = "image"
                )
            )
        }
    }
    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let {
            onSendAttachment(
                context.resolvePickedAttachment(
                    uri = it,
                    type = AttachmentType.File,
                    fallbackMimeType = "application/octet-stream",
                    fallbackNamePrefix = "file"
                )
            )
        }
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        bitmap?.let {
            onSendAttachment(context.resolveCameraAttachment(it))
        }
    }

    var recordingPath by remember { mutableStateOf<String?>(null) }
    var recordingStartMs by remember { mutableLongStateOf(0L) }
    var isRecording by remember { mutableStateOf(false) }
    var playingPath by remember { mutableStateOf<String?>(null) }
    var relationshipMenuExpanded by remember { mutableStateOf(false) }
    var attachmentMenuExpanded by remember { mutableStateOf(false) }
    var pendingRelationshipAction by remember { mutableStateOf<RelationshipAction?>(null) }

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
            .background(chatBackgroundBrush(chatSettings))
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
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Box {
                IconButton(onClick = { relationshipMenuExpanded = true }) {
                    Icon(
                        imageVector = Icons.Filled.MoreVert,
                        contentDescription = stringResource(R.string.messages_thread_more_options)
                    )
                }
                DropdownMenu(
                    expanded = relationshipMenuExpanded,
                    onDismissRequest = { relationshipMenuExpanded = false }
                ) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.messages_archive_action)) },
                        onClick = {
                            relationshipMenuExpanded = false
                            pendingRelationshipAction = RelationshipAction.Archive
                        }
                    )
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = stringResource(R.string.messages_unmatch_action),
                                color = MaterialTheme.colorScheme.error
                            )
                        },
                        onClick = {
                            relationshipMenuExpanded = false
                            pendingRelationshipAction = RelationshipAction.Unmatch
                        }
                    )
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = stringResource(R.string.messages_block_action),
                                color = MaterialTheme.colorScheme.error
                            )
                        },
                        onClick = {
                            relationshipMenuExpanded = false
                            pendingRelationshipAction = RelationshipAction.Block
                        }
                    )
                }
            }
        }

        pendingRelationshipAction?.let { action ->
            AlertDialog(
                onDismissRequest = { pendingRelationshipAction = null },
                title = {
                    Text(
                        text = when (action) {
                            RelationshipAction.Archive -> stringResource(R.string.messages_archive_confirm_title)
                            RelationshipAction.Unmatch -> stringResource(R.string.messages_unmatch_confirm_title)
                            RelationshipAction.Block -> stringResource(R.string.messages_block_confirm_title)
                        }
                    )
                },
                text = {
                    Text(
                        text = when (action) {
                            RelationshipAction.Archive -> stringResource(
                                R.string.messages_archive_confirm_message,
                                thread.displayName
                            )

                            RelationshipAction.Unmatch -> stringResource(
                                R.string.messages_unmatch_confirm_message,
                                thread.displayName
                            )

                            RelationshipAction.Block -> stringResource(
                                R.string.messages_block_confirm_message,
                                thread.displayName
                            )
                        }
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            pendingRelationshipAction = null
                            onRelationshipAction(action)
                        }
                    ) {
                        Text(
                            text = when (action) {
                                RelationshipAction.Archive -> stringResource(R.string.messages_archive_action)
                                RelationshipAction.Unmatch -> stringResource(R.string.messages_unmatch_action)
                                RelationshipAction.Block -> stringResource(R.string.messages_block_action)
                            },
                            color = if (action == RelationshipAction.Archive) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.error
                            }
                        )
                    }
                },
                dismissButton = {
                    TextButton(onClick = { pendingRelationshipAction = null }) {
                        Text(stringResource(R.string.common_cancel))
                    }
                }
            )
        }

        if (!errorMessage.isNullOrBlank()) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.errorContainer,
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = errorMessage,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.padding(10.dp)
                )
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(if (chatSettings.compactBubbles) 4.dp else 8.dp)
        ) {
            itemsIndexed(messages, key = { _, message -> message.id }) { _, message ->
                MessageBubble(
                    message = message,
                    repliedMessage = message.replyToMessageId?.let { replyId ->
                        messages.firstOrNull { it.id == replyId }
                    },
                    isPlayingVoice = message.voiceNote?.localPath == playingPath,
                    chatSettings = chatSettings,
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
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(28.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 3.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 4.dp, end = 2.dp, top = 2.dp, bottom = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box {
                        IconButton(onClick = { attachmentMenuExpanded = true }) {
                            Icon(
                                imageVector = Icons.Filled.AttachFile,
                                contentDescription = stringResource(R.string.messages_attachment_menu_cd)
                            )
                        }
                        DropdownMenu(
                            expanded = attachmentMenuExpanded,
                            onDismissRequest = { attachmentMenuExpanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.messages_attachment_file)) },
                                onClick = {
                                    attachmentMenuExpanded = false
                                    filePicker.launch(arrayOf("*/*"))
                                }
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.messages_attachment_image)) },
                                onClick = {
                                    attachmentMenuExpanded = false
                                    imagePicker.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                    )
                                }
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.messages_take_photo)) },
                                onClick = {
                                    attachmentMenuExpanded = false
                                    cameraLauncher.launch(null)
                                }
                            )
                        }
                    }

                    OutlinedTextField(
                        value = draft,
                        onValueChange = onDraftChange,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(stringResource(R.string.messages_draft_placeholder)) },
                        maxLines = 4,
                        shape = RoundedCornerShape(24.dp)
                    )

                    IconButton(onClick = { cameraLauncher.launch(null) }) {
                        Icon(
                            imageVector = Icons.Filled.PhotoCamera,
                            contentDescription = stringResource(R.string.messages_take_photo)
                        )
                    }
                }
            }

            IconButton(
                onClick = {
                    if (draft.isNotBlank()) {
                        onSend()
                    } else if (isRecording) {
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
                    } else if (micPermission.status.isGranted) {
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
                },
                modifier = Modifier.background(sendButtonBrush(chatSettings), CircleShape)
            ) {
                val icon = when {
                    draft.isNotBlank() -> Icons.AutoMirrored.Filled.Send
                    isRecording -> Icons.Filled.Stop
                    else -> Icons.Filled.Mic
                }
                val description = when {
                    draft.isNotBlank() -> stringResource(R.string.messages_send_cd)
                    isRecording -> stringResource(R.string.messages_stop_voice)
                    else -> stringResource(R.string.messages_record_voice)
                }
                Icon(
                    imageVector = icon,
                    contentDescription = description,
                    tint = Color.White
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
    chatSettings: ChatCustomizationSettings,
    replyVoiceLabel: String,
    replyGenericLabel: String,
    onPlayVoice: (String) -> Unit,
    onReply: () -> Unit
) {
    val isMine = message.author == MessageAuthor.Me
    val bubblePalette = if (isMine) {
        chatSettings.outgoingBubblePalette
    } else {
        chatSettings.incomingBubblePalette
    }
    val bubbleBrush = chatBubbleBrush(bubblePalette, isMine)
    val textColor = chatBubbleTextColor(bubblePalette, isMine)
    val bubbleShape = RoundedCornerShape(16.dp)

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = bubbleShape,
            color = Color.Transparent,
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth(if (chatSettings.compactBubbles) 0.64f else 0.78f)
        ) {
            Column(
                modifier = Modifier
                    .background(bubbleBrush, bubbleShape)
                    .padding(
                        horizontal = if (chatSettings.compactBubbles) 10.dp else 12.dp,
                        vertical = if (chatSettings.compactBubbles) 6.dp else 8.dp
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
                    TextButton(onClick = onReply) {
                        Text(stringResource(R.string.messages_reply_action))
                    }
                    if (chatSettings.showTimestamps) {
                        MessageStatusRow(
                            message = message,
                            isMine = isMine,
                            textColor = textColor.copy(alpha = 0.75f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageStatusRow(
    message: ChatMessage,
    isMine: Boolean,
    textColor: Color
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = formatMessageTimestamp(message.timestamp),
            style = MaterialTheme.typography.labelSmall,
            color = textColor
        )

        if (isMine) {
            val (icon, tint, description) = when (message.syncStatus) {
                MessageSyncStatus.LocalOnly -> Triple(
                    Icons.Filled.AccessTime,
                    textColor,
                    stringResource(R.string.messages_status_sending)
                )

                MessageSyncStatus.Failed -> Triple(
                    Icons.Filled.ErrorOutline,
                    MaterialTheme.colorScheme.error,
                    stringResource(R.string.messages_status_failed)
                )

                MessageSyncStatus.Synced -> if (message.isRead) {
                    Triple(
                        Icons.Filled.DoneAll,
                        Color(0xFF53BDEB),
                        stringResource(R.string.messages_status_read)
                    )
                } else {
                    Triple(
                        Icons.Filled.Done,
                        textColor,
                        stringResource(R.string.messages_status_sent)
                    )
                }
            }

            Icon(
                imageVector = icon,
                contentDescription = description,
                tint = tint,
                modifier = Modifier
                    .padding(top = 1.dp)
                    .size(16.dp)
            )
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

private fun Context.resolvePickedAttachment(
    uri: Uri,
    type: AttachmentType,
    fallbackMimeType: String,
    fallbackNamePrefix: String
): PickedMessageAttachment {
    persistReadPermission(uri)
    val resolvedMimeType = contentResolver.getType(uri)?.takeIf { it.isNotBlank() } ?: fallbackMimeType
    val displayName = queryDisplayName(uri) ?: fallbackAttachmentName(
        prefix = fallbackNamePrefix,
        mimeType = resolvedMimeType
    )

    return PickedMessageAttachment(
        type = type,
        displayName = displayName,
        localUri = uri.toString(),
        mimeType = resolvedMimeType
    )
}

private fun Context.resolveCameraAttachment(bitmap: Bitmap): PickedMessageAttachment {
    val file = File(cacheDir, "camera_${System.currentTimeMillis()}.jpg")
    file.outputStream().use { output ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)
    }

    return PickedMessageAttachment(
        type = AttachmentType.Image,
        displayName = file.name,
        localUri = file.absolutePath,
        mimeType = "image/jpeg"
    )
}

private fun Context.persistReadPermission(uri: Uri) {
    runCatching {
        contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
}

private fun Context.queryDisplayName(uri: Uri): String? {
    return runCatching {
        contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null
        )?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameIndex >= 0 && cursor.moveToFirst()) {
                cursor.getString(nameIndex)?.trim()
            } else {
                null
            }
        }
    }.getOrNull()?.takeIf { it.isNotBlank() }
}

private fun fallbackAttachmentName(prefix: String, mimeType: String): String {
    val extension = MimeTypeMap.getSingleton()
        .getExtensionFromMimeType(mimeType)
        ?.takeIf { it.isNotBlank() }
        ?.let { ".$it" }
        .orEmpty()

    return "${prefix}_${System.currentTimeMillis()}$extension"
}

@Composable
private fun chatBackgroundBrush(settings: ChatCustomizationSettings): Brush {
    val brightness = settings.backgroundBrightness.coerceIn(-1f, 1f)

    fun adjusted(color: Color): Color = when {
        brightness > 0f -> Color(
            red = color.red + (1f - color.red) * brightness,
            green = color.green + (1f - color.green) * brightness,
            blue = color.blue + (1f - color.blue) * brightness,
            alpha = color.alpha
        )

        brightness < 0f -> {
            val factor = 1f + brightness
            Color(color.red * factor, color.green * factor, color.blue * factor, color.alpha)
        }

        else -> color
    }

    val colors = when (settings.backgroundStyle) {
        ChatBackgroundStyle.DefaultDark -> listOf(
            MaterialTheme.colorScheme.background,
            MaterialTheme.colorScheme.surface
        )

        ChatBackgroundStyle.Graphite -> listOf(Color(0xFF111214), Color(0xFF23262A), Color(0xFF0B0C0E))
        ChatBackgroundStyle.Ember -> listOf(Color(0xFF170D0A), Color(0xFF3A1710), Color(0xFF120908))
        ChatBackgroundStyle.Ocean -> listOf(Color(0xFF061923), Color(0xFF0E3542), Color(0xFF051014))
        ChatBackgroundStyle.Forest -> listOf(Color(0xFF07140C), Color(0xFF173420), Color(0xFF051009))
        ChatBackgroundStyle.CustomGradient -> listOf(
            parseColorOrFallback(settings.backgroundColor1Hex, Color(0xFF3F4755)),
            parseColorOrFallback(settings.backgroundColor2Hex, Color(0xFF8B7A74)),
            parseColorOrFallback(settings.backgroundColor3Hex, Color(0xFFB9A89B))
        )
    }.map(::adjusted)

    return Brush.linearGradient(colors)
}

@Composable
private fun chatBubbleBrush(palette: ChatBubblePalette, isOutgoing: Boolean): Brush {
    val colors = when (palette) {
        ChatBubblePalette.Default -> if (isOutgoing) {
            listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary)
        } else {
            listOf(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
        }

        ChatBubblePalette.Coral -> listOf(Color(0xFFED6B48), Color(0xFFD94D32))
        ChatBubblePalette.Ocean -> listOf(Color(0xFF297EDC), Color(0xFF155EA7))
        ChatBubblePalette.Violet -> listOf(Color(0xFF895FE4), Color(0xFF6644B8))
        ChatBubblePalette.Emerald -> listOf(Color(0xFF29A272), Color(0xFF177D57))
        ChatBubblePalette.Graphite -> listOf(Color(0xFF4E535B), Color(0xFF343840))
    }
    return Brush.linearGradient(colors)
}

@Composable
private fun chatBubbleTextColor(palette: ChatBubblePalette, isOutgoing: Boolean): Color {
    return when {
        palette == ChatBubblePalette.Default && !isOutgoing -> MaterialTheme.colorScheme.onSurfaceVariant
        palette == ChatBubblePalette.Default && isOutgoing -> MaterialTheme.colorScheme.onPrimary
        else -> Color.White
    }
}

private fun sendButtonBrush(settings: ChatCustomizationSettings): Brush {
    return Brush.linearGradient(
        listOf(
            parseColorOrFallback(settings.sendButtonColor1Hex, Color(0xFFFF9A00)),
            parseColorOrFallback(settings.sendButtonColor2Hex, Color(0xFFFF8A1F)),
            parseColorOrFallback(settings.sendButtonColor3Hex, Color(0xFFE14D33))
        )
    )
}

private fun parseColorOrFallback(raw: String, fallback: Color): Color {
    return runCatching {
        Color(android.graphics.Color.parseColor(raw))
    }.getOrElse { fallback }
}
