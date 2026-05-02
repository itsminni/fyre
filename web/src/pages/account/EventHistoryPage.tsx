import { Navigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { TranslationKey, useI18n } from '../../i18n';
import { EventHistoryStatus } from '../../types/models';

const historyStatusLabelKeys: Record<EventHistoryStatus, TranslationKey> = {
  confirmed: 'eventStatus.confirmed',
  waitlisted: 'eventStatus.waitlisted',
  cancelled: 'eventStatus.cancelled',
  promoted: 'eventStatus.promoted'
};

export function EventHistoryPage(): JSX.Element {
  const { currentUser, currentUserUpcomingEventHistory } = useAppStore();
  const { language, t } = useI18n();

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  return (
    <section className="event-history-page fade-in-up">
      <header className="section-header">
        <p className="section-header__eyebrow">{t('account.title')}</p>
        <h2>{t('events.history.title')}</h2>
      </header>

      <Card>
        {currentUserUpcomingEventHistory.length === 0 ? (
          <p className="text-muted">{t('account.events.empty')}</p>
        ) : (
          <ul className="history-list history-list--full">
            {currentUserUpcomingEventHistory.map((item) => (
              <li key={item.id}>
                <p>{item.eventTitle}</p>
                <small>
                  {new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'it-IT', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }).format(new Date(item.eventDate))}
                  {' - '}
                  {t(historyStatusLabelKeys[item.status])}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
