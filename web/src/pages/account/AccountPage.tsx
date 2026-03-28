import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useAppStore } from '../../hooks/useAppStore';
import {
  EventHistoryStatus,
  UserGender,
  UserOrientation,
  UserShowMe,
  getDisplayName
} from '../../types/models';

type Section = 'profile' | 'security' | 'events' | 'settings';

const orientationLabels: Record<UserOrientation, string> = {
  straight: 'Etero',
  gay: 'Gay',
  lesbian: 'Lesbica',
  bisexual: 'Bisessuale',
  pansexual: 'Pansessuale',
  other: 'Altro'
};

const showMeLabels: Record<UserShowMe, string> = {
  men: 'Uomini',
  women: 'Donne',
  everyone: 'Tutti'
};

const genderLabels: Record<UserGender, string> = {
  male: 'Uomo',
  female: 'Donna',
  nonBinary: 'Non binario',
  other: 'Altro'
};

const historyStatusLabels: Record<EventHistoryStatus, string> = {
  confirmed: 'Confermato',
  waitlisted: 'In waiting list',
  cancelled: 'Annullato',
  promoted: 'Promosso dalla waiting list'
};

export function AccountPage(): JSX.Element {
  const navigate = useNavigate();
  const {
    currentUser,
    currentUserUpcomingEventHistory,
    localUsers,
    persisted,
    createLocalUser,
    updateAccountPreferences,
    updateSettings,
    willUserLoseEventRegistrations,
    switchLocalUser,
    removeLocalUser,
    seedDemoUsers,
    resetLocalData,
    logOut
  } = useAppStore();

  const [section, setSection] = useState<Section>('profile');
  const [feedback, setFeedback] = useState<string | null>(null);

  const [orientation, setOrientation] = useState<UserOrientation>(currentUser?.orientation ?? 'straight');
  const [showMe, setShowMe] = useState<UserShowMe>(currentUser?.showMe ?? 'everyone');
  const [smokes, setSmokes] = useState(Boolean(currentUser?.smokes));
  const [drinks, setDrinks] = useState(Boolean(currentUser?.drinks));
  const [hobbies, setHobbies] = useState(currentUser?.hobbies ?? '');
  const [passions, setPassions] = useState(currentUser?.passions ?? '');
  const [lookingFor, setLookingFor] = useState(currentUser?.lookingFor ?? '');
  const [favoriteSong, setFavoriteSong] = useState(currentUser?.favoriteSong ?? '');
  const [favoriteMovie, setFavoriteMovie] = useState(currentUser?.favoriteMovie ?? '');
  const [localUserEmail, setLocalUserEmail] = useState('');
  const [localUserPassword, setLocalUserPassword] = useState('');
  const [localUsersFeedback, setLocalUsersFeedback] = useState<string | null>(null);

  const options = useMemo(
    () => [
      { value: 'profile', label: 'Profilo' },
      { value: 'security', label: 'Sicurezza' },
      { value: 'events', label: 'Eventi' },
      { value: 'settings', label: 'Impostazioni' }
    ],
    []
  );

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  function savePreferences() {
    if (!currentUser) {
      return;
    }

    setFeedback(null);

    if (currentUser.gender && willUserLoseEventRegistrations(currentUser.gender, orientation)) {
      const confirmed = window.confirm(
        'Cambiare orientamento rimuovera eventuali iscrizioni evento correnti. Continuare?'
      );
      if (!confirmed) {
        return;
      }
    }

    const error = updateAccountPreferences({
      orientation,
      showMe,
      smokes,
      drinks,
      hobbies,
      passions,
      lookingFor,
      favoriteSong,
      favoriteMovie
    });

    setFeedback(error ?? 'Profilo aggiornato.');
  }

  function handleCreateLocalUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalUsersFeedback(null);

    const error = createLocalUser(localUserEmail, localUserPassword);
    if (error) {
      setLocalUsersFeedback(error);
      return;
    }

    setLocalUserEmail('');
    setLocalUserPassword('');
    setLocalUsersFeedback('Utente locale creato con successo.');
  }

  function handleSwitchLocalUser(email: string) {
    setLocalUsersFeedback(null);

    const error = switchLocalUser(email);
    if (error) {
      setLocalUsersFeedback(error);
      return;
    }

    setLocalUsersFeedback('Utente attivo aggiornato.');
    navigate('/app/home', { replace: true });
  }

  function handleRemoveLocalUser(email: string) {
    const confirmed = window.confirm('Vuoi davvero eliminare questo utente locale?');
    if (!confirmed) {
      return;
    }

    setLocalUsersFeedback(null);
    const error = removeLocalUser(email);
    setLocalUsersFeedback(error ?? 'Utente locale rimosso.');
  }

  function handleSeedDemoUsers() {
    const added = seedDemoUsers();
    setLocalUsersFeedback(
      added > 0
        ? `Aggiunti ${added} utenti demo. Password predefinita: DEMO_PASSWORD_REDACTED.`
        : 'Gli utenti demo sono gia presenti.'
    );
  }

  function handleResetLocalData() {
    const confirmed = window.confirm(
      'Reset completo: verranno rimossi utenti, stato evento e chat locali. Continuare?'
    );
    if (!confirmed) {
      return;
    }

    resetLocalData();
    setLocalUsersFeedback('Dati locali resettati.');
    navigate('/', { replace: true });
  }

  return (
    <section className="account-page fade-in-up">
      <header className="section-header">
        <p className="section-header__eyebrow">Account</p>
        <h2>{getDisplayName(currentUser)}</h2>
      </header>

      <SegmentedControl value={section} onChange={(value) => setSection(value as Section)} options={options} />

      {section === 'profile' && (
        <div className="account-stack">
          <Card title="Informazioni" subtitle="Dati base bloccati dopo il setup iniziale.">
            <div className="account-profile-head">
              {currentUser.profileImageData ? (
                <img src={currentUser.profileImageData} alt="Profilo" />
              ) : (
                <div className="account-profile-head__fallback">{getDisplayName(currentUser).slice(0, 1)}</div>
              )}

              <div>
                <h3>{getDisplayName(currentUser)}</h3>
                <p>{currentUser.email}</p>
              </div>
            </div>

            <dl className="account-details">
              <div>
                <dt>Nome</dt>
                <dd>{currentUser.firstName ?? '-'}</dd>
              </div>
              <div>
                <dt>Cognome</dt>
                <dd>{currentUser.lastName ?? '-'}</dd>
              </div>
              <div>
                <dt>Data di nascita</dt>
                <dd>{currentUser.birthDate ?? '-'}</dd>
              </div>
              <div>
                <dt>Genere</dt>
                <dd>{currentUser.gender ? genderLabels[currentUser.gender] : '-'}</dd>
              </div>
            </dl>

            <p className="text-muted">
              I dati anagrafici principali sono gestiti nel setup iniziale, come nella versione iOS.
            </p>
          </Card>

          <Card title="Preferenze">
            <div className="account-form-grid">
              <label>
                Orientamento
                <select
                  value={orientation}
                  onChange={(event) => setOrientation(event.target.value as UserOrientation)}
                >
                  {(Object.keys(orientationLabels) as UserOrientation[]).map((option) => (
                    <option key={option} value={option}>
                      {orientationLabels[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Mostrami
                <select value={showMe} onChange={(event) => setShowMe(event.target.value as UserShowMe)}>
                  {(Object.keys(showMeLabels) as UserShowMe[]).map((option) => (
                    <option key={option} value={option}>
                      {showMeLabels[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Hobby
                <textarea value={hobbies} onChange={(event) => setHobbies(event.target.value)} rows={2} />
              </label>

              <label>
                Passioni
                <textarea value={passions} onChange={(event) => setPassions(event.target.value)} rows={2} />
              </label>

              <label>
                Cosa cerchi
                <textarea
                  value={lookingFor}
                  onChange={(event) => setLookingFor(event.target.value)}
                  rows={2}
                />
              </label>

              <label>
                Canzone preferita
                <input value={favoriteSong} onChange={(event) => setFavoriteSong(event.target.value)} />
              </label>

              <label>
                Film preferito
                <input value={favoriteMovie} onChange={(event) => setFavoriteMovie(event.target.value)} />
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={smokes}
                  onChange={(event) => setSmokes(event.target.checked)}
                />
                <span>Fumi?</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={drinks}
                  onChange={(event) => setDrinks(event.target.checked)}
                />
                <span>Bevi alcolici?</span>
              </label>
            </div>

            <Button onClick={savePreferences}>Salva preferenze</Button>

            {feedback && <p className="form-feedback">{feedback}</p>}

            <Button variant="danger" onClick={logOut}>
              Disconnettiti
            </Button>
          </Card>
        </div>
      )}

      {section === 'security' && (
        <Card
          title="Sicurezza"
          subtitle="Per reset password usa il canale supporto email come nella versione iOS."
        >
          <p className="text-muted">Email profilo: {currentUser.email}</p>
          <Button
            onClick={() => {
              window.location.href = `mailto:support@example.com?subject=Password reset request&body=Profile email: ${currentUser.email}`;
            }}
          >
            Richiedi reset password
          </Button>
        </Card>
      )}

      {section === 'events' && (
        <Card title="Le mie iscrizioni eventi">
          {currentUserUpcomingEventHistory.length === 0 ? (
            <p className="text-muted">Nessuna attivita eventi futuri.</p>
          ) : (
            <ul className="history-list">
              {currentUserUpcomingEventHistory.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <p>{item.eventTitle}</p>
                  <small>
                    {new Intl.DateTimeFormat('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    }).format(new Date(item.eventDate))}
                    {' - '}
                    {historyStatusLabels[item.status]}
                  </small>
                </li>
              ))}
            </ul>
          )}

          <Link className="inline-link" to="/app/account/events">
            Apri cronologia completa
          </Link>
        </Card>
      )}

      {section === 'settings' && (
        <div className="account-stack">
          <Card title="Impostazioni app">
            <div className="settings-stack">
              <label>
                Tema
                <select
                  value={persisted.settings.themeMode}
                  onChange={(event) =>
                    updateSettings({ themeMode: event.target.value as 'system' | 'light' | 'dark' })
                  }
                >
                  <option value="system">Sistema</option>
                  <option value="light">Chiaro</option>
                  <option value="dark">Scuro</option>
                </select>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.notificationsEnabled}
                  onChange={(event) =>
                    updateSettings({ notificationsEnabled: event.target.checked })
                  }
                />
                <span>Notifiche</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showAge}
                  onChange={(event) => updateSettings({ showAge: event.target.checked })}
                />
                <span>Mostra eta</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showDistance}
                  onChange={(event) => updateSettings({ showDistance: event.target.checked })}
                />
                <span>Mostra distanza</span>
              </label>
            </div>
          </Card>

          <Card
            title="Gestione utenti locale"
            subtitle="Solo client-side: utile per testare rapidamente i flussi senza backend."
          >
            <form className="local-user-form" onSubmit={handleCreateLocalUser}>
              <label>
                Email nuovo utente
                <input
                  type="email"
                  value={localUserEmail}
                  onChange={(event) => setLocalUserEmail(event.target.value)}
                  placeholder="test@email.com"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={localUserPassword}
                  onChange={(event) => setLocalUserPassword(event.target.value)}
                  placeholder="Almeno 6 caratteri"
                />
              </label>

              <Button type="submit">Crea utente locale</Button>
            </form>

            <div className="local-user-tools">
              <Button variant="secondary" onClick={handleSeedDemoUsers}>
                Aggiungi utenti demo
              </Button>
              <Button variant="ghost" onClick={handleResetLocalData}>
                Reset dati locali
              </Button>
            </div>

            {localUsers.length === 0 ? (
              <p className="text-muted">Nessun utente locale disponibile.</p>
            ) : (
              <ul className="local-user-list">
                {localUsers.map((user) => (
                  <li key={user.email} className="local-user-row">
                    <div className="local-user-row__meta">
                      <p>{user.displayName}</p>
                      <small>{user.email}</small>
                      <small>
                        {user.isProfileComplete ? 'Profilo completo' : 'Profilo incompleto'}
                      </small>
                    </div>

                    <div className="local-user-row__actions">
                      {user.isCurrent ? (
                        <span className="local-user-badge">Attivo</span>
                      ) : (
                        <Button variant="secondary" onClick={() => handleSwitchLocalUser(user.email)}>
                          Usa utente
                        </Button>
                      )}

                      <Button variant="ghost" onClick={() => handleRemoveLocalUser(user.email)}>
                        Elimina
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {localUsersFeedback && <p className="form-feedback">{localUsersFeedback}</p>}
          </Card>
        </div>
      )}
    </section>
  );
}
