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
  EventHistoryStatus,
  EventPublicationStatus
} from '../../types/models';

interface AdminDraftFormState {
  status: EventPublicationStatus;
  title: string;
  place: string;
  description: string;
  rules: string;
  startsAt: string;
  maxParticipants: string;
  maleLimit: string;
  femaleLimit: string;
  registrationClosesAt: string;
  cancellationClosesAt: string;
}

const ADMIN_STATUS_OPTIONS: EventAdminMutableStatus[] = ['confirmed', 'waitlisted', 'promoted'];
const EVENT_STATUS_OPTIONS: EventPublicationStatus[] = [
  'draft',
  'active',
  'cancelled',
  'completed',
  'archived'
];
const EVENT_STATUS_LABEL: Record<EventPublicationStatus, string> = {
  active: 'Pubblicato',
  draft: 'Bozza',
  cancelled: 'Annullato',
  completed: 'Concluso',
  archived: 'Archiviato'
};
const MAX_EVENT_CAPACITY = 500;
const MAX_EVENT_RULES = 50;
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
    status: state.status,
    title: state.title,
    place: state.place,
    description: state.description,
    rules: state.rules.join('\n'),
    startsAt: toDateTimeLocal(state.startsAt),
    maxParticipants: String(state.maxParticipants),
    maleLimit: String(state.maleLimit),
    femaleLimit: String(state.femaleLimit),
    registrationClosesAt: toDateTimeLocal(state.registrationClosesAt),
    cancellationClosesAt: toDateTimeLocal(state.cancellationClosesAt)
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

    const rules = draft.rules.split('\n').map((rule) => rule.trim()).filter(Boolean);
    const payload: EventAdminDraftInput = {
      status: draft.status,
      title: draft.title.trim(),
      place: draft.place.trim(),
      description: draft.description.trim(),
      rules,
      startsAt,
      maxParticipants: Number(draft.maxParticipants),
      maleLimit: Number(draft.maleLimit),
      femaleLimit: Number(draft.femaleLimit),
      registrationClosesAt: toIsoString(draft.registrationClosesAt),
      cancellationClosesAt: toIsoString(draft.cancellationClosesAt)
    };

    if (!payload.title) {
      setFeedback({
        text: 'Il titolo evento non può essere vuoto.',
        isError: true
      });
      return;
    }

    if (
      payload.title.length > 200 ||
      payload.place.length > 256 ||
      payload.description.length > 4_000 ||
      rules.length > MAX_EVENT_RULES ||
      rules.some((rule) => rule.length > 500) ||
      !Number.isInteger(payload.maxParticipants) ||
      payload.maxParticipants < 2 ||
      payload.maxParticipants > MAX_EVENT_CAPACITY ||
      !Number.isInteger(payload.maleLimit) ||
      payload.maleLimit < 0 ||
      payload.maleLimit > MAX_EVENT_CAPACITY ||
      !Number.isInteger(payload.femaleLimit) ||
      payload.femaleLimit < 0 ||
      payload.femaleLimit > MAX_EVENT_CAPACITY
    ) {
      setFeedback({
        text: 'Controlla lunghezza dei testi, numero di regole e limiti partecipanti.',
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
          <p>Il pannello admin evento non risulta configurato.</p>
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
          <p>Sto recuperando lo stato admin dell'evento.</p>
        </div>
      )}

      {!isLoading && !hasState && (
        <div className="empty-panel">
          <h3>Nessun dato admin</h3>
          <p>{feedback?.text ?? 'Non è stato possibile caricare il pannello admin.'}</p>
          <Button variant="secondary" onClick={() => void reloadState()}>
            Riprova
          </Button>
        </div>
      )}

      {!isLoading && hasState && draft && adminState && (
        <>
          <Card title="Configurazione evento" subtitle="Aggiorna dettagli, limiti e scadenze.">
            <form className="event-admin-form" onSubmit={onSaveEvent}>
              <label>
                Stato di pubblicazione
                <select
                  value={draft.status}
                  onChange={(event) => setDraft((prev) => (prev
                    ? { ...prev, status: event.target.value as EventPublicationStatus }
                    : prev))}
                >
                  {EVENT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {EVENT_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Titolo evento
                <input
                  maxLength={200}
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => (prev
                    ? { ...prev, title: event.target.value }
                    : prev))}
                  placeholder="Titolo"
                />
              </label>

              <label>
                Luogo
                <input
                  maxLength={256}
                  value={draft.place}
                  onChange={(event) => setDraft((prev) => (prev
                    ? { ...prev, place: event.target.value }
                    : prev))}
                  placeholder="Luogo dell'evento"
                />
              </label>

              <label>
                Descrizione
                <textarea
                  rows={4}
                  maxLength={4_000}
                  value={draft.description}
                  onChange={(event) => setDraft((prev) => (prev
                    ? { ...prev, description: event.target.value }
                    : prev))}
                />
              </label>

              <label>
                Regole (una per riga)
                <textarea
                  rows={5}
                  maxLength={MAX_EVENT_RULES * 501}
                  value={draft.rules}
                  onChange={(event) => setDraft((prev) => (prev
                    ? { ...prev, rules: event.target.value }
                    : prev))}
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
                    max={MAX_EVENT_CAPACITY}
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
                    max={MAX_EVENT_CAPACITY}
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
                    max={MAX_EVENT_CAPACITY}
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
