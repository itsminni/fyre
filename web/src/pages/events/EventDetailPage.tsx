import { FormEvent, useEffect, useMemo, useState } from 'react';
import { EventMetricTile } from '../../components/events/EventMetricTile';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useCountdown } from '../../hooks/useCountdown';
import { useAppStore } from '../../hooks/useAppStore';
import { UserGender } from '../../types/models';

const genderOptions: UserGender[] = ['male', 'female'];

export function EventDetailPage(): JSX.Element {
  const {
    mainEventConfig,
    mainEventInfo,
    mainEventSnapshot,
    mainEventFlags,
    isEventAdmin,
    persisted,
    registerCurrentUserForMainEvent,
    cancelCurrentUserMainEventRegistration,
    updateMainEventConfig,
    updateMainEventInfo,
    adminAddMainEventParticipant,
    adminRemoveMainEventParticipant
  } = useAppStore();
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const [adminTitle, setAdminTitle] = useState(mainEventConfig.title);
  const [adminDate, setAdminDate] = useState(mainEventConfig.date.slice(0, 16));
  const [adminMaxParticipants, setAdminMaxParticipants] = useState(String(mainEventConfig.maxParticipants));
  const [adminMaxPerGender, setAdminMaxPerGender] = useState(String(mainEventConfig.maxPerGender));
  const [adminVenue, setAdminVenue] = useState(mainEventInfo.venue);
  const [adminAddress, setAdminAddress] = useState(mainEventInfo.address);
  const [adminTimeLabel, setAdminTimeLabel] = useState(mainEventInfo.timeLabel);
  const [adminContribution, setAdminContribution] = useState(mainEventInfo.contribution);
  const [adminContact, setAdminContact] = useState(mainEventInfo.contact);
  const [adminDressCode, setAdminDressCode] = useState(mainEventInfo.dressCode);
  const [adminDescription, setAdminDescription] = useState(mainEventInfo.description);
  const [adminRules, setAdminRules] = useState(mainEventInfo.rules.join('\n'));

  const [participantEmail, setParticipantEmail] = useState('');
  const [participantGender, setParticipantGender] = useState<UserGender>('male');
  const [participantDestination, setParticipantDestination] = useState<'participants' | 'waitingList'>(
    'participants'
  );

  const eventDate = new Date(mainEventConfig.date);

  useEffect(() => {
    setAdminTitle(mainEventConfig.title);
    setAdminDate(mainEventConfig.date.slice(0, 16));
    setAdminMaxParticipants(String(mainEventConfig.maxParticipants));
    setAdminMaxPerGender(String(mainEventConfig.maxPerGender));
  }, [mainEventConfig]);

  useEffect(() => {
    setAdminVenue(mainEventInfo.venue);
    setAdminAddress(mainEventInfo.address);
    setAdminTimeLabel(mainEventInfo.timeLabel);
    setAdminContribution(mainEventInfo.contribution);
    setAdminContact(mainEventInfo.contact);
    setAdminDressCode(mainEventInfo.dressCode);
    setAdminDescription(mainEventInfo.description);
    setAdminRules(mainEventInfo.rules.join('\n'));
  }, [mainEventInfo]);

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
    const result =
      mainEventFlags.isRegistered || mainEventFlags.isWaiting
        ? cancelCurrentUserMainEventRegistration()
        : registerCurrentUserForMainEvent();

    setFeedback({
      text: result.message,
      isError: result.isError
    });
  }

  function onAdminSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const configError = updateMainEventConfig({
      title: adminTitle.trim(),
      date: new Date(adminDate).toISOString(),
      maxParticipants: Number(adminMaxParticipants),
      maxPerGender: Number(adminMaxPerGender)
    });

    if (configError) {
      setFeedback({ text: configError, isError: true });
      return;
    }

    updateMainEventInfo({
      venue: adminVenue.trim(),
      address: adminAddress.trim(),
      timeLabel: adminTimeLabel.trim(),
      contribution: adminContribution.trim(),
      contact: adminContact.trim(),
      dressCode: adminDressCode.trim(),
      description: adminDescription.trim(),
      rules: adminRules
        .split('\n')
        .map((rule) => rule.trim())
        .filter(Boolean)
    });

    setFeedback({ text: 'Evento aggiornato con successo.', isError: false });
  }

  function onAddParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const error = adminAddMainEventParticipant(
      participantEmail,
      participantGender,
      participantDestination
    );

    if (error) {
      setFeedback({ text: error, isError: true });
      return;
    }

    setParticipantEmail('');
    setFeedback({ text: 'Partecipante inserito.', isError: false });
  }

  function onRemoveParticipant(email: string, destination: 'participants' | 'waitingList') {
    const error = adminRemoveMainEventParticipant(email, destination);
    if (error) {
      setFeedback({ text: error, isError: true });
      return;
    }

    setFeedback({ text: 'Partecipante rimosso.', isError: false });
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

      {isEventAdmin && (
        <Card
          title="Amministrazione evento"
          subtitle="Aggiorna dati evento e gestisci partecipanti/waiting list come su iOS."
          className="event-admin-card"
        >
          <form className="event-admin-form" onSubmit={onAdminSave}>
            <label>
              Titolo evento
              <input value={adminTitle} onChange={(event) => setAdminTitle(event.target.value)} />
            </label>

            <label>
              Data e ora
              <input
                type="datetime-local"
                value={adminDate}
                onChange={(event) => setAdminDate(event.target.value)}
              />
            </label>

            <label>
              Capienza totale
              <input
                type="number"
                min={2}
                value={adminMaxParticipants}
                onChange={(event) => setAdminMaxParticipants(event.target.value)}
              />
            </label>

            <label>
              Capienza per genere
              <input
                type="number"
                min={1}
                value={adminMaxPerGender}
                onChange={(event) => setAdminMaxPerGender(event.target.value)}
              />
            </label>

            <label>
              Venue
              <input value={adminVenue} onChange={(event) => setAdminVenue(event.target.value)} />
            </label>

            <label>
              Indirizzo
              <input value={adminAddress} onChange={(event) => setAdminAddress(event.target.value)} />
            </label>

            <label>
              Orario
              <input value={adminTimeLabel} onChange={(event) => setAdminTimeLabel(event.target.value)} />
            </label>

            <label>
              Contributo
              <input
                value={adminContribution}
                onChange={(event) => setAdminContribution(event.target.value)}
              />
            </label>

            <label>
              Contatto
              <input value={adminContact} onChange={(event) => setAdminContact(event.target.value)} />
            </label>

            <label>
              Dress code
              <input
                value={adminDressCode}
                onChange={(event) => setAdminDressCode(event.target.value)}
              />
            </label>

            <label>
              Descrizione
              <textarea
                rows={3}
                value={adminDescription}
                onChange={(event) => setAdminDescription(event.target.value)}
              />
            </label>

            <label>
              Regole (una per riga)
              <textarea rows={4} value={adminRules} onChange={(event) => setAdminRules(event.target.value)} />
            </label>

            <Button type="submit">Salva modifiche evento</Button>
          </form>

          <form className="event-admin-form event-admin-form--participants" onSubmit={onAddParticipant}>
            <label>
              Email partecipante
              <input
                type="email"
                value={participantEmail}
                onChange={(event) => setParticipantEmail(event.target.value)}
                placeholder="nome@email.com"
              />
            </label>

            <label>
              Genere
              <select
                value={participantGender}
                onChange={(event) => setParticipantGender(event.target.value as UserGender)}
              >
                {genderOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'male' ? 'Uomo' : 'Donna'}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Destinazione
              <select
                value={participantDestination}
                onChange={(event) =>
                  setParticipantDestination(event.target.value as 'participants' | 'waitingList')
                }
              >
                <option value="participants">Partecipanti</option>
                <option value="waitingList">Waiting list</option>
              </select>
            </label>

            <Button type="submit" variant="secondary">
              Aggiungi
            </Button>
          </form>

          <div className="event-admin-lists">
            <div>
              <h4>Partecipanti ({persisted.mainEventState.participants.length})</h4>
              <ul>
                {persisted.mainEventState.participants.map((participant) => (
                  <li key={participant.email}>
                    <span>{participant.email}</span>
                    <Button
                      variant="ghost"
                      onClick={() => onRemoveParticipant(participant.email, 'participants')}
                    >
                      Rimuovi
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4>Waiting list ({persisted.mainEventState.waitingList.length})</h4>
              <ul>
                {persisted.mainEventState.waitingList.map((participant) => (
                  <li key={participant.email}>
                    <span>{participant.email}</span>
                    <Button
                      variant="ghost"
                      onClick={() => onRemoveParticipant(participant.email, 'waitingList')}
                    >
                      Rimuovi
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

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