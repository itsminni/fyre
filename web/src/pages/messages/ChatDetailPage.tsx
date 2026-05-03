import { CSSProperties, ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChatAvatar } from '../../components/messages/ChatAvatar';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import { formatLastSeen } from '../../context/AppContext';
import { ChatAttachment } from '../../types/models';

const CHAT_ATTACHMENT_EXTENSIONS = [
  'heif',
  'jpg',
  'pdf',
  'gif',
  'mp4',
  'jpeg',
  'hevc',
  'png',
  'mp3',
  'm4a',
  'aac',
  'wav',
  'zip'
] as const;
const CHAT_ATTACHMENT_ACCEPT = CHAT_ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',');
const CHAT_ATTACHMENT_EXTENSION_SET = new Set<string>(CHAT_ATTACHMENT_EXTENSIONS);
type VoiceRecorderState = 'idle' | 'recording' | 'processing';

interface VoiceRecorderResources {
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  gain: GainNode;
  startedAt: number;
  sampleRate: number;
}

function inferAttachmentType(mimeType: string): ChatAttachment['type'] {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
}

function attachmentMetadata(file: File, type: ChatAttachment['type']): Promise<Pick<ChatAttachment, 'width' | 'height' | 'duration'>> {
  if (type === 'image') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      image.src = url;
    });
  }

  if (type === 'video') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
          duration: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined
        });
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      video.src = url;
    });
  }

  if (type === 'audio') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          duration: Number.isFinite(audio.duration) ? Math.round(audio.duration) : undefined
        });
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({});
      };
      audio.src = url;
    });
  }

  return Promise.resolve({});
}

function fileExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  return extension;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  const candidate = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return candidate.AudioContext ?? candidate.webkitAudioContext ?? null;
}

function encodeWav(samples: Float32Array[], sampleRate: number): Blob {
  const sampleCount = samples.reduce((count, chunk) => count + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  let offset = 44;
  for (const chunk of samples) {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Formato audio non supportato'));
    };
    reader.onerror = () => reject(new Error('Impossibile leggere audio'));
    reader.readAsDataURL(blob);
  });
}

function fileToAttachment(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Formato allegato non supportato'));
        return;
      }

      const type = inferAttachmentType(file.type);
      const metadata = await attachmentMetadata(file, type);
      resolve({
        id: crypto.randomUUID(),
        type,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl: reader.result,
        ...metadata
      });
    };
    reader.onerror = () => reject(new Error('Errore durante la lettura allegato'));
    reader.readAsDataURL(file);
  });
}

function formatDeliveryLabel(deliveryState: string | undefined, readAt: string | undefined): string {
  if (deliveryState === 'read' || readAt) {
    return 'Letto';
  }
  if (deliveryState === 'delivered') {
    return 'Consegnato';
  }
  if (deliveryState === 'sent') {
    return 'Inviato';
  }
  if (deliveryState === 'sending') {
    return 'Invio...';
  }
  return 'Inviato';
}

function attachmentLabel(attachment: ChatAttachment): string {
  switch (attachment.type) {
    case 'image':
      return 'Foto';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    default:
      return attachment.name;
  }
}

function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '';
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAttachmentDuration(duration: number | undefined): string {
  if (!duration || !Number.isFinite(duration)) {
    return '';
  }

  const minutes = Math.floor(duration / 60);
  const seconds = Math.max(0, Math.round(duration % 60));
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function VoiceMessagePlayer({ attachment }: { attachment: ChatAttachment }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(attachment.duration ?? 0);
  const resolvedDuration = duration || attachment.duration || 0;
  const progress = resolvedDuration > 0 ? Math.min(100, (currentTime / resolvedDuration) * 100) : 0;

  function togglePlayback(): void {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  return (
    <div className="voice-message-player">
      <button
        className="voice-message-player__button"
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? 'Pausa audio' : 'Riproduci audio'}
      >
        {isPlaying ? 'II' : '>'}
      </button>
      <div className="voice-message-player__body">
        <div className="voice-message-player__track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="voice-message-player__meta">
          <span>{formatAttachmentDuration(currentTime) || '0:00'}</span>
          <span>{formatAttachmentDuration(resolvedDuration) || formatAttachmentSize(attachment.sizeBytes)}</span>
        </div>
      </div>
      <audio
        ref={audioRef}
        preload="metadata"
        src={attachment.dataUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration)) {
            setDuration(nextDuration);
          }
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
    </div>
  );
}

