package minni.fyre.messages.presentation

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
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import minni.fyre.R
import minni.fyre.account.model.ChatBackgroundStyle
import minni.fyre.account.model.ChatBubblePalette
import minni.fyre.account.model.ChatCustomizationSettings
import minni.fyre.data.appwrite.AppwritePrivateMediaStore
import minni.fyre.messages.model.AttachmentType
import minni.fyre.messages.model.ChatMessage
import minni.fyre.messages.model.MessageAuthor
import minni.fyre.messages.model.MessageAttachment
import minni.fyre.messages.model.MessageSyncStatus
import minni.fyre.messages.model.MessageThread
import minni.fyre.messages.model.RelationshipAction
import minni.fyre.messages.model.VoiceNote
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

data class PickedMessageAttachment(
    val type: AttachmentType,
    val displayName: String,
    val localUri: String,
    val mimeType: String
)

internal val chatAttachmentPickerMimeTypes = arrayOf(
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/pdf",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "video/mp4",
    "video/quicktime"
)

private val chatAttachmentAllowedExtensions = setOf(
    "jpg",
    "jpeg",
    "png",
    "webp",
    "heic",
    "pdf",
    "m4a",
    "mp3",
    "wav",
    "mp4",
    "mov"
)

internal fun isAllowedChatAttachmentFileName(fileName: String): Boolean {
    val extension = fileName.substringAfterLast('.', missingDelimiterValue = "")
        .trim()
        .lowercase(Locale.ROOT)
    return extension in chatAttachmentAllowedExtensions
}

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
    onToggleThreadNotifications: (Boolean) -> Unit,
    onRelationshipAction: (RelationshipAction) -> Unit,
    chatSettings: ChatCustomizationSettings = ChatCustomizationSettings(),
    imageHeaders: Map<String, String> = emptyMap(),
    privateMediaStore: AppwritePrivateMediaStore? = null,
    onBack: () -> Unit
) {
    val listState = rememberLazyListState()
    val context = LocalContext.current
    var attachmentSelectionError by remember { mutableStateOf<String?>(null) }
    val attachmentScope = rememberCoroutineScope()
    val voiceController = remember(context.applicationContext) {
        LocalVoiceNoteController(context.applicationContext)
    }
    val micPermission = rememberPermissionState(permission = Manifest.permission.RECORD_AUDIO)
    val cameraPermission = rememberPermissionState(permission = Manifest.permission.CAMERA)
    val imagePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        uri?.let {
            val attachment = context.resolvePickedAttachment(
                uri = it,
                type = AttachmentType.Image,
                fallbackMimeType = "image/jpeg",
                fallbackNamePrefix = "image"
            )
            if (attachment == null) {
                attachmentSelectionError = context.getString(R.string.messages_attachment_unsupported)
            } else {
                attachmentSelectionError = null
                onSendAttachment(attachment)
            }
        }
    }
    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let {
            val attachment = context.resolvePickedAttachment(
                uri = it,
                type = AttachmentType.File,
                fallbackMimeType = "application/pdf",
                fallbackNamePrefix = "file"
            )
            if (attachment == null) {
                attachmentSelectionError = context.getString(R.string.messages_attachment_unsupported)
            } else {
                attachmentSelectionError = null
                onSendAttachment(attachment)
            }
        }
    }
    val videoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        uri?.let {
            val attachment = context.resolvePickedAttachment(
                uri = it,
                type = AttachmentType.Video,
                fallbackMimeType = "video/mp4",
                fallbackNamePrefix = "video"
            )
            if (attachment == null) {
                attachmentSelectionError = context.getString(R.string.messages_attachment_unsupported)
            } else {
                attachmentSelectionError = null
                onSendAttachment(attachment)
            }
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
            ThreadAvatar(thread = thread)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = thread.displayName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = threadPresenceText(thread),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
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
                        leadingIcon = {
                            Icon(
                                imageVector = if (thread.notificationsEnabled) {
                                    Icons.Filled.NotificationsOff
                                } else {
                                    Icons.Filled.Notifications
                                },
                                contentDescription = null
                            )
                        },
                        text = {
                            Text(
                                if (thread.notificationsEnabled) {
                                    stringResource(R.string.messages_mute_action)
                                } else {
                                    stringResource(R.string.messages_unmute_action)
                                }
                            )
                        },
                        onClick = {
                            relationshipMenuExpanded = false
                            onToggleThreadNotifications(!thread.notificationsEnabled)
                        }
                    )
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

        val visibleErrorMessage = errorMessage?.takeIf { it.isNotBlank() }
            ?: attachmentSelectionError?.takeIf { it.isNotBlank() }
        if (visibleErrorMessage != null) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.errorContainer,
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = visibleErrorMessage,
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
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            itemsIndexed(messages, key = { _, message -> message.id }) { _, message ->
                MessageBubble(
                    message = message,
                    repliedMessage = message.replyToMessageId?.let { replyId ->
                        messages.firstOrNull { it.id == replyId }
                    },
                    isPlayingVoice = message.voiceNote?.localPath == playingPath,
                    chatSettings = chatSettings,
                    imageHeaders = imageHeaders,
                    replyVoiceLabel = replyVoiceLabel,
                    replyGenericLabel = replyGenericLabel,
                    peerReadAt = thread.otherParticipantReadAt,
                    onOpenFile = { attachment ->
                        attachmentScope.launch {
                            val source = attachment.backendUrl?.takeIf { it.isNotBlank() }
                                ?: attachment.localUri
                            runCatching {
                                if (source.startsWith("content://", ignoreCase = true)) {
                                    Uri.parse(source)
                                } else {
                                    checkNotNull(privateMediaStore) {
                                        "Servizio media privati non disponibile"
                                    }.materializeForExternalOpen(source, attachment.displayName)
                                }
                            }.onSuccess { uri ->
                                context.openAttachmentExternally(uri, attachment)
                            }.onFailure {
                                attachmentSelectionError = context.getString(
                                    R.string.messages_attachment_open_failed
                                )
                            }
                        }
                    },
                    onPlayVoice = { path ->
                        if (playingPath == path) {
                            voiceController.stopPlayback()
                            playingPath = null
                        } else {
                            val started = voiceController.play(
                                source = path,
                                requestHeaders = imageHeaders,
                                onCompleted = { playingPath = null }
                            )
                            playingPath = if (started) path else null
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
                                    attachmentSelectionError = null
                                    filePicker.launch(chatAttachmentPickerMimeTypes)
                                }
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.messages_attachment_image)) },
                                onClick = {
                                    attachmentMenuExpanded = false
                                    attachmentSelectionError = null
                                    imagePicker.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                    )
                                }
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.messages_attachment_video)) },
                                onClick = {
                                    attachmentMenuExpanded = false
                                    attachmentSelectionError = null
                                    videoPicker.launch(
                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)
                                    )
                                }
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.messages_take_photo)) },
                                onClick = {
                                    attachmentMenuExpanded = false
                                    if (cameraPermission.status.isGranted) {
                                        cameraLauncher.launch(null)
                                    } else {
                                        cameraPermission.launchPermissionRequest()
                                    }
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

                    IconButton(
                        onClick = {
                            if (cameraPermission.status.isGranted) {
                                cameraLauncher.launch(null)
                            } else {
                                cameraPermission.launchPermissionRequest()
                            }
                        }
                    ) {
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
private fun ThreadAvatar(thread: MessageThread) {
    Box(
        modifier = Modifier
            .size(42.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center
    ) {
        if (!thread.avatarUrl.isNullOrBlank()) {
            AsyncImage(
                model = thread.avatarUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Text(
                text = thread.avatarLabel,
                color = MaterialTheme.colorScheme.onPrimary,
                fontWeight = FontWeight.Bold
            )
        }
        if (thread.isOnline) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(11.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF2ECC71))
            )
        }
    }
}

@Composable
private fun threadPresenceText(thread: MessageThread): String {
    if (!thread.notificationsEnabled) {
        return stringResource(R.string.messages_muted_label)
    }
    if (thread.isOnline) {
        return stringResource(R.string.messages_presence_online)
    }
    return thread.lastSeenAt?.let {
        stringResource(R.string.messages_presence_last_seen, formatLastSeenTimestamp(it))
    } ?: stringResource(R.string.messages_presence_offline)
}

@Composable
private fun MessageBubble(
    message: ChatMessage,
    repliedMessage: ChatMessage?,
    isPlayingVoice: Boolean,
    chatSettings: ChatCustomizationSettings,
    imageHeaders: Map<String, String>,
    replyVoiceLabel: String,
    replyGenericLabel: String,
    peerReadAt: Long?,
    onOpenFile: (MessageAttachment) -> Unit,
    onPlayVoice: (String) -> Unit,
    onReply: () -> Unit
) {
    val context = LocalContext.current
    val isMine = message.author == MessageAuthor.Me
    val bubblePalette = if (isMine) {
        chatSettings.outgoingBubblePalette
    } else {
        chatSettings.incomingBubblePalette
    }
    val bubbleBrush = chatBubbleBrush(bubblePalette, isMine)
    val textColor = chatBubbleTextColor(bubblePalette, isMine)
    val bubbleShape = RoundedCornerShape(16.dp)
    var previewAttachment by remember(message.id) { mutableStateOf<MessageAttachment?>(null) }
    var showMessageInfo by remember(message.id) { mutableStateOf(false) }
    val hasOnlyRichMedia = message.text.isBlank() &&
        message.voiceNote == null &&
        message.attachments.isNotEmpty() &&
        message.attachments.all { attachment ->
            attachment.isDisplayImage() || attachment.isDisplayVideo()
        }
    val hasVoiceNote = message.voiceNote != null
    val horizontalPadding = if (hasOnlyRichMedia) 3.dp else 12.dp
    val verticalPadding = if (hasOnlyRichMedia) 3.dp else 8.dp

    previewAttachment?.let { attachment ->
        AlertDialog(
            onDismissRequest = { previewAttachment = null },
            title = {
                Text(
                    text = attachment.displayName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            },
            text = {
                AsyncImage(
                    model = attachment.chatImageModel(context, imageHeaders),
                    contentDescription = attachment.displayName,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 240.dp, max = 520.dp)
                        .clip(RoundedCornerShape(16.dp))
                )
            },
            confirmButton = {
                TextButton(onClick = { previewAttachment = null }) {
                    Text(stringResource(R.string.messages_close_image_preview))
                }
            }
        )
    }

    if (showMessageInfo) {
        MessageInfoDialog(
            message = message,
            peerReadAt = peerReadAt,
            onDismiss = { showMessageInfo = false }
        )
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = bubbleShape,
            color = Color.Transparent,
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth(0.78f)
        ) {
            Column(
                modifier = Modifier
                    .background(bubbleBrush, bubbleShape)
                    .padding(
                        horizontal = horizontalPadding,
                        vertical = verticalPadding
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
                } else if (!message.replyPreviewText.isNullOrBlank()) {
                    Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 1.dp) {
                        Text(
                            text = stringResource(
                                R.string.messages_reply_prefix,
                                message.replyPreviewText
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
                    if (attachment.isDisplayImage()) {
                        ChatImageAttachment(
                            attachment = attachment,
                            message = message,
                            isMine = isMine,
                            imageHeaders = imageHeaders,
                            showTimestamp = true,
                            onOpenPreview = { previewAttachment = attachment }
                        )
                    } else if (attachment.isDisplayVideo()) {
                        ChatVideoAttachment(
                            attachment = attachment,
                            message = message,
                            isMine = isMine,
                            requestHeaders = imageHeaders,
                            showTimestamp = true
                        )
                    } else {
                        Surface(shape = RoundedCornerShape(10.dp), tonalElevation = 1.dp) {
                            val typeLabel = when (attachment.type) {
                                AttachmentType.Image -> stringResource(R.string.messages_attachment_image)
                                AttachmentType.Video -> stringResource(R.string.messages_attachment_video)
                                AttachmentType.File -> stringResource(R.string.messages_attachment_file)
                            }
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onOpenFile(attachment) }
                                    .padding(horizontal = 8.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.AttachFile,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = attachment.displayName,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = typeLabel,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }

                val voice = message.voiceNote
                if (voice != null) {
                    ChatVoiceNote(
                        voice = voice,
                        message = message,
                        isMine = isMine,
                        isPlaying = isPlayingVoice,
                        textColor = textColor,
                        showTimestamp = true,
                        onPlayVoice = { onPlayVoice(voice.localPath) }
                    )
                }

                if (!hasOnlyRichMedia && !hasVoiceNote) {
                    val actionTextColor = textColor.copy(alpha = 0.94f)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = onReply) {
                                Text(
                                    text = stringResource(R.string.messages_reply_action),
                                    color = actionTextColor,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                            if (isMine) {
                                TextButton(onClick = { showMessageInfo = true }) {
                                    Text(
                                        text = stringResource(R.string.messages_info_action),
                                        color = actionTextColor,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }
                        MessageStatusRow(
                            message = message,
                            isMine = isMine,
                            textColor = textColor.copy(alpha = 0.75f),
                            showTimestamp = true
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageInfoDialog(
    message: ChatMessage,
    peerReadAt: Long?,
    onDismiss: () -> Unit
) {
    val readAt = if (message.isRead) peerReadAt else null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.messages_info_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = stringResource(
                        R.string.messages_info_sent_at,
                        formatMessageFullTimestamp(message.timestamp)
                    )
                )
                Text(
                    text = readAt?.let {
                        stringResource(R.string.messages_info_read_at, formatMessageFullTimestamp(it))
                    } ?: stringResource(R.string.messages_info_not_read)
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.messages_close_image_preview))
            }
        }
    )
}

@Composable
private fun ChatImageAttachment(
    attachment: MessageAttachment,
    message: ChatMessage,
    isMine: Boolean,
    imageHeaders: Map<String, String>,
    showTimestamp: Boolean,
    onOpenPreview: () -> Unit
) {
    val context = LocalContext.current
    Surface(
        shape = RoundedCornerShape(14.dp),
        tonalElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .height(220.dp)
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onOpenPreview)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            AsyncImage(
                model = attachment.chatImageModel(context, imageHeaders),
                contentDescription = attachment.displayName,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            MediaTimestampBadge(
                message = message,
                isMine = isMine,
                showTimestamp = showTimestamp,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(7.dp)
            )
        }
    }
}

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
private fun ChatVideoAttachment(
    attachment: MessageAttachment,
    message: ChatMessage,
    isMine: Boolean,
    requestHeaders: Map<String, String>,
    showTimestamp: Boolean
) {
    val context = LocalContext.current
    val mediaUri = attachment.mediaUri()
    var isPlaying by remember(mediaUri) { mutableStateOf(false) }
    val player = remember(mediaUri, requestHeaders) {
        val dataSourceFactory = DefaultHttpDataSource.Factory()
            .setDefaultRequestProperties(requestHeaders)
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(context)
                    .setDataSourceFactory(dataSourceFactory)
            )
            .build()
            .apply {
                setMediaItem(MediaItem.fromUri(mediaUri))
                prepare()
                playWhenReady = false
            }
    }

    DisposableEffect(player) {
        onDispose {
            player.release()
            isPlaying = false
        }
    }

    Surface(
        shape = RoundedCornerShape(14.dp),
        tonalElevation = 1.dp,
        modifier = Modifier
            .fillMaxWidth()
            .height(220.dp)
            .clip(RoundedCornerShape(14.dp))
    ) {
        Box(modifier = Modifier.background(Color.Black)) {
            AndroidView(
                factory = { viewContext ->
                    PlayerView(viewContext).apply {
                        this.player = player
                        useController = false
                        setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    }
                },
                update = { view -> view.player = player },
                modifier = Modifier.fillMaxSize()
            )
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clickable {
                        if (isPlaying) {
                            player.pause()
                            isPlaying = false
                        } else {
                            player.play()
                            isPlaying = true
                        }
                    }
            )
            if (!isPlaying) {
                Surface(
                    shape = CircleShape,
                    color = Color.Black.copy(alpha = 0.48f),
                    contentColor = Color.White,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .size(58.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Filled.PlayArrow,
                            contentDescription = stringResource(R.string.messages_play_video),
                            modifier = Modifier.size(36.dp)
                        )
                    }
                }
            }
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = Color.Black.copy(alpha = 0.52f),
                contentColor = Color.White,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
            ) {
                Text(
                    text = stringResource(R.string.messages_attachment_video),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp)
                )
            }
            MediaTimestampBadge(
                message = message,
                isMine = isMine,
                showTimestamp = showTimestamp,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(7.dp)
            )
        }
    }
}

@Composable
private fun ChatVoiceNote(
    voice: VoiceNote,
    message: ChatMessage,
    isMine: Boolean,
    isPlaying: Boolean,
    textColor: Color,
    showTimestamp: Boolean,
    onPlayVoice: () -> Unit
) {
    val waveform = remember(message.id) { voiceWaveform(message.id) }
    val accentColor = if (isMine) Color.White else MaterialTheme.colorScheme.primary
    val inactiveWaveColor = textColor.copy(alpha = 0.34f)
    val activeWaveColor = accentColor.copy(alpha = 0.88f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 2.dp, bottom = 1.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(
            shape = CircleShape,
            color = accentColor.copy(alpha = if (isMine) 0.20f else 0.14f),
            contentColor = accentColor,
            modifier = Modifier
                .size(44.dp)
                .clickable(onClick = onPlayVoice)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = if (isPlaying) Icons.Filled.Stop else Icons.Filled.PlayArrow,
                    contentDescription = if (isPlaying) {
                        stringResource(R.string.messages_stop_voice)
                    } else {
                        stringResource(R.string.messages_play_voice)
                    },
                    modifier = Modifier.size(28.dp)
                )
            }
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            VoiceWaveform(
                values = waveform,
                active = isPlaying,
                activeColor = activeWaveColor,
                inactiveColor = inactiveWaveColor,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(30.dp)
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(R.string.messages_voice_duration, voice.durationSec),
                    style = MaterialTheme.typography.labelSmall,
                    color = textColor.copy(alpha = 0.78f)
                )
                Spacer(modifier = Modifier.weight(1f))
                MessageStatusRow(
                    message = message,
                    isMine = isMine,
                    textColor = textColor.copy(alpha = 0.78f),
                    showTimestamp = showTimestamp
                )
            }
        }
    }
}

