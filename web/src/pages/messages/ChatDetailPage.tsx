import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

export function ChatDetailPage(): JSX.Element {
  const { threadId } = useParams();
  const { persisted, sendMessage, markThreadRead } = useAppStore();
  const [draft, setDraft] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    <section className="chat-detail-page fade-in-up">
      <Link className="chat-back-link" to="/app/messages">
        Torna ai messaggi
      </Link>

      <header className="chat-detail-page__header">
        <ChatAvatar name={thread.name} size={40} isOnline={thread.isOnline} />
        <div>
          <h2>{thread.name}</h2>
          <p>{thread.isOnline ? 'Online ora' : formatLastSeen(thread.lastSeenAt)}</p>
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
                  <p>{replied.text || 'Allegato'}</p>
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
    </section>
  );
}