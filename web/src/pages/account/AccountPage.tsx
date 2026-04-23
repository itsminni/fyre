import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useAppStore } from '../../hooks/useAppStore';
import {
  ChatBackgroundStyle,
  ChatBubblePalette,
  EventHistoryStatus,
  MatchIntent,
  ThemeMode,
  UserGender,
  UserOrientation,
  UserShowMe,
  calculateAge,
  getDisplayName
} from '../../types/models';

type Section = 'account' | 'preferences' | 'notifications' | 'security' | 'appearance' | 'events';

interface FeedbackState {
  isError: boolean;
  message: string;
}

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

const intentLabels: Record<MatchIntent, string> = {
  relationship: 'Relazione',
  friendship: 'Amicizia',
  casual: 'Casual',
  networking: 'Networking',
  notSure: 'Non so ancora'
};

const historyStatusLabels: Record<EventHistoryStatus, string> = {
  confirmed: 'Confermato',
  waitlisted: 'In waiting list',
  cancelled: 'Annullato',
  promoted: 'Promosso dalla waiting list'
};

const themeLabels: Record<ThemeMode, string> = {
  system: 'Sistema',
  light: 'Chiaro',
  dark: 'Scuro'
};

const chatBackgroundStyleLabels: Record<ChatBackgroundStyle, string> = {
  midnight: 'Midnight',
  sunset: 'Sunset',
  aurora: 'Aurora',
  custom: 'Custom'
};

const bubblePaletteLabels: Record<ChatBubblePalette, string> = {
  default: 'Default',
  sunset: 'Sunset',
  ocean: 'Ocean',
  graphite: 'Graphite'
};

function defaultPreferredGenders(
  preferredGenders: UserGender[] | undefined,
  showMe: UserShowMe | undefined
): UserGender[] {
  if (preferredGenders && preferredGenders.length > 0) {
    return preferredGenders;
  }

  if (showMe === 'men') {
    return ['male'];
  }

  if (showMe === 'women') {
    return ['female'];
  }

  return ['male', 'female'];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Formato immagine non supportato'));
    };
    reader.onerror = () => reject(new Error('Impossibile leggere il file'));
    reader.readAsDataURL(file);
  });
}