@Composable
private fun VoiceWaveform(
    values: List<Float>,
    active: Boolean,
    activeColor: Color,
    inactiveColor: Color,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val count = values.size.coerceAtLeast(1)
        val gap = size.width / (count * 2.5f)
        val barWidth = gap.coerceAtLeast(2f)
        val step = size.width / count
        values.forEachIndexed { index, raw ->
            val normalized = raw.coerceIn(0.16f, 1f)
            val barHeight = (size.height * normalized).coerceAtLeast(5f)
            val x = index * step
            val color = if (active && index % 3 != 0) activeColor else inactiveColor
            drawRoundRect(
                color = color,
                topLeft = Offset(x, (size.height - barHeight) / 2f),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(barWidth, barWidth)
            )
        }
    }
}

@Composable
private fun MediaTimestampBadge(
    message: ChatMessage,
    isMine: Boolean,
    showTimestamp: Boolean,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = Color.Black.copy(alpha = 0.54f),
        contentColor = Color.White,
        modifier = modifier
    ) {
        Box(modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)) {
            MessageStatusRow(
                message = message,
                isMine = isMine,
                textColor = Color.White.copy(alpha = 0.88f),
                showTimestamp = showTimestamp
            )
        }
    }
}

@Composable
private fun MessageStatusRow(
    message: ChatMessage,
    isMine: Boolean,
    textColor: Color,
    showTimestamp: Boolean = true
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (showTimestamp) {
            Text(
                text = formatMessageTimestamp(message.timestamp),
                style = MaterialTheme.typography.labelSmall,
                color = textColor
            )
        }

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

private fun voiceWaveform(seed: String): List<Float> {
    val normalizedSeed = seed.ifBlank { "voice" }
    val base = normalizedSeed.fold(0) { acc, char -> acc + char.code }
    return List(34) { index ->
        val value = ((base + index * 31 + (index % 5) * 17) % 74) / 100f
        (0.22f + value).coerceAtMost(1f)
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

private fun MessageAttachment.chatImageModel(
    context: Context,
    imageHeaders: Map<String, String>
): Any {
    val source = backendUrl?.takeIf { it.isNotBlank() } ?: localUri
    if (!source.startsWith("http", ignoreCase = true)) {
        return source
    }

    return ImageRequest.Builder(context)
        .data(source)
        .apply {
            imageHeaders.forEach { (name, value) ->
                addHeader(name, value)
            }
        }
        .build()
}

private fun MessageAttachment.isDisplayImage(): Boolean {
    return type == AttachmentType.Image || mimeType.startsWith("image/", ignoreCase = true)
}

private fun MessageAttachment.isDisplayVideo(): Boolean {
    return type == AttachmentType.Video || mimeType.startsWith("video/", ignoreCase = true)
}

private fun MessageAttachment.mediaUri(): Uri {
    val source = backendUrl?.takeIf { it.isNotBlank() } ?: localUri
    return when {
        source.startsWith("http://", ignoreCase = true) ||
            source.startsWith("https://", ignoreCase = true) ||
            source.startsWith("content://", ignoreCase = true) ||
            source.startsWith("file://", ignoreCase = true) -> Uri.parse(source)

        else -> Uri.fromFile(File(source))
    }
}

private fun formatMessageTimestamp(timestamp: Long): String {
    return SimpleDateFormat("HH:mm", Locale.ITALY).format(Date(timestamp))
}

private fun formatMessageFullTimestamp(timestamp: Long): String {
    return SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.ITALY).format(Date(timestamp))
}

private fun formatLastSeenTimestamp(timestamp: Long): String {
    return SimpleDateFormat("dd/MM HH:mm", Locale.ITALY).format(Date(timestamp))
}

private fun Context.openAttachmentExternally(uri: Uri, attachment: MessageAttachment) {
    val mimeType = attachment.mimeType.ifBlank { "*/*" }
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    runCatching {
        startActivity(Intent.createChooser(intent, attachment.displayName))
    }
}

private fun Context.resolvePickedAttachment(
    uri: Uri,
    type: AttachmentType,
    fallbackMimeType: String,
    fallbackNamePrefix: String
): PickedMessageAttachment? {
    persistReadPermission(uri)
    val resolvedMimeType = contentResolver.getType(uri)?.takeIf { it.isNotBlank() } ?: fallbackMimeType
    val displayName = queryDisplayName(uri) ?: fallbackAttachmentName(
        prefix = fallbackNamePrefix,
        mimeType = resolvedMimeType
    )
    if (!isAllowedChatAttachmentFileName(displayName)) {
        return null
    }

    val resolvedType = when {
        resolvedMimeType.startsWith("image/", ignoreCase = true) -> AttachmentType.Image
        resolvedMimeType.startsWith("video/", ignoreCase = true) -> AttachmentType.Video
        else -> type
    }

    return PickedMessageAttachment(
        type = resolvedType,
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
