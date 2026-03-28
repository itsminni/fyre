import { Link } from 'react-router-dom';
import { ChatAvatar } from '../../components/messages/ChatAvatar';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';

export function MessagesPage(): JSX.Element {
  const { persisted, deleteThread } = useAppStore();

  return (
    <section className="messages-page fade-in-up">
      <header className="section-header">
        <p className="section-header__eyebrow">Messaggi</p>
        <h2>Chat recenti</h2>
      </header>

      {persisted.threads.length === 0 ? (
        <div className="empty-panel">
          <h3>Nessuna chat</h3>
          <p>Inizia a matchare per vedere i messaggi.</p>
        </div>
      ) : (
        <ul className="thread-list">
          {persisted.threads.map((thread) => {
            const lastMessage = thread.messages[thread.messages.length - 1];
            return (
              <li key={thread.id} className="thread-row">
                <Link to={`/app/messages/${thread.id}`} className="thread-row__content">
                  <ChatAvatar name={thread.name} isOnline={thread.isOnline} />

                  <div className="thread-row__meta">
                    <p className="thread-row__name">{thread.name}</p>
                    <p className="thread-row__preview">{lastMessage?.text ?? 'Nessun messaggio'}</p>
                  </div>

                  <div className="thread-row__status">
                    <p>{lastMessage?.time ?? '--:--'}</p>
                    {thread.isOnline && <span>Online</span>}
                  </div>
                </Link>

                <Button variant="ghost" onClick={() => deleteThread(thread.id)}>
                  Elimina
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
