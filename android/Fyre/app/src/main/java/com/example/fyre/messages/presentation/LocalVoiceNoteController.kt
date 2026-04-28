package com.example.fyre.messages.presentation

import android.media.MediaPlayer
import android.media.MediaRecorder

/**
 * Gestione di registrazione e playback vocale per la chat.
 * Il file audio viene caricato dal repository messaggi dopo la registrazione.
 */
class LocalVoiceNoteController {
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

    fun play(localPath: String, onCompleted: () -> Unit) {
        stopPlayback()
        runCatching {
            val localPlayer = MediaPlayer().apply {
                setDataSource(localPath)
                setOnCompletionListener {
                    onCompleted()
                    stopPlayback()
                }
                prepare()
                start()
            }
            player = localPlayer
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
}

