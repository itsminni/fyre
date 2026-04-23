import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChatAvatar } from '../../components/messages/ChatAvatar';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import { formatLastSeen } from '../../context/AppContext';

const RELATIONSHIP_ACTION_LABELS = {
  archive: 'Archivia',
  unmatch: 'Unmatch',
  block: 'Blocca'
} as const;

function threadPreviewText(
  thread: ReturnType<typeof useAppStore>['persisted']['threads'][number]
): string {
  const lastMessage = thread.messages[thread.messages.length - 1];
  if (!lastMessage) {
    return 'Nessun messaggio';
  }

  if (lastMessage.text.trim()) {
    return lastMessage.text;
  }

  if (lastMessage.attachments?.length) {
    const [attachment] = lastMessage.attachments;
    switch (attachment.type) {
      case 'image':
        return 'Foto allegata';
      case 'video':
        return 'Video allegato';
      case 'audio':
        return 'Messaggio vocale';
      default:
        return attachment.name;
    }
  }

  return 'Nessun messaggio';
}

export function MessagesPage(): JSX.Element {
  const {
    persisted,
    applyRelationshipAction,
    markNotificationRead,
    markAllNotificationsRead,
    unreadNotificationsCount
  } = useAppStore();
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  async function handleRelationshipAction(
    threadId: string,
    action: keyof typeof RELATIONSHIP_ACTION_LABELS
  ): Promise<void> {
    setActionFeedback(null);
    const confirmed = window.confirm(
      `${RELATIONSHIP_ACTION_LABELS[action]} questa conversazione?`
    );
    if (!confirmed) {
      return;
    }

    const error = await applyRelationshipAction(threadId, action);
    if (error) {
      setActionFeedback(error);
    }
  }

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
            return (
              <li key={thread.id} className="thread-row">
                <Link to={`/app/messages/${thread.id}`} className="thread-row__content">
                  <ChatAvatar name={thread.name} isOnline={thread.isOnline} />

                  <div className="thread-row__meta">
                    <p className="thread-row__name">{thread.name}</p>
                    <p className="thread-row__preview">
                      {thread.isTyping ? 'Sta scrivendo...' : threadPreviewText(thread)}
                    </p>
                  </div>

                  <div className="thread-row__status">
                    <p>{thread.messages[thread.messages.length - 1]?.time ?? '--:--'}</p>
                    {thread.isOnline ? (
                      <span className="thread-status-online">Online</span>
                    ) : (
                      <span className="thread-status-lastseen">{formatLastSeen(thread.lastSeenAt)}</span>
                    )}
                    {thread.unreadCount > 0 && <strong>{thread.unreadCount} nuovi</strong>}
                  </div>
                </Link>

                <div className="thread-row__actions">
                  <Button
                    variant="ghost"
                    onClick={() => void handleRelationshipAction(thread.id, 'archive')}
                  >
                    Archivia
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void handleRelationshipAction(thread.id, 'unmatch')}
                  >
                    Unmatch
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => void handleRelationshipAction(thread.id, 'block')}
                  >
                    Blocca
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {actionFeedback && <p className="form-feedback form-feedback--error">{actionFeedback}</p>}
    </section>
  );
}
