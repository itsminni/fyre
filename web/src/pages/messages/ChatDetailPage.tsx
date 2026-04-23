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

function fileToAttachment(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Formato allegato non supportato'));
        return;
      }

      resolve({
        id: crypto.randomUUID(),
        type: inferAttachmentType(file.type),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl: reader.result
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

function bubblePalette(name: string, isOutgoing: boolean): { background: string; border: string } {
  if (isOutgoing) {
    switch (name) {
      case 'ocean':
        return { background: 'rgba(70, 130, 180, 0.26)', border: 'rgba(70, 130, 180, 0.32)' };
      case 'graphite':
        return { background: 'rgba(48, 54, 64, 0.76)', border: 'rgba(150, 160, 180, 0.18)' };
      case 'default':
        return { background: 'rgba(255, 106, 59, 0.16)', border: 'rgba(255, 106, 59, 0.28)' };
      default:
        return { background: 'rgba(244, 114, 182, 0.18)', border: 'rgba(255, 148, 114, 0.3)' };
    }
  }

  switch (name) {
    case 'ocean':
      return { background: 'rgba(80, 130, 180, 0.12)', border: 'rgba(80, 130, 180, 0.2)' };
    case 'sunset':
      return { background: 'rgba(255, 173, 96, 0.12)', border: 'rgba(255, 173, 96, 0.22)' };
    case 'default':
      return { background: 'rgba(255, 255, 255, 0.14)', border: 'rgba(255, 255, 255, 0.16)' };
    default:
      return { background: 'rgba(28, 32, 38, 0.74)', border: 'rgba(255, 255, 255, 0.08)' };
  }
}

function chatSurfaceStyle(settings: ReturnType<typeof useAppStore>['persisted']['settings']): CSSProperties {
  const outgoing = bubblePalette(settings.outgoingBubblePalette, true);
  const incoming = bubblePalette(settings.incomingBubblePalette, false);

  return {
    '--chat-background-1': settings.chatBackgroundColor1,
    '--chat-background-2': settings.chatBackgroundColor2,
    '--chat-background-3': settings.chatBackgroundColor3,
    '--chat-background-brightness': String(1 + settings.chatBackgroundBrightness),
    '--chat-send-1': settings.sendButtonColor1,
    '--chat-send-2': settings.sendButtonColor2,
    '--chat-send-3': settings.sendButtonColor3,
    '--chat-bubble-outgoing-bg': outgoing.background,
    '--chat-bubble-outgoing-border': outgoing.border,
    '--chat-bubble-incoming-bg': incoming.background,
    '--chat-bubble-incoming-border': incoming.border
  } as CSSProperties;
}

export function ChatDetailPage(): JSX.Element {
  const navigate = useNavigate();
  const { threadId } = useParams();
  const { persisted, sendMessage, markThreadRead, applyRelationshipAction } = useAppStore();
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
  }, [markThreadRead, thread, thread?.messages.length]);

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
      setUploadError('Impossibile allegare uno o piu file.');
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

  if (!thread) {
    return (
      <section className="chat-detail-page fade-in-up">
        <Link className="chat-back-link" to="/app/messages">
          Torna ai messaggi
        </Link>
        <div className="empty-panel">
          <h3>Chat non trovata</h3>
          <p>Questa conversazione non esiste piu nella lista locale.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`chat-detail-page fade-in-up chat-detail-page--${persisted.settings.chatBackgroundStyle}`}
      style={themedSurfaceStyle}
    >
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
          <Button variant="ghost" onClick={() => void handleRelationshipAction('archive')}>
            Archivia
          </Button>
          <Button variant="ghost" onClick={() => void handleRelationshipAction('unmatch')}>
            Unmatch
          </Button>
          <Button variant="danger" onClick={() => void handleRelationshipAction('block')}>
            Blocca
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
                      {attachment.type === 'image' ? (
                        <a href={attachment.dataUrl} download={attachment.name} target="_blank" rel="noreferrer">
                          <img src={attachment.dataUrl} alt={attachment.name} />
                        </a>
                      ) : (
                        <a href={attachment.dataUrl} download={attachment.name} target="_blank" rel="noreferrer">
                          Scarica {attachment.name}
                        </a>
                      )}
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
