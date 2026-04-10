import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChatAvatar } from '../../components/messages/ChatAvatar';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';

export function ChatDetailPage(): JSX.Element {
  const { threadId } = useParams();
  const { persisted, sendMessage } = useAppStore();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const thread = useMemo(
    () => persisted.threads.find((candidate) => candidate.id === threadId) ?? null,
    [persisted.threads, threadId]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [thread?.messages.length]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread) {
      return;
    }

    setSendError(null);
    setIsSending(true);
    const error = await sendMessage(thread.id, draft);
    setIsSending(false);

    if (error) {
      setSendError(error);
      return;
    }

    setDraft('');
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
          <p>{thread.isOnline ? 'Online' : 'Offline'}</p>
        </div>
      </header>

      <div className="chat-messages">
        {thread.messages.map((message) => (
          <article
            key={message.id}
            className={message.isMe ? 'chat-bubble chat-bubble--me' : 'chat-bubble'}
          >
            <p>{message.text}</p>
            <span>{message.time}</span>
          </article>
        ))}
        <div ref={endRef} />
      </div>

      <form className="chat-composer" onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Messaggio"
        />
        <Button disabled={!draft.trim() || isSending}>
          {isSending ? 'Invio...' : 'Invia'}
        </Button>
      </form>

      {sendError && <p className="form-feedback form-feedback--error">{sendError}</p>}
    </section>
  );
}