export function AccountPage(): JSX.Element {
  const navigate = useNavigate();
  const {
    currentUser,
    currentUserUpcomingEventHistory,
    localUsers,
    persisted,
    isBackendMode,
    mainEventSnapshot,
    mainEventFlags,
    createLocalUser,
    updateProfileImage,
    updateAccountPreferences,
    updateSettings,
    willUserLoseEventRegistrations,
    switchLocalUser,
    removeLocalUser,
    seedDemoUsers,
    resetLocalData,
    logOut,
    requestBrowserNotificationsPermission,
    markAllNotificationsRead,
    unreadNotificationsCount,
    unreadThreadsCount,
    notificationPermission
  } = useAppStore();

  const [section, setSection] = useState<Section>('account');
  const [profileFeedback, setProfileFeedback] = useState<FeedbackState | null>(null);
  const [settingsFeedback, setSettingsFeedback] = useState<FeedbackState | null>(null);
  const [localUsersFeedback, setLocalUsersFeedback] = useState<string | null>(null);

  const [orientation, setOrientation] = useState<UserOrientation>(currentUser?.orientation ?? 'straight');
  const [showMe, setShowMe] = useState<UserShowMe>(currentUser?.showMe ?? 'everyone');
  const [preferredGenders, setPreferredGenders] = useState<UserGender[]>(
    defaultPreferredGenders(currentUser?.preferredGenders, currentUser?.showMe)
  );
  const [smokes, setSmokes] = useState(Boolean(currentUser?.smokes));
  const [drinks, setDrinks] = useState(Boolean(currentUser?.drinks));
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [ageRangeMin, setAgeRangeMin] = useState(
    currentUser?.ageRangeMin ?? currentUser?.minPreferredAge ?? 24
  );
  const [ageRangeMax, setAgeRangeMax] = useState(
    currentUser?.ageRangeMax ?? currentUser?.maxPreferredAge ?? 40
  );
  const [maxDistanceKm, setMaxDistanceKm] = useState(currentUser?.maxDistanceKm ?? 40);
  const [intent, setIntent] = useState<MatchIntent>(currentUser?.intent ?? 'relationship');
  const [hobbies, setHobbies] = useState(currentUser?.hobbies ?? '');
  const [passions, setPassions] = useState(currentUser?.passions ?? '');
  const [lookingFor, setLookingFor] = useState(currentUser?.lookingFor ?? '');
  const [instagram, setInstagram] = useState(currentUser?.instagram ?? '');
  const [instagramTag, setInstagramTag] = useState(currentUser?.instagramTag ?? '');
  const [telegram, setTelegram] = useState(currentUser?.telegram ?? '');
  const [spotifyTag, setSpotifyTag] = useState(currentUser?.spotifyTag ?? '');
  const [website, setWebsite] = useState(currentUser?.website ?? '');
  const [favoriteSong, setFavoriteSong] = useState(currentUser?.favoriteSong ?? '');
  const [favoriteMovie, setFavoriteMovie] = useState(currentUser?.favoriteMovie ?? '');

  const [localUserEmail, setLocalUserEmail] = useState('');
  const [localUserPassword, setLocalUserPassword] = useState('');

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setOrientation(currentUser.orientation ?? 'straight');
    setShowMe(currentUser.showMe ?? 'everyone');
    setPreferredGenders(defaultPreferredGenders(currentUser.preferredGenders, currentUser.showMe));
    setSmokes(Boolean(currentUser.smokes));
    setDrinks(Boolean(currentUser.drinks));
    setBio(currentUser.bio ?? '');
    setAgeRangeMin(currentUser.ageRangeMin ?? currentUser.minPreferredAge ?? 24);
    setAgeRangeMax(currentUser.ageRangeMax ?? currentUser.maxPreferredAge ?? 40);
    setMaxDistanceKm(currentUser.maxDistanceKm ?? 40);
    setIntent(currentUser.intent ?? 'relationship');
    setHobbies(currentUser.hobbies ?? '');
    setPassions(currentUser.passions ?? '');
    setLookingFor(currentUser.lookingFor ?? '');
    setInstagram(currentUser.instagram ?? '');
    setInstagramTag(currentUser.instagramTag ?? '');
    setTelegram(currentUser.telegram ?? '');
    setSpotifyTag(currentUser.spotifyTag ?? '');
    setWebsite(currentUser.website ?? '');
    setFavoriteSong(currentUser.favoriteSong ?? '');
    setFavoriteMovie(currentUser.favoriteMovie ?? '');
  }, [currentUser]);

  const options = useMemo(
    () => [
      { value: 'account', label: 'Account' },
      { value: 'preferences', label: 'Preferenze' },
      { value: 'notifications', label: 'Notifiche' },
      { value: 'appearance', label: 'Aspetto' },
      { value: 'security', label: 'Sicurezza' },
      { value: 'events', label: 'Eventi' }
    ],
    []
  );

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  function togglePreferredGender(option: UserGender): void {
    setPreferredGenders((current) =>
      current.includes(option)
        ? current.filter((candidate) => candidate !== option)
        : [...current, option]
    );
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imageData = await readFileAsDataUrl(file);
      const error = await updateProfileImage(imageData);
      setProfileFeedback(
        error
          ? { isError: true, message: error }
          : { isError: false, message: 'Foto profilo aggiornata.' }
      );
    } catch {
      setProfileFeedback({ isError: true, message: 'Impossibile caricare la foto.' });
    } finally {
      event.target.value = '';
    }
  }

  async function savePreferences() {
    setProfileFeedback(null);
    if (!currentUser) {
      return;
    }

    const user = currentUser;

    if (user.gender && willUserLoseEventRegistrations(user.gender, orientation)) {
      const confirmed = window.confirm(
        'Cambiare orientamento rimuovera eventuali iscrizioni evento correnti. Continuare?'
      );
      if (!confirmed) {
        return;
      }
    }

    const error = await updateAccountPreferences({
      orientation,
      showMe,
      preferredGenders,
      smokes,
      drinks,
      bio,
      ageRangeMin,
      ageRangeMax,
      maxDistanceKm,
      intent,
      hobbies,
      passions,
      lookingFor,
      instagram,
      instagramTag,
      telegram,
      spotifyTag,
      website,
      favoriteSong,
      favoriteMovie
    });

    setProfileFeedback(
      error
        ? { isError: true, message: error }
        : { isError: false, message: 'Preferenze account aggiornate.' }
    );
  }

  async function handleEnablePushNotifications() {
    const permission = await requestBrowserNotificationsPermission();
    if (permission === 'unsupported') {
      setSettingsFeedback({ isError: true, message: 'Il browser non supporta le notifiche push.' });
      return;
    }

    setSettingsFeedback({
      isError: permission !== 'granted',
      message:
        permission === 'granted'
          ? 'Notifiche browser abilitate.'
          : 'Permesso notifiche browser non concesso.'
    });
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

      {section === 'account' && (
        <div className="account-stack">
          <Card title="Profilo" subtitle="Snapshot rapido del profilo e accesso alle modifiche principali.">
            <div className="account-profile-head">
              {currentUser.profileImageData ? (
                <img src={currentUser.profileImageData} alt="Profilo" />
              ) : (
                <div className="account-profile-head__fallback">{getDisplayName(currentUser).slice(0, 1)}</div>
              )}

              <div>
                <h3>{getDisplayName(currentUser)}</h3>
                <p>{currentUser.email}</p>
                <p className="text-muted">
                  {currentUser.birthDate ? `${calculateAge(currentUser.birthDate)} anni` : 'Eta non impostata'}
                </p>
              </div>
            </div>

            <div className="account-inline-actions">
              <label className="account-inline-file">
                <input type="file" accept="image/*" onChange={handleAvatarChange} />
                Cambia foto
              </label>
              <Link className="inline-link" to="/profile/setup">
                Apri setup profilo
              </Link>
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
                <dt>Citta</dt>
                <dd>{currentUser.city ?? '-'}</dd>
              </div>
              <div>
                <dt>Genere</dt>
                <dd>{currentUser.gender ? genderLabels[currentUser.gender] : '-'}</dd>
              </div>
              <div>
                <dt>Orientamento</dt>
                <dd>{currentUser.orientation ? orientationLabels[currentUser.orientation] : '-'}</dd>
              </div>
              <div>
                <dt>Intent</dt>
                <dd>{currentUser.intent ? intentLabels[currentUser.intent] : '-'}</dd>
              </div>
            </dl>

            {profileFeedback && (
              <p className={profileFeedback.isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
                {profileFeedback.message}
              </p>
            )}
          </Card>

          <Card title="Setup discovery" subtitle="Riassunto delle leve che impattano Home, match e chat.">
            <div className="account-chip-group">
              {preferredGenders.map((preferredGender) => (
                <span key={preferredGender} className="account-chip is-active is-static">
                  {genderLabels[preferredGender]}
                </span>
              ))}
            </div>
            <p className="text-muted">
              Bio: {bio.trim() || 'Non ancora impostata.'}
            </p>
            <p className="text-muted">
              Interessi: {hobbies.trim() || 'Nessun interesse inserito.'}
            </p>
            <p className="text-muted">
              Social visibili: {instagramTag.trim() || spotifyTag.trim() ? 'configurati' : 'non configurati'}
            </p>
          </Card>

          <Card
            title="Ambiente web"
            subtitle={
              isBackendMode
                ? 'Backend Appwrite attivo. I tool sotto restano utili solo per test locali controllati.'
                : 'Solo client-side: utile per testare rapidamente i flussi senza backend.'
            }
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
                      <small>{user.isProfileComplete ? 'Profilo completo' : 'Profilo incompleto'}</small>
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

      {section === 'preferences' && (
        <div className="account-stack">
          <Card title="Matching" subtitle="Stesse preferenze chiave dell app iOS, direttamente sul web.">
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
                Intent
                <select value={intent} onChange={(event) => setIntent(event.target.value as MatchIntent)}>
                  {(Object.keys(intentLabels) as MatchIntent[]).map((option) => (
                    <option key={option} value={option}>
                      {intentLabels[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Eta minima
                <input
                  type="number"
                  min={18}
                  max={80}
                  value={ageRangeMin}
                  onChange={(event) => setAgeRangeMin(Number(event.target.value))}
                />
              </label>

              <label>
                Eta massima
                <input
                  type="number"
                  min={18}
                  max={80}
                  value={ageRangeMax}
                  onChange={(event) => setAgeRangeMax(Number(event.target.value))}
                />
              </label>

              <label>
                Distanza max (km)
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={maxDistanceKm}
                  onChange={(event) => setMaxDistanceKm(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="account-preferences-block">
              <p className="text-muted">Generi preferiti</p>
              <div className="account-chip-group">
                {(Object.keys(genderLabels) as UserGender[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={preferredGenders.includes(option) ? 'account-chip is-active' : 'account-chip'}
                    onClick={() => togglePreferredGender(option)}
                  >
                    {genderLabels[option]}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Profilo, social e stile di vita">
            <div className="account-form-grid">
              <label>
                Bio
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={2} />
              </label>

              <label>
                Interessi
                <textarea value={hobbies} onChange={(event) => setHobbies(event.target.value)} rows={2} />
              </label>

              <label>
                Cosa ti rappresenta
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
                Instagram
                <input value={instagram} onChange={(event) => setInstagram(event.target.value)} />
              </label>

              <label>
                Instagram tag
                <input value={instagramTag} onChange={(event) => setInstagramTag(event.target.value)} />
              </label>

              <label>
                Telegram
                <input value={telegram} onChange={(event) => setTelegram(event.target.value)} />
              </label>

              <label>
                Spotify tag
                <input value={spotifyTag} onChange={(event) => setSpotifyTag(event.target.value)} />
              </label>

              <label>
                Sito / portfolio
                <input value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>

              <label>
                Brano del momento
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
            {profileFeedback && (
              <p className={profileFeedback.isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
                {profileFeedback.message}
              </p>
            )}
          </Card>
        </div>
      )}

      {section === 'notifications' && (
        <Card title="Notifiche e realtime" subtitle="Controlli granulari allineati al comportamento iOS.">
          <div className="settings-stack">
            <p className="text-muted">
              Stato realtime: <strong>{persisted.realtimeState}</strong>
            </p>
            <p className="text-muted">Thread non letti: {unreadThreadsCount}</p>
            <p className="text-muted">Notifiche non lette: {unreadNotificationsCount}</p>

            <div className="settings-grid">
              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.notificationsEnabled}
                  onChange={(event) => updateSettings({ notificationsEnabled: event.target.checked })}
                />
                <span>Notifiche attive</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.matchNotificationsEnabled}
                  onChange={(event) => updateSettings({ matchNotificationsEnabled: event.target.checked })}
                />
                <span>Notifiche match</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.messageNotificationsEnabled}
                  onChange={(event) => updateSettings({ messageNotificationsEnabled: event.target.checked })}
                />
                <span>Notifiche messaggi</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.eventReminderNotificationsEnabled}
                  onChange={(event) =>
                    updateSettings({ eventReminderNotificationsEnabled: event.target.checked })
                  }
                />
                <span>Promemoria eventi</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.notificationsPollingEnabled}
                  onChange={(event) =>
                    updateSettings({ notificationsPollingEnabled: event.target.checked })
                  }
                />
                <span>Polling notifiche</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.browserPushEnabled}
                  onChange={(event) => updateSettings({ browserPushEnabled: event.target.checked })}
                />
                <span>Push browser</span>
              </label>
            </div>

            <div className="account-inline-actions">
              <Button variant="secondary" onClick={handleEnablePushNotifications}>
                Richiedi permesso push ({notificationPermission})
              </Button>

              <Button variant="ghost" onClick={markAllNotificationsRead}>
                Segna notifiche lette
              </Button>
            </div>

            {settingsFeedback && (
              <p className={settingsFeedback.isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
                {settingsFeedback.message}
              </p>
            )}
          </div>
        </Card>
      )}

      {section === 'appearance' && (
        <div className="account-stack">
          <Card title="Aspetto app" subtitle="Tema generale e visibilita delle informazioni nei profili.">
            <div className="settings-grid">
              <label>
                Tema
                <select
                  value={persisted.settings.themeMode}
                  onChange={(event) =>
                    updateSettings({ themeMode: event.target.value as ThemeMode })
                  }
                >
                  {(Object.keys(themeLabels) as ThemeMode[]).map((option) => (
                    <option key={option} value={option}>
                      {themeLabels[option]}
                    </option>
                  ))}
                </select>
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

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showIntent}
                  onChange={(event) => updateSettings({ showIntent: event.target.checked })}
                />
                <span>Mostra intent</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showInterests}
                  onChange={(event) => updateSettings({ showInterests: event.target.checked })}
                />
                <span>Mostra interessi comuni</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showInstagramTag}
                  onChange={(event) => updateSettings({ showInstagramTag: event.target.checked })}
                />
                <span>Mostra Instagram tag</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showSpotifyTag}
                  onChange={(event) => updateSettings({ showSpotifyTag: event.target.checked })}
                />
                <span>Mostra Spotify tag</span>
              </label>
            </div>
          </Card>

          <Card title="Aspetto chat" subtitle="Background, palette bolle e gradiente del pulsante invio.">
            <div className="settings-grid">
              <label>
                Sfondo chat
                <select
                  value={persisted.settings.chatBackgroundStyle}
                  onChange={(event) =>
                    updateSettings({ chatBackgroundStyle: event.target.value as ChatBackgroundStyle })
                  }
                >
                  {(Object.keys(chatBackgroundStyleLabels) as ChatBackgroundStyle[]).map((option) => (
                    <option key={option} value={option}>
                      {chatBackgroundStyleLabels[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Luminosita sfondo
                <input
                  type="range"
                  min={-0.35}
                  max={0.55}
                  step={0.05}
                  value={persisted.settings.chatBackgroundBrightness}
                  onChange={(event) =>
                    updateSettings({ chatBackgroundBrightness: Number(event.target.value) })
                  }
                />
              </label>

              <label>
                Palette bolle in uscita
                <select
                  value={persisted.settings.outgoingBubblePalette}
                  onChange={(event) =>
                    updateSettings({ outgoingBubblePalette: event.target.value as ChatBubblePalette })
                  }
                >
                  {(Object.keys(bubblePaletteLabels) as ChatBubblePalette[]).map((option) => (
                    <option key={option} value={option}>
                      {bubblePaletteLabels[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Palette bolle in ingresso
                <select
                  value={persisted.settings.incomingBubblePalette}
                  onChange={(event) =>
                    updateSettings({ incomingBubblePalette: event.target.value as ChatBubblePalette })
                  }
                >
                  {(Object.keys(bubblePaletteLabels) as ChatBubblePalette[]).map((option) => (
                    <option key={option} value={option}>
                      {bubblePaletteLabels[option]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-color-grid">
              <label>
                Sfondo 1
                <input
                  type="color"
                  value={persisted.settings.chatBackgroundColor1}
                  onChange={(event) => updateSettings({ chatBackgroundColor1: event.target.value })}
                />
              </label>

              <label>
                Sfondo 2
                <input
                  type="color"
                  value={persisted.settings.chatBackgroundColor2}
                  onChange={(event) => updateSettings({ chatBackgroundColor2: event.target.value })}
                />
              </label>

              <label>
                Sfondo 3
                <input
                  type="color"
                  value={persisted.settings.chatBackgroundColor3}
                  onChange={(event) => updateSettings({ chatBackgroundColor3: event.target.value })}
                />
              </label>

              <label>
                Pulsante 1
                <input
                  type="color"
                  value={persisted.settings.sendButtonColor1}
                  onChange={(event) => updateSettings({ sendButtonColor1: event.target.value })}
                />
              </label>

              <label>
                Pulsante 2
                <input
                  type="color"
                  value={persisted.settings.sendButtonColor2}
                  onChange={(event) => updateSettings({ sendButtonColor2: event.target.value })}
                />
              </label>

              <label>
                Pulsante 3
                <input
                  type="color"
                  value={persisted.settings.sendButtonColor3}
                  onChange={(event) => updateSettings({ sendButtonColor3: event.target.value })}
                />
              </label>
            </div>
          </Card>
        </div>
      )}

      {section === 'security' && (
        <div className="account-stack">
          <Card
            title="Sicurezza"
            subtitle="Per reset password usiamo lo stesso canale supporto presente nell app iOS."
          >
            <p className="text-muted">Email profilo: {currentUser.email}</p>
            <div className="account-inline-actions">
              <Button
                onClick={() => {
                  window.location.href =
                    `mailto:support@example.com?subject=Password reset request&body=Profile email: ${currentUser.email}`;
                }}
              >
                Richiedi reset password
              </Button>

              <Button variant="danger" onClick={logOut}>
                Disconnettiti
              </Button>
            </div>
          </Card>
        </div>
      )}

      {section === 'events' && (
        <div className="account-stack">
          <Card title="Stato Main Event" subtitle="Preview live piu vicina a quella della sezione eventi iOS.">
            <div className="account-live-grid">
              <div className="event-metric-tile">
                <span className="event-metric-tile__title">Capienza</span>
                <strong className="event-metric-tile__value">
                  {mainEventSnapshot.totalCount}/{mainEventSnapshot.maxParticipants}
                </strong>
                <span className="event-metric-tile__caption">
                  {mainEventFlags.isRegistered
                    ? 'Iscrizione confermata'
                    : mainEventFlags.isWaiting
                      ? 'Sei in waiting list'
                      : 'Non iscritto'}
                </span>
              </div>

              <div className="event-metric-tile">
                <span className="event-metric-tile__title">Uomini</span>
                <strong className="event-metric-tile__value">
                  {mainEventSnapshot.maleCount}/{mainEventSnapshot.maleLimit}
                </strong>
                <span className="event-metric-tile__caption">
                  Posti rimasti: {mainEventSnapshot.remainingMaleSlots}
                </span>
              </div>

              <div className="event-metric-tile">
                <span className="event-metric-tile__title">Donne</span>
                <strong className="event-metric-tile__value">
                  {mainEventSnapshot.femaleCount}/{mainEventSnapshot.femaleLimit}
                </strong>
                <span className="event-metric-tile__caption">
                  Posti rimasti: {mainEventSnapshot.remainingFemaleSlots}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Le mie iscrizioni eventi">
            {currentUserUpcomingEventHistory.length === 0 ? (
              <p className="text-muted">Nessuna attivita eventi futuri.</p>
            ) : (
              <ul className="history-list">
                {currentUserUpcomingEventHistory.slice(0, 4).map((item) => (
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
        </div>
      )}
    </section>
  );
}
