import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { MainEventSnapshot } from '../../types/models';

interface EventPreviewCardProps {
  snapshot: MainEventSnapshot;
  venue?: string;
  registrationBadge?: string;
}

export function EventPreviewCard({
  snapshot,
  venue,
  registrationBadge
}: EventPreviewCardProps): JSX.Element {
  const { language, t } = useI18n();
  const dateLabel = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(snapshot.date));

  return (
    <article className="event-preview-card">
      <Link className="event-preview-card__hero" to="/app/events/main" aria-label={t('events.preview.openDetail')}>
        <img src="/images/party-poster.png" alt={t('events.preview.posterAlt')} />
        <div className="event-preview-card__overlay">
          {registrationBadge && <span className="event-badge">{registrationBadge}</span>}
          <h3>{snapshot.title}</h3>
          <p>{dateLabel}</p>
        </div>
      </Link>

      <div className="event-preview-card__body">
        {venue && <p className="event-preview-card__meta">{venue}</p>}
        <p className="event-preview-card__meta">
          {t('events.preview.remainingSlots', {
            male: snapshot.remainingMaleSlots,
            female: snapshot.remainingFemaleSlots
          })}
        </p>
        <p className="event-preview-card__meta">
          {t('events.preview.registrations', {
            total: snapshot.totalCount,
            max: snapshot.maxParticipants,
            waiting: snapshot.waitingListCount
          })}
        </p>
      </div>
    </article>
  );
}
