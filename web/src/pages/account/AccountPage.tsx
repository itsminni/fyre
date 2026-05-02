import { CSSProperties, ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useAppStore } from '../../hooks/useAppStore';
import { TranslationKey, useI18n } from '../../i18n';
import {
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

const orientationLabelKeys: Record<UserOrientation, TranslationKey> = {
  straight: 'orientation.straight',
  gay: 'orientation.gay',
  lesbian: 'orientation.lesbian',
  bisexual: 'orientation.bisexual',
  pansexual: 'orientation.pansexual',
  other: 'orientation.other'
};

const showMeLabelKeys: Record<UserShowMe, TranslationKey> = {
  men: 'showMe.men',
  women: 'showMe.women',
  everyone: 'showMe.everyone'
};

const genderLabelKeys: Record<UserGender, TranslationKey> = {
  male: 'gender.male',
  female: 'gender.female',
  nonBinary: 'gender.nonBinary',
  other: 'gender.other'
};

const intentLabelKeys: Record<MatchIntent, TranslationKey> = {
  relationship: 'intent.relationship',
  friendship: 'intent.friendship',
  casual: 'intent.casual',
  notSure: 'intent.notSure'
};

const historyStatusLabelKeys: Record<EventHistoryStatus, TranslationKey> = {
  confirmed: 'eventStatus.confirmed',
  waitlisted: 'eventStatus.waitlisted',
  cancelled: 'eventStatus.cancelled',
  promoted: 'eventStatus.promoted'
};

const themeLabelKeys: Record<ThemeMode, TranslationKey> = {
  system: 'account.theme.system',
  light: 'account.theme.light',
  dark: 'account.theme.dark'
};

const iosSendButtonColors = {
  sendButtonColor1: '#FF9A00',
  sendButtonColor2: '#FF8A1F',
  sendButtonColor3: '#E14D33'
};

// Chat background and bubble palettes intentionally removed for web appearance.

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

function ageInputValue(value: number | undefined, fallback: number): string {
  return String(value ?? fallback);
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
  const {
    currentUser,
    currentUserUpcomingEventHistory,
    persisted,
    updateProfileImage,
    updateAccountPreferences,
    updateSettings,
    willUserLoseEventRegistrations,
    logOut,
    requestBrowserNotificationsPermission,
    markAllNotificationsRead,
    unreadNotificationsCount,
    unreadThreadsCount,
    notificationPermission
  } = useAppStore();
  const { language, t } = useI18n();

  const [section, setSection] = useState<Section>('account');
  const [profileFeedback, setProfileFeedback] = useState<FeedbackState | null>(null);
  const [settingsFeedback, setSettingsFeedback] = useState<FeedbackState | null>(null);
  const [securityFeedback, setSecurityFeedback] = useState<FeedbackState | null>(null);

  const [orientation, setOrientation] = useState<UserOrientation>(currentUser?.orientation ?? 'straight');
  const [showMe, setShowMe] = useState<UserShowMe>(currentUser?.showMe ?? 'everyone');
  const [preferredGenders, setPreferredGenders] = useState<UserGender[]>(
    defaultPreferredGenders(currentUser?.preferredGenders, currentUser?.showMe)
  );
  const [smokes, setSmokes] = useState(Boolean(currentUser?.smokes));
  const [drinks, setDrinks] = useState(Boolean(currentUser?.drinks));
  const [excludeSmokers, setExcludeSmokers] = useState(Boolean(currentUser?.excludeSmokers));
  const [excludeDrinkers, setExcludeDrinkers] = useState(Boolean(currentUser?.excludeDrinkers));
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [ageRangeMin, setAgeRangeMin] = useState(
    ageInputValue(currentUser?.ageRangeMin ?? currentUser?.minPreferredAge, 24)
  );
  const [ageRangeMax, setAgeRangeMax] = useState(
    ageInputValue(currentUser?.ageRangeMax ?? currentUser?.maxPreferredAge, 40)
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

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setOrientation(currentUser.orientation ?? 'straight');
    setShowMe(currentUser.showMe ?? 'everyone');
    setPreferredGenders(defaultPreferredGenders(currentUser.preferredGenders, currentUser.showMe));
    setSmokes(Boolean(currentUser.smokes));
    setDrinks(Boolean(currentUser.drinks));
    setExcludeSmokers(Boolean(currentUser.excludeSmokers));
    setExcludeDrinkers(Boolean(currentUser.excludeDrinkers));
    setBio(currentUser.bio ?? '');
    setAgeRangeMin(ageInputValue(currentUser.ageRangeMin ?? currentUser.minPreferredAge, 24));
    setAgeRangeMax(ageInputValue(currentUser.ageRangeMax ?? currentUser.maxPreferredAge, 40));
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
      { value: 'account', label: t('account.tab.account') },
      { value: 'preferences', label: t('account.tab.preferences') },
      { value: 'notifications', label: t('account.tab.notifications') },
      { value: 'appearance', label: t('account.tab.appearance') },
      { value: 'security', label: t('account.tab.security') },
      { value: 'events', label: t('account.tab.events') }
    ],
    [t]
  );

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  const currentEmail = currentUser.email;

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
        'Cambiare orientamento rimuoverà eventuali iscrizioni evento correnti. Continuare?'
      );
      if (!confirmed) {
        return;
      }
    }

    const parsedAgeRangeMin = ageRangeMin.trim().length > 0 ? Number(ageRangeMin) : 18;
    const parsedAgeRangeMax = ageRangeMax.trim().length > 0 ? Number(ageRangeMax) : 99;

    const error = await updateAccountPreferences({
      orientation,
      showMe,
      preferredGenders,
      smokes,
      drinks,
      excludeSmokers,
      excludeDrinkers,
      bio,
      ageRangeMin: parsedAgeRangeMin,
      ageRangeMax: parsedAgeRangeMax,
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

  function openSupportMail(subject: string, body: string): void {
    const params = new URLSearchParams({ subject, body });
    window.location.href = `mailto:support@example.com?${params.toString()}`;
    setSecurityFeedback({ isError: false, message: 'App Mail aperta.' });
  }

  function openPasswordResetMail(): void {
    openSupportMail('Password reset request', `Profile email: ${currentEmail}`);
  }

  function openEmailChangeMail(): void {
    openSupportMail('Email change request', `Current profile email: ${currentEmail}\nNew email: `);
  }

  return (
    <section className="account-page fade-in-up">
      <header className="section-header">
        <h2>{t('account.title')}</h2>
      </header>

      <SegmentedControl value={section} onChange={(value) => setSection(value as Section)} options={options} />

      {section === 'account' && (
        <div className="account-stack">
          <Card title={t('account.info.title')} subtitle={t('account.info.subtitle')}>
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
                  {currentUser.birthDate
                    ? t('account.ageYears', { age: calculateAge(currentUser.birthDate) })
                    : t('account.ageMissing')}
                </p>
              </div>
            </div>

            <label className="account-inline-file account-inline-file--profile">
              <input type="file" accept="image/*" onChange={handleAvatarChange} />
              {t('account.changePhoto')}
            </label>

            <dl className="account-details">
              <div>
                <dt>{t('account.firstName')}</dt>
                <dd>{currentUser.firstName ?? '-'}</dd>
              </div>
              <div>
                <dt>{t('account.lastName')}</dt>
                <dd>{currentUser.lastName ?? '-'}</dd>
              </div>
              <div>
                <dt>{t('account.city')}</dt>
                <dd>{currentUser.city ?? '-'}</dd>
              </div>
              <div>
                <dt>{t('account.email')}</dt>
                <dd>{currentUser.email}</dd>
              </div>
              <div>
                <dt>{t('account.birthDate')}</dt>
                <dd>{currentUser.birthDate ?? '-'}</dd>
              </div>
              <div>
                <dt>{t('account.gender')}</dt>
                <dd>{currentUser.gender ? t(genderLabelKeys[currentUser.gender]) : '-'}</dd>
              </div>
            </dl>

            <div className="account-form-grid account-form-grid--ios">
              <label>
                {t('account.orientation')}
                <select
                  value={orientation}
                  onChange={(event) => setOrientation(event.target.value as UserOrientation)}
                >
                  {(Object.keys(orientationLabelKeys) as UserOrientation[]).map((option) => (
                    <option key={option} value={option}>
                      {t(orientationLabelKeys[option])}
                    </option>
                  ))}
                </select>
              </label>

              <label className="inline-checkbox account-toggle-row">
                <input
                  type="checkbox"
                  checked={smokes}
                  onChange={(event) => setSmokes(event.target.checked)}
                />
                <span>{t('account.smokes')}</span>
              </label>

              <label className="inline-checkbox account-toggle-row">
                <input
                  type="checkbox"
                  checked={drinks}
                  onChange={(event) => setDrinks(event.target.checked)}
                />
                <span>{t('account.drinks')}</span>
              </label>

              <label>
                {t('account.interests')}
                <textarea value={hobbies} onChange={(event) => setHobbies(event.target.value)} rows={2} />
              </label>

              <label>
                {t('account.instagramTag')}
                <input value={instagramTag} onChange={(event) => setInstagramTag(event.target.value)} />
              </label>

              <label>
                {t('account.spotifyTag')}
                <input value={spotifyTag} onChange={(event) => setSpotifyTag(event.target.value)} />
              </label>
            </div>

            <Button onClick={savePreferences}>{t('account.saveProfile')}</Button>
            {profileFeedback && (
              <p className={profileFeedback.isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
                {profileFeedback.message}
              </p>
            )}
          </Card>

          <Card title={t('account.discovery.title')} subtitle={t('account.discovery.subtitle')}>
            <div className="account-form-grid">
              <label>
                {t('account.bio')}
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={2} />
              </label>

              <label>
                {t('account.showMe')}
                <select value={showMe} onChange={(event) => setShowMe(event.target.value as UserShowMe)}>
                  {(Object.keys(showMeLabelKeys) as UserShowMe[]).map((option) => (
                    <option key={option} value={option}>
                      {t(showMeLabelKeys[option])}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {t('account.intent')}
                <select value={intent} onChange={(event) => setIntent(event.target.value as MatchIntent)}>
                  {(Object.keys(intentLabelKeys) as MatchIntent[]).map((option) => (
                    <option key={option} value={option}>
                      {t(intentLabelKeys[option])}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {t('account.minAge')}
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={ageRangeMin}
                  onBlur={() => {
                    if (ageRangeMin.trim().length === 0) {
                      setAgeRangeMin('18');
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && ageRangeMin.trim().length === 0) {
                      event.preventDefault();
                      setAgeRangeMin('18');
                    }
                  }}
                  onChange={(event) => setAgeRangeMin(event.target.value)}
                />
              </label>

              <label>
                {t('account.maxAge')}
                <input
                  type="number"
                  min={18}
                  max={99}
                  value={ageRangeMax}
                  onBlur={() => {
                    if (ageRangeMax.trim().length === 0) {
                      setAgeRangeMax('99');
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && ageRangeMax.trim().length === 0) {
                      event.preventDefault();
                      setAgeRangeMax('99');
                    }
                  }}
                  onChange={(event) => setAgeRangeMax(event.target.value)}
                />
              </label>

              <label>
                {t('account.maxDistance')}
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={maxDistanceKm}
                  onChange={(event) => setMaxDistanceKm(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="account-preferences-block">
              <p className="text-muted">{t('account.preferredGenders')}</p>
              <div className="account-chip-group">
                {(Object.keys(genderLabelKeys) as UserGender[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={preferredGenders.includes(option) ? 'account-chip is-active' : 'account-chip'}
                    onClick={() => togglePreferredGender(option)}
                  >
                    {t(genderLabelKeys[option])}
                  </button>
                ))}
              </div>
            </div>

            <div className="account-form-grid">
              <label className="inline-checkbox account-toggle-row">
                <input
                  type="checkbox"
                  checked={excludeSmokers}
                  onChange={(event) => setExcludeSmokers(event.target.checked)}
                />
                <span>{t('account.excludeSmokers')}</span>
              </label>

              <label className="inline-checkbox account-toggle-row">
                <input
                  type="checkbox"
                  checked={excludeDrinkers}
                  onChange={(event) => setExcludeDrinkers(event.target.checked)}
                />
                <span>{t('account.excludeDrinkers')}</span>
              </label>
            </div>

            <Button onClick={savePreferences}>{t('account.savePreferences')}</Button>
            {profileFeedback && (
              <p className={profileFeedback.isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
                {profileFeedback.message}
              </p>
            )}
          </Card>

          <div className="account-page__footer-actions">
            <Button variant="danger" fullWidth onClick={logOut}>
              {t('account.security.logout')}
            </Button>
          </div>
        </div>
      )}

      {section === 'preferences' && (
        <div className="account-stack">
          <Card title={t('account.profileVisibility.title')} subtitle={t('account.profileVisibility.subtitle')}>
            <div className="settings-grid">
              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showAge}
                  onChange={(event) => updateSettings({ showAge: event.target.checked })}
                />
                <span>{t('account.showAge')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showDistance}
                  onChange={(event) => updateSettings({ showDistance: event.target.checked })}
                />
                <span>{t('account.showDistance')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showIntent}
                  onChange={(event) => updateSettings({ showIntent: event.target.checked })}
                />
                <span>{t('account.showIntent')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showInterests}
                  onChange={(event) => updateSettings({ showInterests: event.target.checked })}
                />
                <span>{t('account.showInterests')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showInstagramTag}
                  onChange={(event) => updateSettings({ showInstagramTag: event.target.checked })}
                />
                <span>{t('account.showInstagram')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.showSpotifyTag}
                  onChange={(event) => updateSettings({ showSpotifyTag: event.target.checked })}
                />
                <span>{t('account.showSpotify')}</span>
              </label>
            </div>
          </Card>
        </div>
      )}

      {section === 'notifications' && (
        <Card title={t('account.notifications.title')} subtitle={t('account.notifications.subtitle')}>
          <div className="settings-stack">
            <p className="text-muted">
              {t('account.connectionStatus')}: <strong>{persisted.realtimeState}</strong>
            </p>
            <p className="text-muted">{t('account.unreadThreads')}: {unreadThreadsCount}</p>
            <p className="text-muted">{t('account.unreadNotifications')}: {unreadNotificationsCount}</p>

            <div className="settings-grid">
              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.notificationsEnabled}
                  onChange={(event) => updateSettings({ notificationsEnabled: event.target.checked })}
                />
                <span>{t('account.notifications.enabled')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.matchNotificationsEnabled}
                  onChange={(event) => updateSettings({ matchNotificationsEnabled: event.target.checked })}
                />
                <span>{t('account.notifications.match')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.messageNotificationsEnabled}
                  onChange={(event) => updateSettings({ messageNotificationsEnabled: event.target.checked })}
                />
                <span>{t('account.notifications.messages')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.eventReminderNotificationsEnabled}
                  onChange={(event) =>
                    updateSettings({ eventReminderNotificationsEnabled: event.target.checked })
                  }
                />
                <span>{t('account.notifications.events')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.notificationsPollingEnabled}
                  onChange={(event) =>
                    updateSettings({ notificationsPollingEnabled: event.target.checked })
                  }
                />
                <span>{t('account.notifications.polling')}</span>
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={persisted.settings.browserPushEnabled}
                  onChange={(event) => updateSettings({ browserPushEnabled: event.target.checked })}
                />
                <span>{t('account.notifications.browserPush')}</span>
              </label>
            </div>

            <div className="account-inline-actions">
              <Button variant="secondary" onClick={handleEnablePushNotifications}>
                {t('account.notifications.requestPermission', { permission: notificationPermission })}
              </Button>

              <Button variant="ghost" onClick={markAllNotificationsRead}>
                {t('account.notifications.markRead')}
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
          <Card title={t('account.appearance.title')} subtitle={t('account.appearance.subtitle')}>
            <div className="settings-grid">
              <label>
                {t('account.theme')}
                <select
                  value={persisted.settings.themeMode}
                  onChange={(event) =>
                    updateSettings({ themeMode: event.target.value as ThemeMode })
                  }
                >
                  {(Object.keys(themeLabelKeys) as ThemeMode[]).map((option) => (
                    <option key={option} value={option}>
                      {t(themeLabelKeys[option])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <Card title={t('account.chatAppearance.title')}>
            <div className="send-button-preview-row">
              <button
                type="button"
                className="ios-send-button-preview"
                style={{
                  '--chat-send-1': persisted.settings.sendButtonColor1,
                  '--chat-send-2': persisted.settings.sendButtonColor2,
                  '--chat-send-3': persisted.settings.sendButtonColor3
                } as CSSProperties}
              >
                {t('account.send')}
              </button>
              <Button variant="secondary" onClick={() => updateSettings(iosSendButtonColors)}>
                {t('account.restoreDefault')}
              </Button>
            </div>

            <div className="settings-color-grid">
              <label>
                {t('account.color1')}
                <input
                  type="color"
                  value={persisted.settings.sendButtonColor1}
                  onChange={(event) => updateSettings({ sendButtonColor1: event.target.value })}
                />
              </label>

              <label>
                {t('account.color2')}
                <input
                  type="color"
                  value={persisted.settings.sendButtonColor2}
                  onChange={(event) => updateSettings({ sendButtonColor2: event.target.value })}
                />
              </label>

              <label>
                {t('account.color3')}
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
          <Card title={t('account.security.title')} subtitle={t('account.security.subtitle')}>
            <dl className="account-details">
              <div>
                <dt>{t('account.email')}</dt>
                <dd>{currentUser.email}</dd>
              </div>
            </dl>
            <div className="account-inline-actions">
              <Button onClick={openPasswordResetMail}>
                {t('account.security.passwordReset')}
              </Button>

              <Button variant="secondary" onClick={openEmailChangeMail}>
                {t('account.security.emailChange')}
              </Button>

              <Button variant="danger" onClick={logOut}>
                {t('account.security.logout')}
              </Button>
            </div>

            {securityFeedback && (
              <p className={securityFeedback.isError ? 'form-feedback form-feedback--error' : 'form-feedback'}>
                {securityFeedback.message}
              </p>
            )}
          </Card>
        </div>
      )}

      {section === 'events' && (
        <div className="account-stack">
          <Card title={t('account.events.title')}>
            {currentUserUpcomingEventHistory.length === 0 ? (
              <p className="text-muted">{t('account.events.empty')}</p>
            ) : (
              <ul className="history-list">
                {currentUserUpcomingEventHistory.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <p>{item.eventTitle}</p>
                    <small>
                      {new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'it-IT', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      }).format(new Date(item.eventDate))}
                      {' - '}
                      {t(historyStatusLabelKeys[item.status])}
                    </small>
                  </li>
                ))}
              </ul>
            )}

            <Link className="inline-link" to="/app/account/events">
              {t('account.events.openHistory')}
            </Link>
          </Card>
        </div>
      )}
    </section>
  );
}