function ChatAttachmentItem({ attachment }: { attachment: ChatAttachment }): JSX.Element {
  const subtitle = [formatAttachmentDuration(attachment.duration), formatAttachmentSize(attachment.sizeBytes)]
    .filter(Boolean)
    .join(' - ');

  if (attachment.type === 'image') {
    return (
      <a className="chat-attachment-media" href={attachment.dataUrl} download={attachment.name} target="_blank" rel="noreferrer">
        <img src={attachment.dataUrl} alt={attachment.name} />
      </a>
    );
  }

  if (attachment.type === 'video') {
    return (
      <div className="chat-attachment-player">
        <video controls preload="metadata" src={attachment.dataUrl} />
        <a href={attachment.dataUrl} download={attachment.name} target="_blank" rel="noreferrer">
          {attachment.name}
        </a>
      </div>
    );
  }

  if (attachment.type === 'audio') {
    return (
      <div className="chat-audio-player" title={attachment.name}>
        <VoiceMessagePlayer attachment={attachment} />
        {subtitle && <span className="chat-audio-player__caption">{subtitle}</span>}
      </div>
    );
  }

  return (
    <a className="chat-attachment-file" href={attachment.dataUrl} download={attachment.name} target="_blank" rel="noreferrer">
      <span>{attachment.name}</span>
      {subtitle && <small>{subtitle}</small>}
    </a>
  );
}

// Bubble palette logic removed for web — bubbles use fixed palette in CSS now.

function chatSurfaceStyle(settings: ReturnType<typeof useAppStore>['persisted']['settings']): CSSProperties {
  // Only expose send-button colors to allow minimal customization on web.
  return {
    '--chat-send-1': settings.sendButtonColor1,
    '--chat-send-2': settings.sendButtonColor2,
    '--chat-send-3': settings.sendButtonColor3
  } as CSSProperties;
}

