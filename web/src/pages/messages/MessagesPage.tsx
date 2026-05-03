import { Link } from 'react-router-dom';
import { ChatAvatar } from '../../components/messages/ChatAvatar';
import { useAppStore } from '../../hooks/useAppStore';
import { useI18n } from '../../i18n';

function threadPreviewText(
  thread: ReturnType<typeof useAppStore>['persisted']['threads'][number],
  t: ReturnType<typeof useI18n>['t']
): string {
  const lastMessage = thread.messages[thread.messages.length - 1];
  if (!lastMessage) {
    return t('messages.noMessages');
  }

  if (lastMessage.text.trim()) {
    return lastMessage.text;
  }

  if (lastMessage.attachments?.length) {
    const [attachment] = lastMessage.attachments;
    switch (attachment.type) {
      case 'image':
        return t('messages.photo');
      case 'video':
        return t('messages.video');
      case 'audio':
        return t('messages.audio');
      default:
        return attachment.name;
    }
  }

  return t('messages.noMessages');
}

function formatThreadTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  return isToday
    ? new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit' }).format(date);
}

function outgoingStatusLabel(
  thread: ReturnType<typeof useAppStore>['persisted']['threads'][number],
  t: ReturnType<typeof useI18n>['t']
): string | null {
  const lastMessage = thread.messages[thread.messages.length - 1];
  if (!lastMessage || !lastMessage.isMe) {
    return null;
  }

  if (lastMessage.deliveryState === 'read' || Boolean(lastMessage.readAt)) {
    return t('messages.read');
  }

  if (lastMessage.deliveryState === 'sending') {
    return t('messages.sending');
  }

  return t('messages.sent');
}

export function MessagesPage(): JSX.Element {
  const { persisted } = useAppStore();
  const { t } = useI18n();

  return (
    <section className="messages-page fade-in-up">
      <header className="section-header">
        <h2>{t('messages.title')}</h2>
      </header>

      {persisted.threads.length === 0 ? (
        <div className="empty-panel">
          <h3>{t('messages.empty.title')}</h3>
          <p>{t('messages.empty.body')}</p>
        </div>
      ) : (
        <ul className="thread-list">
          {persisted.threads.map((thread) => {
            const lastMessage = thread.messages[thread.messages.length - 1];
            const statusLabel = outgoingStatusLabel(thread, t);

            return (
              <li key={thread.id} className="thread-row">
                <Link to={`/app/messages/${thread.id}`} className="thread-row__content">
                  <ChatAvatar name={thread.name} avatar={thread.avatar} isOnline={thread.isOnline} />

                  <div className="thread-row__meta">
                    <p className="thread-row__name">{thread.name}</p>
                    <p className="thread-row__preview">
                      {thread.isTyping ? t('messages.typing') : threadPreviewText(thread, t)}
                    </p>
                  </div>

                  <div className="thread-row__status">
                    <p>{lastMessage ? formatThreadTime(lastMessage.createdAt) : '--:--'}</p>
                    {thread.unreadCount > 0 ? (
                      <strong>{thread.unreadCount > 99 ? '99+' : thread.unreadCount}</strong>
                    ) : (
                      statusLabel && <span className="thread-status-lastseen">{statusLabel}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
