package minni.fyre.messages.presentation

import android.content.Context
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri

class LocalVoiceNoteController(
    private val context: Context
) {
    private var recorder: MediaRecorder? = null
    private var player: MediaPlayer? = null

    fun startRecording(outputPath: String): Boolean {
        return runCatching {
            stopRecording()
            recorder?.release()

            @Suppress("DEPRECATION")
            val localRecorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(outputPath)
                prepare()
                start()
            }
            recorder = localRecorder
            true
        }.getOrDefault(false)
    }

    fun stopRecording() {
        runCatching {
            recorder?.stop()
        }
        recorder?.release()
        recorder = null
    }

    fun play(
        source: String,
        requestHeaders: Map<String, String> = emptyMap(),
        onCompleted: () -> Unit
    ): Boolean {
        stopPlayback()
        return runCatching {
            val localPlayer = MediaPlayer().apply {
                if (source.isUriSource()) {
                    setDataSource(context, Uri.parse(source), requestHeaders)
                } else {
                    setDataSource(source)
                }
                setOnCompletionListener {
                    onCompleted()
                    stopPlayback()
                }
                setOnErrorListener { _, _, _ ->
                    stopPlayback()
                    onCompleted()
                    true
                }
                setOnPreparedListener { preparedPlayer -> preparedPlayer.start() }
                prepareAsync()
            }
            player = localPlayer
            true
        }.getOrElse {
            stopPlayback()
            false
        }
    }

    fun stopPlayback() {
        runCatching {
            player?.stop()
        }
        player?.release()
        player = null
    }

    fun release() {
        stopRecording()
        stopPlayback()
    }

    private fun String.isUriSource(): Boolean {
        return startsWith("http://", ignoreCase = true) ||
            startsWith("https://", ignoreCase = true) ||
            startsWith("content://", ignoreCase = true) ||
            startsWith("file://", ignoreCase = true)
    }
}