export function ChatDetailPage(): JSX.Element {
  const navigate = useNavigate();
  const { threadId } = useParams();
  const {
    persisted,
    isBackendMode,
    sendMessage,
    markThreadRead,
    setThreadNotifications,
    applyRelationshipAction
  } = useAppStore();
  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [relationshipFeedback, setRelationshipFeedback] = useState<string | null>(null);
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
  const [voiceRecorderState, setVoiceRecorderState] = useState<VoiceRecorderState>('idle');
  const [voiceRecorderElapsed, setVoiceRecorderElapsed] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const voiceRecorderRef = useRef<VoiceRecorderResources | null>(null);
  const voiceSamplesRef = useRef<Float32Array[]>([]);

  const thread = useMemo(
    () => persisted.threads.find((candidate) => candidate.id === threadId) ?? null,
    [persisted.threads, threadId]
  );

  const replyMessage = useMemo(() => {
    if (!thread || !replyToId) {
      return null;
    }
    return thread.messages.find((message) => message.id === replyToId) ?? null;
  }, [replyToId, thread]);

  const themedSurfaceStyle = useMemo(() => chatSurfaceStyle(persisted.settings), [persisted.settings]);

  useEffect(() => {
    if (!thread) {
      return;
    }

    markThreadRead(thread.id);
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [markThreadRead, thread?.id, thread?.messages.length]);

  useEffect(() => {
    if (voiceRecorderState !== 'recording') {
      return;
    }

    const timer = window.setInterval(() => {
      const startedAt = voiceRecorderRef.current?.startedAt;
      setVoiceRecorderElapsed(startedAt ? Math.max(0, (Date.now() - startedAt) / 1000) : 0);
    }, 250);

    return () => window.clearInterval(timer);
  }, [voiceRecorderState]);

  useEffect(
    () => () => {
      cleanupVoiceRecorder();
    },
    []
  );

  function cleanupVoiceRecorder(): void {
    const resources = voiceRecorderRef.current;
    if (!resources) {
      return;
    }

    resources.processor.disconnect();
    resources.source.disconnect();
    resources.gain.disconnect();
    resources.stream.getTracks().forEach((track) => track.stop());
    void resources.audioContext.close().catch(() => undefined);
    voiceRecorderRef.current = null;
  }

  async function startVoiceRecording(): Promise<void> {
    if (voiceRecorderState !== 'idle') {
      return;
    }

    const AudioContextConstructor = getAudioContextConstructor();
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextConstructor) {
      setUploadError('Registrazione vocale non supportata da questo browser.');
      return;
    }

    try {
      setUploadError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContextConstructor();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const gain = audioContext.createGain();

      gain.gain.value = 0;
      voiceSamplesRef.current = [];
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        voiceSamplesRef.current.push(new Float32Array(input));
      };

      source.connect(processor);
      processor.connect(gain);
      gain.connect(audioContext.destination);

      voiceRecorderRef.current = {
        stream,
        audioContext,
        source,
        processor,
        gain,
        startedAt: Date.now(),
        sampleRate: audioContext.sampleRate
      };
      setVoiceRecorderElapsed(0);
      setVoiceRecorderState('recording');
    } catch {
      cleanupVoiceRecorder();
      setVoiceRecorderState('idle');
      setUploadError('Impossibile accedere al microfono.');
    }
  }

  async function stopVoiceRecording(): Promise<void> {
    const resources = voiceRecorderRef.current;
    if (!resources || voiceRecorderState !== 'recording') {
      return;
    }

    setVoiceRecorderState('processing');
    const duration = Math.max(1, Math.round((Date.now() - resources.startedAt) / 1000));
    const samples = [...voiceSamplesRef.current];
    const sampleRate = resources.sampleRate;
    cleanupVoiceRecorder();

    if (samples.length === 0) {
      setVoiceRecorderState('idle');
      setUploadError('Registrazione vuota.');
      return;
    }

    try {
      const blob = encodeWav(samples, sampleRate);
      const dataUrl = await blobToDataUrl(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      setAttachments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'audio',
          name: `messaggio-vocale-${timestamp}.wav`,
          mimeType: 'audio/wav',
          sizeBytes: blob.size,
          dataUrl,
          duration
        }
      ]);
      setUploadError(null);
    } catch {
      setUploadError('Impossibile preparare il messaggio vocale.');
    } finally {
      voiceSamplesRef.current = [];
      setVoiceRecorderElapsed(0);
      setVoiceRecorderState('idle');
    }
  }

  function cancelVoiceRecording(): void {
    cleanupVoiceRecorder();
    voiceSamplesRef.current = [];
    setVoiceRecorderElapsed(0);
    setVoiceRecorderState('idle');
  }

  async function onAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    setUploadError(null);

    const selectedFiles = Array.from(files);
    const unsupportedFile = selectedFiles.find(
      (file) => !CHAT_ATTACHMENT_EXTENSION_SET.has(fileExtension(file.name))
    );

    if (unsupportedFile) {
      setUploadError(`Formato non supportato: ${unsupportedFile.name}.`);
      event.target.value = '';
      return;
    }

    try {
      const loaded = await Promise.all(selectedFiles.map((file) => fileToAttachment(file)));
      setAttachments((prev) => [...prev, ...loaded]);
    } catch {
      setUploadError('Impossibile allegare uno o più file.');
    } finally {
      event.target.value = '';
    }
  }

  function removeAttachment(attachmentId: string): void {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread) {
      return;
    }

    if (voiceRecorderState !== 'idle') {
      return;
    }

    sendMessage({
      threadId: thread.id,
      text: draft,
      replyToMessageId: replyToId ?? undefined,
      attachments
    });

    setDraft('');
    setReplyToId(null);
    setAttachments([]);
  }

  async function handleRelationshipAction(action: 'archive' | 'unmatch' | 'block'): Promise<void> {
    if (!thread) {
      return;
    }

    const confirmed = window.confirm(`${action === 'archive'
      ? 'Archiviare'
      : action === 'unmatch'
        ? 'Rimuovere il match con'
        : 'Bloccare'} ${thread.name}?`);
    if (!confirmed) {
      return;
    }

    const error = await applyRelationshipAction(thread.id, action);
    if (error) {
      setRelationshipFeedback(error);
      return;
    }

    navigate('/app/messages', { replace: true });
  }

  async function handleThreadNotifications(): Promise<void> {
    if (!thread) {
      return;
    }

    setRelationshipFeedback(null);
    const error = await setThreadNotifications(thread.id, !thread.notificationsEnabled);
    if (error) {
      setRelationshipFeedback(error);
    }
  }

  if (!thread && isBackendMode && persisted.realtimeState !== 'connected') {
    return (
      <section className="chat-detail-page fade-in-up">
        <Link className="chat-back-link" to="/app/messages">
          Torna ai messaggi
        </Link>
        <div className="empty-panel">
          <h3>Caricamento chat</h3>
          <p>Recupero la conversazione.</p>
        </div>
      </section>
    );
  }

  if (!thread) {
    return (
      <section className="chat-detail-page fade-in-up">
        <Link className="chat-back-link" to="/app/messages">
          Torna ai messaggi
        </Link>
        <div className="empty-panel">
          <h3>Chat non trovata</h3>
          <p>Questa conversazione non esiste più.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="chat-detail-page fade-in-up" style={themedSurfaceStyle}>
      <Link className="chat-back-link" to="/app/messages">
        Torna ai messaggi
      </Link>

      <header className="chat-detail-page__header">
        <button
          className="chat-detail-page__avatar-button"
          type="button"
          onClick={() => setIsAvatarPreviewOpen(true)}
          aria-label={`Apri avatar di ${thread.name}`}
        >
          <ChatAvatar name={thread.name} avatar={thread.avatar} size={40} isOnline={thread.isOnline} />
        </button>
        <div>
          <h2>{thread.name}</h2>
          <p>{thread.isOnline ? 'Online ora' : formatLastSeen(thread.lastSeenAt)}</p>
        </div>
        <div className="chat-detail-page__actions">
          <Button variant="ghost" onClick={() => void handleThreadNotifications()}>
            {thread.notificationsEnabled ? 'Silenzia' : 'Riattiva notifiche'}
          </Button>
          <Button variant="ghost" onClick={() => void handleRelationshipAction('unmatch')}>
            Unmatch
          </Button>
        </div>
      </header>

      <div className="chat-messages">
        {thread.messages.map((message) => {
          const replied = message.replyToMessageId
            ? thread.messages.find((candidate) => candidate.id === message.replyToMessageId)
            : undefined;

          return (
            <article
              key={message.id}
              className={message.isMe ? 'chat-message-row chat-message-row--me' : 'chat-message-row'}
            >
              <div className={message.isMe ? 'chat-bubble chat-bubble--me' : 'chat-bubble'}>
                {replied && (
                  <div className="chat-reply-preview">
                    <small>{replied.isMe ? 'Tu' : thread.name}</small>
                    <p>
                      {replied.text
                        || (replied.attachments?.[0]
                          ? attachmentLabel(replied.attachments[0])
                          : 'Allegato')}
                    </p>
                  </div>
                )}

                {message.text ? <p>{message.text}</p> : null}

                {message.attachments && message.attachments.length > 0 ? (
                  <ul className="chat-attachments-list">
                    {message.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <ChatAttachmentItem attachment={attachment} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="chat-message-row__meta">
                <span>{message.time}</span>
                {message.isMe && (
                  <span className="chat-bubble__delivery">
                    {formatDeliveryLabel(message.deliveryState, message.readAt)}
                  </span>
                )}

                <button
                  className="chat-bubble__reply-action"
                  type="button"
                  onClick={() => setReplyToId(message.id)}
                >
                  Rispondi
                </button>
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>

      {replyMessage && (
        <div className="chat-replying-banner">
          <div>
            <small>Stai rispondendo a</small>
            <p>{replyMessage.text || 'Messaggio con allegato'}</p>
          </div>
          <Button variant="ghost" onClick={() => setReplyToId(null)}>
            Annulla
          </Button>
        </div>
      )}

      <form className="chat-composer" onSubmit={onSubmit}>
        <div className="chat-composer__field">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Messaggio"
          />
          <div className="chat-composer__tools">
            <label className="chat-attach-button">
              <input type="file" multiple accept={CHAT_ATTACHMENT_ACCEPT} onChange={onAttachmentChange} />
              Allega
            </label>
            <button
              className={voiceRecorderState === 'recording' ? 'chat-voice-button is-recording' : 'chat-voice-button'}
              type="button"
              disabled={voiceRecorderState === 'processing'}
              onClick={() => {
                if (voiceRecorderState === 'recording') {
                  void stopVoiceRecording();
                  return;
                }
                void startVoiceRecording();
              }}
            >
              {voiceRecorderState === 'recording' ? 'Ferma vocale' : 'Vocale'}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={voiceRecorderState !== 'idle' || (!draft.trim() && attachments.length === 0)}>
          Invia
        </Button>
      </form>

      {voiceRecorderState !== 'idle' && (
        <div className="chat-voice-recorder" role="status">
          <span className="chat-voice-recorder__dot" aria-hidden="true" />
          <div>
            <strong>
              {voiceRecorderState === 'recording' ? 'Registrazione vocale' : 'Preparazione vocale'}
            </strong>
            <span>{formatAttachmentDuration(voiceRecorderElapsed) || '0:00'}</span>
          </div>
          {voiceRecorderState === 'recording' && (
            <div className="chat-voice-recorder__actions">
              <button type="button" onClick={() => void stopVoiceRecording()}>
                Usa
              </button>
              <button type="button" onClick={cancelVoiceRecording}>
                Annulla
              </button>
            </div>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="chat-attachment-preview-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.type === 'audio' ? (
                <ChatAttachmentItem attachment={attachment} />
              ) : (
                <span>{attachment.name}</span>
              )}
              <button type="button" onClick={() => removeAttachment(attachment.id)}>
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploadError && <p className="form-feedback form-feedback--error">{uploadError}</p>}
      {relationshipFeedback && (
        <p className="form-feedback form-feedback--error">{relationshipFeedback}</p>
      )}

      {isAvatarPreviewOpen && (
        <div
          className="chat-avatar-preview"
          role="dialog"
          aria-modal="true"
          aria-label={`Avatar di ${thread.name}`}
          onClick={() => setIsAvatarPreviewOpen(false)}
        >
          <button
            className="chat-avatar-preview__close"
            type="button"
            onClick={() => setIsAvatarPreviewOpen(false)}
            aria-label="Chiudi avatar"
          >
            Chiudi
          </button>
          <div className="chat-avatar-preview__image" onClick={(event) => event.stopPropagation()}>
            <ChatAvatar name={thread.name} avatar={thread.avatar} size={220} isOnline={false} />
          </div>
        </div>
      )}
    </section>
  );
}
