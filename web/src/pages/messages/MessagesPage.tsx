import { Link } from 'react-router-dom';
import { ChatAvatar } from '../../components/messages/ChatAvatar';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import { formatLastSeen } from '../../context/AppContext';

export function MessagesPage(): JSX.Element {
  const {
    persisted,
    deleteThread,
    markNotificationRead,
    markAllNotificationsRead,
    unreadNotificationsCount
  } = useAppStore();

  return (
    <section className="messages-page fade-in-up">
      <header className="section-header">
        <p className="section-header__eyebrow">Messaggi</p>
        <h2>Chat recenti</h2>
      </header>

      <article className="inbox-panel">
        <div className="inbox-panel__header">
          <div>
            <h3>Notifiche</h3>
            <p>{unreadNotificationsCount > 0 ? `${unreadNotificationsCount} non lette` : 'Tutto letto'}</p>
          </div>
          <Button variant="ghost" onClick={markAllNotificationsRead}>
            Segna tutte lette
          </Button>
        </div>

        {persisted.notifications.length === 0 ? (
          <p className="text-muted">Nessuna notifica al momento.</p>
        ) : (
          <ul className="inbox-panel__list">
            {persisted.notifications.slice(0, 6).map((notification) => (
              <li
                key={notification.id}
                className={notification.readAt ? 'inbox-item' : 'inbox-item inbox-item--unread'}
              >
                <button
                  className="inbox-item__button"
                  onClick={() => markNotificationRead(notification.id)}
                >
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <small>
                    {new Intl.DateTimeFormat('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).format(new Date(notification.createdAt))}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

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
                    {thread.isOnline ? (
                      <span className="thread-status-online">Online</span>
                    ) : (
                      <span className="thread-status-lastseen">{formatLastSeen(thread.lastSeenAt)}</span>
                    )}
                    {thread.unreadCount > 0 && <strong>{thread.unreadCount} nuovi</strong>}
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
