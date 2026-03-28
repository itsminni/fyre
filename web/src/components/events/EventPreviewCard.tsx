import { Link } from 'react-router-dom';
import { MainEventSnapshot } from '../../types/models';

interface EventPreviewCardProps {
  snapshot: MainEventSnapshot;
  registrationBadge?: string;
}

export function EventPreviewCard({
  snapshot,
  registrationBadge
}: EventPreviewCardProps): JSX.Element {
  const dateLabel = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(snapshot.date));

  return (
    <article className="event-preview-card">
      <div className="event-preview-card__hero">
        <img src="/images/party-poster.png" alt="Poster evento" />
        <div className="event-preview-card__overlay">
          {registrationBadge && <span className="event-badge">{registrationBadge}</span>}
          <h3>{snapshot.title}</h3>
          <p>{dateLabel}</p>
        </div>
      </div>

      <div className="event-preview-card__body">
        <p className="event-preview-card__meta">EVENT_VENUE_REDACTED</p>
        <p className="event-preview-card__meta">
          Posti rimanenti - M: {snapshot.remainingMaleSlots}, F: {snapshot.remainingFemaleSlots}
        </p>
        <p className="event-preview-card__meta">
          Iscritti: {snapshot.totalCount}/{snapshot.maxParticipants} - Waiting: {snapshot.waitingListCount}
        </p>

        <Link className="event-preview-card__link" to="/app/events/main">
          Apri dettaglio evento
        </Link>
      </div>
    </article>
  );
}
