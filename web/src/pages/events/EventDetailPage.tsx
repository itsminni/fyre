import { FormEvent, useEffect, useMemo, useState } from 'react';
import { EventMetricTile } from '../../components/events/EventMetricTile';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useCountdown } from '../../hooks/useCountdown';
import { useAppStore } from '../../hooks/useAppStore';
import { useI18n } from '../../i18n';
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
  const { language, t } = useI18n();
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
    new Date(eventDate.getTime() - 48 * 60 * 60 * 1000).toISOString()
  );
  const registrationCountdown = useCountdown(
    new Date(eventDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
  );

  const actionLabel = mainEventFlags.isRegistered
    ? t('events.action.cancel')
    : mainEventFlags.isWaiting
      ? t('events.action.leaveWaitlist')
      : t('events.action.join');

  async function onPrimaryAction() {
    const result =
      mainEventFlags.isRegistered || mainEventFlags.isWaiting
        ? await cancelCurrentUserMainEventRegistration()
        : await registerCurrentUserForMainEvent();

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
        <Card title={t('events.detail.event')} subtitle={mainEventInfo.description}>
          <ul className="event-list">
            <li>{t('events.detail.includedBuffet')}</li>
            <li>{t('events.detail.includedDrink')}</li>
            <li>{t('events.detail.dressCode', { dressCode: mainEventInfo.dressCode })}</li>
          </ul>
        </Card>

        <Card title={t('events.detail.info')}>
          <ul className="event-list">
            <li>{mainEventInfo.venue}</li>
            <li>{mainEventInfo.address}</li>
            <li>{t('events.detail.contribution', { contribution: mainEventInfo.contribution })}</li>
            <li>{t('events.detail.contact', { contact: mainEventInfo.contact })}</li>
          </ul>
        </Card>

        <Card title={t('events.detail.rules')}>
          <ul className="event-list">
            {mainEventInfo.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </Card>

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
          <form className="event-admin-form" onSubmit={onAdminSave}>
            <label>
              {t('events.admin.eventTitle')}
              <input value={adminTitle} onChange={(event) => setAdminTitle(event.target.value)} />
            </label>

            <label>
              {t('events.admin.dateTime')}
              <input
                type="datetime-local"
                value={adminDate}
                onChange={(event) => setAdminDate(event.target.value)}
              />
            </label>

            <label>
              {t('events.admin.capacityTotal')}
              <input
                type="number"
                min={2}
                value={adminMaxParticipants}
                onChange={(event) => setAdminMaxParticipants(event.target.value)}
              />
            </label>

            <label>
              {t('events.admin.capacityGender')}
              <input
                type="number"
                min={1}
                value={adminMaxPerGender}
                onChange={(event) => setAdminMaxPerGender(event.target.value)}
              />
            </label>

            <label>
              {t('events.admin.venue')}
              <input value={adminVenue} onChange={(event) => setAdminVenue(event.target.value)} />
            </label>

            <label>
              {t('events.admin.address')}
              <input value={adminAddress} onChange={(event) => setAdminAddress(event.target.value)} />
            </label>

            <label>
              {t('events.admin.time')}
              <input value={adminTimeLabel} onChange={(event) => setAdminTimeLabel(event.target.value)} />
            </label>

            <label>
              {t('events.admin.contribution')}
              <input
                value={adminContribution}
                onChange={(event) => setAdminContribution(event.target.value)}
              />
            </label>

            <label>
              {t('events.admin.contact')}
              <input value={adminContact} onChange={(event) => setAdminContact(event.target.value)} />
            </label>

            <label>
              {t('events.admin.dressCode')}
              <input
                value={adminDressCode}
                onChange={(event) => setAdminDressCode(event.target.value)}
              />
            </label>

            <label>
              {t('events.admin.description')}
              <textarea
                rows={3}
                value={adminDescription}
                onChange={(event) => setAdminDescription(event.target.value)}
              />
            </label>

            <label>
              {t('events.admin.rules')}
              <textarea rows={4} value={adminRules} onChange={(event) => setAdminRules(event.target.value)} />
            </label>

            <Button type="submit">{t('events.admin.save')}</Button>
          </form>

          <form className="event-admin-form event-admin-form--participants" onSubmit={onAddParticipant}>
            <label>
              {t('events.admin.participantEmail')}
              <input
                type="email"
                value={participantEmail}
                onChange={(event) => setParticipantEmail(event.target.value)}
                placeholder="nome@email.com"
              />
            </label>

            <label>
              {t('account.gender')}
              <select
                value={participantGender}
                onChange={(event) => setParticipantGender(event.target.value as UserGender)}
              >
                {genderOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'male' ? t('gender.male') : t('gender.female')}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {t('events.admin.destination')}
              <select
                value={participantDestination}
                onChange={(event) =>
                  setParticipantDestination(event.target.value as 'participants' | 'waitingList')
                }
              >
                <option value="participants">{t('events.admin.participants')}</option>
                <option value="waitingList">Waiting list</option>
              </select>
            </label>

            <Button type="submit" variant="secondary">
              {t('events.admin.add')}
            </Button>
          </form>

          <div className="event-admin-lists">
            <div>
              <h4>{t('events.admin.participants')} ({persisted.mainEventState.participants.length})</h4>
              <ul>
                {persisted.mainEventState.participants.map((participant) => (
                  <li key={participant.email}>
                    <span>{participant.email}</span>
                    <Button
                      variant="ghost"
                      onClick={() => onRemoveParticipant(participant.email, 'participants')}
                    >
                      {t('events.admin.remove')}
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
                      {t('events.admin.remove')}
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
