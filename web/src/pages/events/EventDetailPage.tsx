import { useMemo, useState } from 'react';
import { EventMetricTile } from '../../components/events/EventMetricTile';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useCountdown } from '../../hooks/useCountdown';
import { useAppStore } from '../../hooks/useAppStore';

export function EventDetailPage(): JSX.Element {
  const {
    mainEventConfig,
    mainEventInfo,
    mainEventSnapshot,
    mainEventFlags,
    registerCurrentUserForMainEvent,
    cancelCurrentUserMainEventRegistration
  } = useAppStore();
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const eventDate = new Date(mainEventConfig.date);

  const eventDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('it-IT', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(eventDate),
    [eventDate]
  );

  const cancellationCountdown = useCountdown(
    new Date(eventDate.getTime() - 48 * 60 * 60 * 1000).toISOString()
  );
  const registrationCountdown = useCountdown(
    new Date(eventDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
  );

  const actionLabel = mainEventFlags.isRegistered
    ? 'Annulla iscrizione'
    : mainEventFlags.isWaiting
      ? 'Esci dalla waiting list'
      : 'Partecipa all evento';

  function onPrimaryAction() {
    const result = mainEventFlags.isRegistered || mainEventFlags.isWaiting
      ? cancelCurrentUserMainEventRegistration()
      : registerCurrentUserForMainEvent();

    setFeedback({
      text: result.message,
      isError: result.isError
    });
  }

  return (
    <section className="event-detail-page fade-in-up">
      <article className="event-hero">
        <img src="/images/party-poster.png" alt="Evento principale" />
        <div className="event-hero__overlay">
          {(mainEventFlags.isRegistered || mainEventFlags.isWaiting) && (
            <span className="event-badge">
              {mainEventFlags.isRegistered ? 'Confermato' : 'In attesa'}
            </span>
          )}
          <h2>{mainEventSnapshot.title}</h2>
          <p>{eventDateLabel}</p>
        </div>
      </article>

      <div className="event-detail-grid">
        <Card title="Evento principale" subtitle={mainEventInfo.description}>
          <ul className="event-list">
            <li>Buffet serale incluso</li>
            <li>Drink di benvenuto incluso</li>
            <li>Dress code: {mainEventInfo.dressCode}</li>
          </ul>
        </Card>

        <Card title="Info evento">
          <ul className="event-list">
            <li>{mainEventInfo.venue}</li>
            <li>{mainEventInfo.address}</li>
            <li>{mainEventInfo.timeLabel}</li>
            <li>Contributo: {mainEventInfo.contribution}</li>
            <li>Contatto: {mainEventInfo.contact}</li>
          </ul>
        </Card>

        <Card title="Regole">
          <ul className="event-list">
            {mainEventInfo.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </Card>

        <Card title="Stato live">
          <div className="event-metric-grid">
            <EventMetricTile
              title="Capienza"
              value={`${mainEventSnapshot.totalCount}/${mainEventSnapshot.maxParticipants}`}
              caption={`Waiting list: ${mainEventSnapshot.waitingListCount}`}
            />
            <EventMetricTile
              title="Uomini"
              value={String(mainEventSnapshot.maleCount)}
              caption={`Posti rimanenti: ${mainEventSnapshot.remainingMaleSlots}`}
            />
            <EventMetricTile
              title="Donne"
              value={String(mainEventSnapshot.femaleCount)}
              caption={`Posti rimanenti: ${mainEventSnapshot.remainingFemaleSlots}`}
            />
          </div>

          <p className="event-countdown">Disdetta disponibile per: {cancellationCountdown}</p>
          <p className="event-countdown">Iscrizioni aperte ancora per: {registrationCountdown}</p>
        </Card>
      </div>

      <footer className="event-action-bar">
        <Button
          variant={mainEventFlags.isRegistered || mainEventFlags.isWaiting ? 'danger' : 'primary'}
          fullWidth
          onClick={onPrimaryAction}
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
