import { CSSProperties, ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChatAvatar } from '../../components/messages/ChatAvatar';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import { ChatAttachment, ChatMessage } from '../../types/models';
import { formatLastSeen } from '../../utils/formatLastSeen';

const CHAT_ATTACHMENT_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'pdf',
  'm4a',
  'mp3',
  'wav',
  'mp4',
  'mov'
] as const;
const CHAT_ATTACHMENT_ACCEPT = CHAT_ATTACHMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',');
const CHAT_ATTACHMENT_EXTENSION_SET = new Set<string>(CHAT_ATTACHMENT_EXTENSIONS);
type VoiceRecorderState = 'idle' | 'recording' | 'processing';
const CHAT_LINK_PATTERN =
  /\b((?:https?:\/\/|www\.)[^\s<]+|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/[^\s<]*)?)/gi;
const CHAT_LINK_TRAILING_PUNCTUATION_PATTERN = /[),.!?;:]+$/;

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

function formatMessageDateTime(value: string | undefined): string {
  if (!value) {
    return 'Non disponibile';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function messageTimestamp(message: ChatMessage): number {
  const timestamp = Date.parse(message.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isSameMessageBlock(current: ChatMessage, adjacent: ChatMessage | undefined): boolean {
  if (!adjacent || current.isMe !== adjacent.isMe) {
    return false;
  }

  if (current.replyToMessageId || adjacent.replyToMessageId) {
    return false;
  }

  const currentTimestamp = messageTimestamp(current);
  const adjacentTimestamp = messageTimestamp(adjacent);
  if (!currentTimestamp || !adjacentTimestamp) {
    return current.time === adjacent.time;
  }

  const currentDate = new Date(currentTimestamp);
  const adjacentDate = new Date(adjacentTimestamp);
  const sameDay = currentDate.toDateString() === adjacentDate.toDateString();
  const gapMs = Math.abs(adjacentTimestamp - currentTimestamp);
  return sameDay && gapMs <= 5 * 60 * 1000;
}

function normalizeChatLinkHref(value: string): string | null {
  const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderMessageTextWithLinks(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(CHAT_LINK_PATTERN)) {
    const rawMatch = match[0];
    const matchIndex = match.index ?? 0;
    const trailingMatch = rawMatch.match(CHAT_LINK_TRAILING_PUNCTUATION_PATTERN);
    const trailingText = trailingMatch?.[0] ?? '';
    const linkText = trailingText ? rawMatch.slice(0, -trailingText.length) : rawMatch;
    const href = normalizeChatLinkHref(linkText);

    if (!href || linkText.length === 0) {
      continue;
    }

    if (matchIndex > cursor) {
      nodes.push(text.slice(cursor, matchIndex));
    }

    nodes.push(
      <a
        key={`${matchIndex}-${linkText}`}
        className="chat-message-link"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {linkText}
      </a>
    );

    if (trailingText) {
      nodes.push(trailingText);
    }

    cursor = matchIndex + rawMatch.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [text];
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

function MessageInfoDialog({
  message,
  onClose
}: {
  message: ChatMessage;
  onClose: () => void;
}): JSX.Element {
  const deliveryLabel = formatDeliveryLabel(message.deliveryState, message.readAt);

  return (
    <div
      className="chat-message-info"
      role="dialog"
      aria-modal="true"
      aria-label="Info messaggio"
      onClick={onClose}
    >
      <article className="chat-message-info__panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <small>Messaggio</small>
            <h3>Info</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi info messaggio">
            Chiudi
          </button>
        </header>

        <dl className="chat-message-info__list">
          <div>
            <dt>Stato</dt>
            <dd>{deliveryLabel}</dd>
          </div>
          <div>
            <dt>Inviato</dt>
            <dd>{formatMessageDateTime(message.createdAt)}</dd>
          </div>
          <div>
            <dt>Letto</dt>
            <dd>{message.readAt ? formatMessageDateTime(message.readAt) : 'Non ancora letto'}</dd>
          </div>
          {message.replyToMessageId && (
            <div>
              <dt>Risposta a</dt>
              <dd>{message.replyToMessageId}</dd>
            </div>
          )}
        </dl>

        {message.text && (
          <div className="chat-message-info__text">
            <small>Testo</small>
            <p>{message.text}</p>
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="chat-message-info__attachments">
            <small>Allegati</small>
            <ul>
              {message.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <span>{attachmentLabel(attachment)}</span>
                  <small>
                    {[attachment.name, formatAttachmentSize(attachment.sizeBytes), formatAttachmentDuration(attachment.duration)]
                      .filter(Boolean)
                      .join(' - ')}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
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

function ImagePreviewDialog({
  attachment,
  onClose
}: {
  attachment: ChatAttachment;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="chat-image-preview"
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      onClick={onClose}
    >
      <button
        className="chat-image-preview__close"
        type="button"
        onClick={onClose}
        aria-label="Chiudi immagine"
      >
        Chiudi
      </button>
      <div className="chat-image-preview__image" onClick={(event) => event.stopPropagation()}>
        <img src={attachment.dataUrl} alt={attachment.name} />
      </div>
    </div>
  );
}

function ChatAttachmentItem({
  attachment,
  onOpenImage
}: {
  attachment: ChatAttachment;
  onOpenImage?: (attachment: ChatAttachment) => void;
}): JSX.Element {
  const subtitle = [formatAttachmentDuration(attachment.duration), formatAttachmentSize(attachment.sizeBytes)]
    .filter(Boolean)
    .join(' - ');

  if (attachment.type === 'image') {
    return (
      <button
        className="chat-attachment-media"
        type="button"
        onClick={() => onOpenImage?.(attachment)}
        aria-label={`Apri ${attachment.name}`}
      >
        <img src={attachment.dataUrl} alt={attachment.name} />
      </button>
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

function chatSurfaceStyle(settings: ReturnType<typeof useAppStore>['persisted']['settings']): CSSProperties {
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
  const [imagePreviewAttachment, setImagePreviewAttachment] = useState<ChatAttachment | null>(null);
  const [messageInfo, setMessageInfo] = useState<ChatMessage | null>(null);
  const [voiceRecorderState, setVoiceRecorderState] = useState<VoiceRecorderState>('idle');
  const [voiceRecorderElapsed, setVoiceRecorderElapsed] = useState(0);
  const messagesRef = useRef<HTMLDivElement | null>(null);
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
  const resolvedThreadId = thread?.id ?? null;
  const latestMessageId = thread && thread.messages.length > 0
    ? thread.messages[thread.messages.length - 1].id
    : null;

  useEffect(() => {
    if (!resolvedThreadId) {
      return;
    }

    markThreadRead(resolvedThreadId);
  }, [markThreadRead, resolvedThreadId]);

  useEffect(() => {
    if (!resolvedThreadId) {
      return;
    }

    const messagesElement = messagesRef.current;
    if (!messagesElement) {
      return;
    }

    messagesElement.scrollTo({
      top: messagesElement.scrollHeight,
      behavior: 'smooth'
    });
  }, [latestMessageId, resolvedThreadId]);

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

  if (!thread && persisted.realtimeState !== 'connected') {
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

      <div className="chat-messages" ref={messagesRef}>
        {thread.messages.map((message, index) => {
          const replied = message.replyToMessageId
            ? thread.messages.find((candidate) => candidate.id === message.replyToMessageId)
            : undefined;
          const isGroupedWithPrevious = isSameMessageBlock(message, thread.messages[index - 1]);
          const isGroupedWithNext = isSameMessageBlock(message, thread.messages[index + 1]);
          const shouldShowMeta = !isGroupedWithNext;
          const rowClassName = [
            'chat-message-row',
            message.isMe ? 'chat-message-row--me' : '',
            isGroupedWithPrevious ? 'chat-message-row--grouped' : '',
            isGroupedWithNext ? 'chat-message-row--continues' : ''
          ].filter(Boolean).join(' ');

          return (
            <article key={message.id} className={rowClassName}>
              <div className="chat-message-row__body">
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

                  {message.text ? <p>{renderMessageTextWithLinks(message.text)}</p> : null}

                  {message.attachments && message.attachments.length > 0 ? (
                    <ul className="chat-attachments-list">
                      {message.attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <ChatAttachmentItem attachment={attachment} onOpenImage={setImagePreviewAttachment} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="chat-message-row__quick-actions">
                  {message.isMe && (
                    <button
                      type="button"
                      aria-label="Info messaggio"
                      onClick={() => setMessageInfo(message)}
                    >
                      Info
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label="Rispondi al messaggio"
                    onClick={() => setReplyToId(message.id)}
                  >
                    Rispondi
                  </button>
                </div>
              </div>

              {shouldShowMeta && (
                <div className="chat-message-row__meta">
                  <span>{message.time}</span>
                  {message.isMe && (
                    <span className="chat-bubble__delivery">
                      {formatDeliveryLabel(message.deliveryState, message.readAt)}
                    </span>
                  )}
                </div>
              )}
            </article>
          );
        })}
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
              ) : attachment.type === 'image' ? (
                <ChatAttachmentItem attachment={attachment} onOpenImage={setImagePreviewAttachment} />
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

      {imagePreviewAttachment && (
        <ImagePreviewDialog
          attachment={imagePreviewAttachment}
          onClose={() => setImagePreviewAttachment(null)}
        />
      )}

      {messageInfo && (
        <MessageInfoDialog message={messageInfo} onClose={() => setMessageInfo(null)} />
      )}
    </section>
  );
}
