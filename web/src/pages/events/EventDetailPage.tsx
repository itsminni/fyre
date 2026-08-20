import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EventMetricTile } from '../../components/events/EventMetricTile';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useCountdown } from '../../hooks/useCountdown';
import { useAppStore } from '../../hooks/useAppStore';
import { useI18n } from '../../i18n';

export function EventDetailPage(): JSX.Element {
  const {
    mainEventConfig,
    mainEventInfo,
    mainEventSnapshot,
    mainEventFlags,
    hasMainEvent,
    isEventAdmin,
    registerCurrentUserForMainEvent,
    cancelCurrentUserMainEventRegistration
  } = useAppStore();
  const { language, t } = useI18n();
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eventDate = useMemo(() => new Date(mainEventConfig.date), [mainEventConfig.date]);

  const eventDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'it-IT', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(eventDate),
    [eventDate, language]
  );

  const cancellationCountdown = useCountdown(
    mainEventInfo.cancellationClosesAt ??
      new Date(eventDate.getTime() - 48 * 60 * 60 * 1000).toISOString()
  );
  const registrationCountdown = useCountdown(
    mainEventInfo.registrationClosesAt ??
      new Date(eventDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
  );

  const actionLabel = mainEventFlags.isRegistered
    ? t('events.action.cancel')
    : mainEventFlags.isWaiting
      ? t('events.action.leaveWaitlist')
      : t('events.action.join');

  async function onPrimaryAction() {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      const result =
        mainEventFlags.isRegistered || mainEventFlags.isWaiting
          ? await cancelCurrentUserMainEventRegistration()
          : await registerCurrentUserForMainEvent();

      setFeedback({
        text: result.message,
        isError: result.isError
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!hasMainEvent) {
    return (
      <section className="event-detail-page fade-in-up">
        <Card title={t('events.title')}>
          <p className="empty-state">{t('events.unavailable')}</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="event-detail-page fade-in-up">
      <article className="event-hero">
        <img src="/images/party-poster.png" alt={t('events.preview.posterAlt')} />
        <div className="event-hero__overlay">
          {(mainEventFlags.isRegistered || mainEventFlags.isWaiting) && (
            <span className="event-badge">
              {mainEventFlags.isRegistered ? t('events.badge.confirmed') : t('events.badge.pending')}
            </span>
          )}
          <h2>{mainEventSnapshot.title}</h2>
          <p>{eventDateLabel}</p>
        </div>
      </article>

      <div className="event-detail-grid">
        <Card title={t('events.detail.event')}>
          <p>{mainEventInfo.description || t('events.unavailable')}</p>
        </Card>

        {mainEventInfo.venue && (
          <Card title={t('events.detail.info')}>
            <ul className="event-list">
              <li>{mainEventInfo.venue}</li>
            </ul>
          </Card>
        )}

        {mainEventInfo.rules.length > 0 && (
          <Card title={t('events.detail.rules')}>
            <ul className="event-list">
              {mainEventInfo.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={t('events.detail.liveStatus')}>
          <div className="event-metric-grid">
            <EventMetricTile
              title={t('events.detail.capacity')}
              value={`${mainEventSnapshot.totalCount}/${mainEventSnapshot.maxParticipants}`}
              caption={`Waiting list: ${mainEventSnapshot.waitingListCount}`}
            />
            <EventMetricTile
              title={t('events.detail.men')}
              value={String(mainEventSnapshot.maleCount)}
              caption={t('events.detail.limitRemaining', {
                limit: mainEventSnapshot.maleLimit,
                remaining: mainEventSnapshot.remainingMaleSlots
              })}
            />
            <EventMetricTile
              title={t('events.detail.women')}
              value={String(mainEventSnapshot.femaleCount)}
              caption={t('events.detail.limitRemaining', {
                limit: mainEventSnapshot.femaleLimit,
                remaining: mainEventSnapshot.remainingFemaleSlots
              })}
            />
          </div>

          <p className="event-countdown">
            {t('events.detail.cancellationCountdown', { countdown: cancellationCountdown })}
          </p>
          <p className="event-countdown">
            {t('events.detail.registrationCountdown', { countdown: registrationCountdown })}
          </p>
        </Card>
      </div>

      {isEventAdmin && (
        <Card
          title={t('events.admin.title')}
          subtitle={t('events.admin.subtitle')}
          className="event-admin-card"
        >
          <p>Le modifiche e la gestione partecipanti passano dalla funzione Appwrite verificata.</p>
          <Link className="ui-button ui-button--primary" to="/app/events/admin">
            {t('events.admin.title')}
          </Link>
        </Card>
      )}

      <footer className="event-action-bar">
        <Button
          variant={mainEventFlags.isRegistered || mainEventFlags.isWaiting ? 'danger' : 'primary'}
          fullWidth
          disabled={isSubmitting}
          onClick={() => void onPrimaryAction()}
        >
          {actionLabel}
        </Button>

        {feedback && (
          <p className={feedback.isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
            {feedback.text}
          </p>
        )}
      </footer>
    </section>
  );
}
