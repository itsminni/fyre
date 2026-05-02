import { CSSProperties, ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChatAvatar } from '../../components/messages/ChatAvatar';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import { formatLastSeen } from '../../context/AppContext';
import { ChatAttachment } from '../../types/models';

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
      <div className="chat-audio-player">
        <div className="chat-audio-player__icon" aria-hidden="true">&gt;</div>
        <div className="chat-audio-player__body">
          <audio controls preload="metadata" src={attachment.dataUrl} />
          <span>{subtitle || attachment.name}</span>
        </div>
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
  const { persisted, sendMessage, markThreadRead, setThreadNotifications, applyRelationshipAction } = useAppStore();
  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [relationshipFeedback, setRelationshipFeedback] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

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

  async function onAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    setUploadError(null);

    try {
      const loaded = await Promise.all(Array.from(files).map((file) => fileToAttachment(file)));
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
        <ChatAvatar name={thread.name} size={40} isOnline={thread.isOnline} />
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
              className={message.isMe ? 'chat-bubble chat-bubble--me' : 'chat-bubble'}
            >
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

              <div className="chat-bubble__meta">
                <span>{message.time}</span>
                {message.isMe && (
                  <span className="chat-bubble__delivery">
                    {formatDeliveryLabel(message.deliveryState, message.readAt)}
                  </span>
                )}
              </div>

              <button
                className="chat-bubble__reply-action"
                type="button"
                onClick={() => setReplyToId(message.id)}
              >
                Rispondi
              </button>
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
          <label className="chat-attach-button">
            <input type="file" multiple onChange={onAttachmentChange} />
            Allega
          </label>
        </div>

        <Button disabled={!draft.trim() && attachments.length === 0}>Invia</Button>
      </form>

      {attachments.length > 0 && (
        <ul className="chat-attachment-preview-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <span>{attachment.name}</span>
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
    </section>
  );
}
