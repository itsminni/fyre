import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../hooks/useAppStore';
import {
  EventAdminDraftInput,
  EventAdminMutableStatus,
  EventAdminParticipant,
  EventAdminState,
  EventHistoryStatus
} from '../../types/models';

interface AdminDraftFormState {
  title: string;
  startsAt: string;
  maxParticipants: string;
  maleLimit: string;
  femaleLimit: string;
  registrationClosesAt: string;
  cancellationClosesAt: string;
  adminUserIds: string;
  adminEmails: string;
}

const ADMIN_STATUS_OPTIONS: EventAdminMutableStatus[] = ['confirmed', 'waitlisted', 'promoted'];
const PARTICIPANT_STATUS_LABEL: Record<EventHistoryStatus, string> = {
  confirmed: 'Confermato',
  promoted: 'Promosso',
  waitlisted: 'Waiting list',
  cancelled: 'Annullato'
};

function toDateTimeLocal(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoString(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function makeDraftFormState(state: EventAdminState): AdminDraftFormState {
  return {
    title: state.title,
    startsAt: toDateTimeLocal(state.startsAt),
    maxParticipants: String(state.maxParticipants),
    maleLimit: String(state.maleLimit),
    femaleLimit: String(state.femaleLimit),
    registrationClosesAt: toDateTimeLocal(state.registrationClosesAt),
    cancellationClosesAt: toDateTimeLocal(state.cancellationClosesAt),
    adminUserIds: state.adminUserIds,
    adminEmails: state.adminEmails
  };
}

function participantSubtitle(participant: EventAdminParticipant): string {
  if (!participant.createdAt) {
    return 'Data non disponibile';
  }

  const date = new Date(participant.createdAt);
  if (Number.isNaN(date.getTime())) {
    return 'Data non disponibile';
  }

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function EventAdminPage(): JSX.Element {
  const {
    isEventAdminEnabled,
    fetchMainEventAdminState,
    updateMainEventAsAdmin,
    addMainEventParticipantAsAdmin,
    removeMainEventParticipantAsAdmin
  } = useAppStore();

  const [adminState, setAdminState] = useState<EventAdminState | null>(null);
  const [draft, setDraft] = useState<AdminDraftFormState | null>(null);
  const [lookup, setLookup] = useState('');
  const [statusToAdd, setStatusToAdd] = useState<EventAdminMutableStatus>('confirmed');
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasState = Boolean(adminState && draft);

  const participantsByStatus = useMemo(() => {
    if (!adminState) {
      return [];
    }

    return adminState.participants;
  }, [adminState]);

  const reloadState = useCallback(async () => {
    if (!isEventAdminEnabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const result = await fetchMainEventAdminState();
    setIsLoading(false);

    if (!result.state || result.error) {
      setFeedback({
        text: result.error ?? 'Impossibile caricare lo stato admin evento.',
        isError: true
      });
      return;
    }

    setFeedback(null);
    setAdminState(result.state);
    setDraft(makeDraftFormState(result.state));
  }, [fetchMainEventAdminState, isEventAdminEnabled]);

  useEffect(() => {
    void reloadState();
  }, [reloadState]);

  async function onSaveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!adminState || !draft) {
      return;
    }

    const startsAt = toIsoString(draft.startsAt);
    if (!startsAt) {
      setFeedback({
        text: 'Inserisci una data evento valida.',
        isError: true
      });
      return;
    }

    const payload: EventAdminDraftInput = {
      title: draft.title.trim(),
      startsAt,
      maxParticipants: Number(draft.maxParticipants),
      maleLimit: Number(draft.maleLimit),
      femaleLimit: Number(draft.femaleLimit),
      registrationClosesAt: toIsoString(draft.registrationClosesAt),
      cancellationClosesAt: toIsoString(draft.cancellationClosesAt),
      adminUserIds: draft.adminUserIds.trim(),
      adminEmails: draft.adminEmails.trim()
    };

    if (!payload.title) {
      setFeedback({
        text: 'Il titolo evento non puo essere vuoto.',
        isError: true
      });
      return;
    }

    setIsSubmitting(true);
    const result = await updateMainEventAsAdmin(adminState.eventId, payload);
    setIsSubmitting(false);

    if (!result.state || result.error) {
      setFeedback({
        text: result.error ?? 'Aggiornamento evento non riuscito.',
        isError: true
      });
      return;
    }

    setAdminState(result.state);
    setDraft(makeDraftFormState(result.state));
    setFeedback({
      text: 'Configurazione evento aggiornata.',
      isError: false
    });
  }

  async function onAddParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!adminState) {
      return;
    }

    const normalizedLookup = lookup.trim();
    if (!normalizedLookup) {
      setFeedback({
        text: 'Inserisci email o user id del partecipante.',
        isError: true
      });
      return;
    }

    setIsSubmitting(true);
    const result = await addMainEventParticipantAsAdmin(adminState.eventId, normalizedLookup, statusToAdd);
    setIsSubmitting(false);

    if (!result.state || result.error) {
      setFeedback({
        text: result.error ?? 'Inserimento partecipante non riuscito.',
        isError: true
      });
      return;
    }

    setAdminState(result.state);
    setLookup('');
    setFeedback({
      text: 'Partecipante aggiornato con successo.',
      isError: false
    });
  }

  async function onRemoveParticipant(registrationId: string): Promise<void> {
    if (!adminState) {
      return;
    }

    setIsSubmitting(true);
    const result = await removeMainEventParticipantAsAdmin(adminState.eventId, registrationId);
    setIsSubmitting(false);

    if (!result.state || result.error) {
      setFeedback({
        text: result.error ?? 'Rimozione partecipante non riuscita.',
        isError: true
      });
      return;
    }

    setAdminState(result.state);
    setFeedback({
      text: 'Partecipante rimosso.',
      isError: false
    });
  }

  if (!isEventAdminEnabled) {
    return (
      <section className="event-admin-page fade-in-up">
        <header className="section-header">
          <p className="section-header__eyebrow">Admin</p>
          <h2>Gestione evento</h2>
        </header>

        <div className="empty-panel">
          <h3>Funzione non disponibile</h3>
          <p>La funzione admin evento non risulta configurata per il web.</p>
          <Link className="inline-link" to="/app/events">
            Torna agli eventi
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="event-admin-page fade-in-up">
      <header className="section-header">
        <p className="section-header__eyebrow">Admin</p>
        <h2>Gestione evento</h2>
      </header>

      <Link className="inline-link" to="/app/events">
        Torna agli eventi
      </Link>

      {isLoading && (
        <div className="empty-panel">
          <h3>Caricamento in corso</h3>
          <p>Sto recuperando lo stato admin dell evento.</p>
        </div>
      )}

      {!isLoading && !hasState && (
        <div className="empty-panel">
          <h3>Nessun dato admin</h3>
          <p>{feedback?.text ?? 'Non e stato possibile caricare il pannello admin.'}</p>
          <Button variant="secondary" onClick={() => void reloadState()}>
            Riprova
          </Button>
        </div>
      )}

      {!isLoading && hasState && draft && adminState && (
        <>
          <Card title="Configurazione evento" subtitle="Aggiorna dettagli, limiti e scope admin.">
            <form className="event-admin-form" onSubmit={onSaveEvent}>
              <label>
                Titolo evento
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => (prev
                    ? { ...prev, title: event.target.value }
                    : prev))}
                  placeholder="Titolo"
                />
              </label>

              <div className="account-form-grid">
                <label>
                  Inizio evento
                  <input
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(event) => setDraft((prev) => (prev
                      ? { ...prev, startsAt: event.target.value }
                      : prev))}
                  />
                </label>

                <label>
                  Max partecipanti
                  <input
                    type="number"
                    min={2}
                    value={draft.maxParticipants}
                    onChange={(event) => setDraft((prev) => (prev
                      ? { ...prev, maxParticipants: event.target.value }
                      : prev))}
                  />
                </label>

                <label>
                  Limite uomini
                  <input
                    type="number"
                    min={0}
                    value={draft.maleLimit}
                    onChange={(event) => setDraft((prev) => (prev
                      ? { ...prev, maleLimit: event.target.value }
                      : prev))}
                  />
                </label>

                <label>
                  Limite donne
                  <input
                    type="number"
                    min={0}
                    value={draft.femaleLimit}
                    onChange={(event) => setDraft((prev) => (prev
                      ? { ...prev, femaleLimit: event.target.value }
                      : prev))}
                  />
                </label>

                <label>
                  Chiusura iscrizioni (opzionale)
                  <input
                    type="datetime-local"
                    value={draft.registrationClosesAt}
                    onChange={(event) => setDraft((prev) => (prev
                      ? { ...prev, registrationClosesAt: event.target.value }
                      : prev))}
                  />
                </label>

                <label>
                  Chiusura disdette (opzionale)
                  <input
                    type="datetime-local"
                    value={draft.cancellationClosesAt}
                    onChange={(event) => setDraft((prev) => (prev
                      ? { ...prev, cancellationClosesAt: event.target.value }
                      : prev))}
                  />
                </label>
              </div>

              <label>
                Admin user IDs (CSV)
                <input
                  value={draft.adminUserIds}
                  onChange={(event) => setDraft((prev) => (prev
                    ? { ...prev, adminUserIds: event.target.value }
                    : prev))}
                  placeholder="user_1,user_2"
                />
              </label>

              <label>
                Admin emails (CSV)
                <input
                  value={draft.adminEmails}
                  onChange={(event) => setDraft((prev) => (prev
                    ? { ...prev, adminEmails: event.target.value }
                    : prev))}
                  placeholder="admin@email.it,other@email.it"
                />
              </label>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Salvataggio...' : 'Salva modifiche'}
              </Button>
            </form>
          </Card>

          <Card title="Aggiungi partecipante" subtitle="Ricerca per email o user id Appwrite.">
            <form className="event-admin-participant-form" onSubmit={onAddParticipant}>
              <input
                value={lookup}
                onChange={(event) => setLookup(event.target.value)}
                placeholder="email o user id"
              />

              <select
                value={statusToAdd}
                onChange={(event) => setStatusToAdd(event.target.value as EventAdminMutableStatus)}
              >
                {ADMIN_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {PARTICIPANT_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Invio...' : 'Aggiungi'}
              </Button>
            </form>
          </Card>

          <Card title="Partecipanti" subtitle={`${participantsByStatus.length} record attivi`}>
            {participantsByStatus.length === 0 ? (
              <p className="text-muted">Nessun partecipante nel registro attivo.</p>
            ) : (
              <ul className="admin-participant-list">
                {participantsByStatus.map((participant) => (
                  <li key={participant.registrationId} className="admin-participant-row">
                    <div className="admin-participant-row__meta">
                      <p>{participant.displayName}</p>
                      <small>
                        {participant.email} - {PARTICIPANT_STATUS_LABEL[participant.status]} - {participantSubtitle(participant)}
                      </small>
                    </div>

                    <Button
                      variant="ghost"
                      onClick={() => void onRemoveParticipant(participant.registrationId)}
                      disabled={isSubmitting}
                    >
                      Rimuovi
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {feedback && (
        <p className={feedback.isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
          {feedback.text}
        </p>
      )}
    </section>
  );
}
