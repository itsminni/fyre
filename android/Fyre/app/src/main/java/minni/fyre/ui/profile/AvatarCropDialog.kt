package minni.fyre.ui.profile

import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import minni.fyre.R
import minni.fyre.data.appwrite.MAX_AVATAR_UPLOAD_BYTES
import minni.fyre.data.appwrite.readUploadPayload
import java.io.File

@Composable
internal fun AvatarCropDialog(uri: Uri, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var zoom by remember(uri) { mutableFloatStateOf(1f) }
    var horizontal by remember(uri) { mutableFloatStateOf(0f) }
    var vertical by remember(uri) { mutableFloatStateOf(0f) }
    var saving by remember(uri) { mutableStateOf(false) }
    var saveFailed by remember(uri) { mutableStateOf(false) }
    val decoded by produceState<Result<Bitmap>?>(null, uri) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val bytes = readUploadPayload(MAX_AVATAR_UPLOAD_BYTES) { context.contentResolver.openInputStream(uri) }
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes))) { decoder, info, _ ->
                    val longest = maxOf(info.size.width, info.size.height)
                    if (longest > 2048) {
                        val scale = 2048f / longest
                        decoder.setTargetSize((info.size.width * scale).toInt().coerceAtLeast(1),
                            (info.size.height * scale).toInt().coerceAtLeast(1))
                    }
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                }
            }
        }
    }
    val bitmap = decoded?.getOrNull()
    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(stringResource(R.string.avatar_crop_title)) },
        text = {
            Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState())) {
                if (bitmap != null) {
                    val window = avatarCropWindow(bitmap.width, bitmap.height, zoom, horizontal, vertical)
                    Canvas(Modifier.fillMaxWidth().aspectRatio(1f)) {
                        drawImage(bitmap.asImageBitmap(), IntOffset(window.left, window.top),
                            IntSize(window.size, window.size), dstSize = IntSize(size.width.toInt(), size.height.toInt()))
                    }
                    Text(stringResource(R.string.avatar_crop_zoom))
                    val zoomLabel = stringResource(R.string.avatar_crop_zoom)
                    Slider(zoom, { zoom = it }, modifier = Modifier.semantics { contentDescription = zoomLabel }, valueRange = 1f..4f, enabled = !saving)
                    Text(stringResource(R.string.avatar_crop_horizontal))
                    val horizontalLabel = stringResource(R.string.avatar_crop_horizontal)
                    Slider(horizontal, { horizontal = it }, modifier = Modifier.semantics { contentDescription = horizontalLabel }, valueRange = -1f..1f, enabled = !saving)
                    Text(stringResource(R.string.avatar_crop_vertical))
                    val verticalLabel = stringResource(R.string.avatar_crop_vertical)
                    Slider(vertical, { vertical = it }, modifier = Modifier.semantics { contentDescription = verticalLabel }, valueRange = -1f..1f, enabled = !saving)
                } else if (decoded == null) CircularProgressIndicator()
                if (decoded?.isFailure == true || saveFailed) Text(stringResource(R.string.avatar_crop_failed))
            }
        },
        confirmButton = {
            TextButton(enabled = bitmap != null && !saving, onClick = {
                val source = bitmap ?: return@TextButton
                saving = true
                scope.launch {
                    val result = withContext(Dispatchers.IO) {
                        runCatching {
                            val window = avatarCropWindow(source.width, source.height, zoom, horizontal, vertical)
                            val crop = Bitmap.createBitmap(source, window.left, window.top, window.size, window.size)
                            val output = Bitmap.createScaledBitmap(crop, 1024, 1024, true)
                            val file = File.createTempFile("avatar-crop-", ".jpg", context.cacheDir)
                            file.outputStream().use { check(output.compress(Bitmap.CompressFormat.JPEG, 90, it)) }
                            if (output !== crop && output !== source) output.recycle()
                            if (crop !== source) crop.recycle()
                            Uri.fromFile(file).toString()
                        }
                    }
                    saving = false
                    result.onSuccess(onConfirm).onFailure { saveFailed = true }
                }
            }) { Text(stringResource(R.string.avatar_crop_apply)) }
        },
        dismissButton = { TextButton(enabled = !saving, onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) } }
    )
}
