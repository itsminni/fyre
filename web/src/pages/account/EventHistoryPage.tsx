import { Navigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { EventHistoryStatus } from '../../types/models';

const historyStatusLabels: Record<EventHistoryStatus, string> = {
  confirmed: 'Confermato',
  waitlisted: 'In waiting list',
  cancelled: 'Annullato',
  promoted: 'Promosso dalla waiting list'
};

export function EventHistoryPage(): JSX.Element {
  const { currentUser, currentUserUpcomingEventHistory } = useAppStore();

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  return (
    <section className="event-history-page fade-in-up">
      <header className="section-header">
        <p className="section-header__eyebrow">Account</p>
        <h2>Tutti gli eventi futuri</h2>
      </header>

      <Card>
        {currentUserUpcomingEventHistory.length === 0 ? (
          <p className="text-muted">Nessuna attivita eventi futuri.</p>
        ) : (
          <ul className="history-list history-list--full">
            {currentUserUpcomingEventHistory.map((item) => (
              <li key={item.id}>
                <p>{item.eventTitle}</p>
                <small>
                  {new Intl.DateTimeFormat('it-IT', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }).format(new Date(item.eventDate))}
                  {' - '}
                  {historyStatusLabels[item.status]}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
