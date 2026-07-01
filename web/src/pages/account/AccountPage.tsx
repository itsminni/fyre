import {
  CSSProperties,
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useAppStore } from '../../hooks/useAppStore';
import { TranslationKey, useI18n } from '../../i18n';
import {
  GeocodeResult,
  findCityByLabel,
  mergeCityResults,
  searchCities,
  searchCitiesRemote
} from '../../services/geocode';
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
const MAX_PROFILE_PHOTOS = 6;
const SWIPE_PHOTO_WIDTH = 1080;
const SWIPE_PHOTO_HEIGHT = 1920;
const SWIPE_PHOTO_JPEG_QUALITY = 0.88;

interface SwipePhotoCropState {
  source: string;
  zoom: number;
  offsetX: number;
  remainingFiles: File[];
  skippedFilesCount: number;
}

interface SwipePhotoCropDragState {
  pointerId: number;
  startX: number;
  startOffsetX: number;
}

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

function distanceInputValue(value: number | undefined): string {
  return value == null || value <= 0 ? '' : String(value);
}

function parseDistanceInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossibile leggere l\'immagine'));
    image.src = source;
  });
}

async function cropSwipePhotoDataUrl({ source, zoom, offsetX }: SwipePhotoCropState): Promise<string> {
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = SWIPE_PHOTO_WIDTH;
  canvas.height = SWIPE_PHOTO_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas non disponibile');
  }

  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  const drawWidth = image.width * scale * zoom;
  const drawHeight = image.height * scale * zoom;
  const maxShiftX = Math.max(0, (drawWidth - canvas.width) / 2);
  const drawX = (canvas.width - drawWidth) / 2 + (offsetX / 50) * maxShiftX;
  const drawY = (canvas.height - drawHeight) / 2;

  context.fillStyle = '#160f0b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return canvas.toDataURL('image/jpeg', SWIPE_PHOTO_JPEG_QUALITY);
}

export function AccountPage(): JSX.Element {
  const {
    currentUser,
    currentUserUpcomingEventHistory,
    persisted,
    updateProfileImage,
    updateProfileImages,
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
  const [isSavingSwipePhotos, setIsSavingSwipePhotos] = useState(false);
  const [pendingSwipePhotoCrop, setPendingSwipePhotoCrop] = useState<SwipePhotoCropState | null>(null);
  const [swipePhotoCropDrag, setSwipePhotoCropDrag] = useState<SwipePhotoCropDragState | null>(null);
  const accountAutosaveReadyRef = useRef(false);
  const accountAutosaveTimerRef = useRef<number | null>(null);
  const lastAccountAutosaveKeyRef = useRef('');
  const cityIsDirtyRef = useRef(false);
  const [remoteCitySuggestions, setRemoteCitySuggestions] = useState<GeocodeResult[]>([]);
  const [selectedCitySuggestion, setSelectedCitySuggestion] = useState<GeocodeResult | null>(null);
  const [isCityFieldFocused, setIsCityFieldFocused] = useState(false);

  const [orientation, setOrientation] = useState<UserOrientation>(currentUser?.orientation ?? 'straight');
  const [showMe, setShowMe] = useState<UserShowMe>(currentUser?.showMe ?? 'everyone');
  const [preferredGenders, setPreferredGenders] = useState<UserGender[]>(
    defaultPreferredGenders(currentUser?.preferredGenders, currentUser?.showMe)
  );
  const [city, setCity] = useState(currentUser?.city ?? '');
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
  const [maxDistanceKm, setMaxDistanceKm] = useState(distanceInputValue(currentUser?.maxDistanceKm));
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

  const localCitySuggestions = useMemo(() => searchCities(city), [city]);
  const citySuggestions = useMemo(
    () => mergeCityResults(localCitySuggestions, remoteCitySuggestions),
    [localCitySuggestions, remoteCitySuggestions]
  );
  const isSelectedCityValue = selectedCitySuggestion?.label === city || selectedCitySuggestion?.city === city;
  const showCitySuggestions = isCityFieldFocused && city.trim().length > 0 && citySuggestions.length > 0;

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const isCityBeingEdited = cityIsDirtyRef.current || isCityFieldFocused || city.trim().length > 0;

    setOrientation(currentUser.orientation ?? 'straight');
    setShowMe(currentUser.showMe ?? 'everyone');
    setPreferredGenders(defaultPreferredGenders(currentUser.preferredGenders, currentUser.showMe));
    if (!isCityBeingEdited) {
      setCity(currentUser.city ?? '');
    }
    if (!isCityBeingEdited) {
      setRemoteCitySuggestions([]);
      setSelectedCitySuggestion(null);
      setIsCityFieldFocused(false);
    }
    setSmokes(Boolean(currentUser.smokes));
    setDrinks(Boolean(currentUser.drinks));
    setExcludeSmokers(Boolean(currentUser.excludeSmokers));
    setExcludeDrinkers(Boolean(currentUser.excludeDrinkers));
    setBio(currentUser.bio ?? '');
    setAgeRangeMin(ageInputValue(currentUser.ageRangeMin ?? currentUser.minPreferredAge, 24));
    setAgeRangeMax(ageInputValue(currentUser.ageRangeMax ?? currentUser.maxPreferredAge, 40));
    setMaxDistanceKm(distanceInputValue(currentUser.maxDistanceKm));
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
    accountAutosaveReadyRef.current = false;
    lastAccountAutosaveKeyRef.current = '';
  }, [city, currentUser, isCityFieldFocused]);

  const accountAutosaveKey = useMemo(
    () =>
      JSON.stringify({
        userEmail: currentUser?.email ?? null,
        orientation,
        showMe,
        preferredGenders: [...preferredGenders].sort(),
        city,
        smokes,
        drinks,
        excludeSmokers,
        excludeDrinkers,
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
      }),
    [
      currentUser?.email,
      orientation,
      showMe,
      preferredGenders,
      city,
      smokes,
      drinks,
      excludeSmokers,
      excludeDrinkers,
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
    ]
  );

  const savePreferences = useCallback(async () => {
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
    const parsedMaxDistanceKm = parseDistanceInput(maxDistanceKm);

    const trimmedCity = city.trim();
    const selectedCityValue = isSelectedCityValue ? selectedCitySuggestion : null;
    const shouldPersistCity = trimmedCity.length === 0 || Boolean(selectedCityValue);
    const resolvedCityValue = trimmedCity.length === 0 ? '' : selectedCityValue?.city ?? undefined;
    const resolvedCityLat = selectedCityValue?.lat;
    const resolvedCityLng = selectedCityValue?.lng;

    const error = await updateAccountPreferences({
      city: shouldPersistCity ? resolvedCityValue : undefined,
      cityLat: resolvedCityLat,
      cityLng: resolvedCityLng,
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
      maxDistanceKm: parsedMaxDistanceKm,
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
        : { isError: false, message: t('account.autosave.saved') }
    );

    if (!error && shouldPersistCity) {
      if (trimmedCity.length === 0) {
        setCity('');
      }
      setSelectedCitySuggestion(null);
      cityIsDirtyRef.current = false;
    }
  }, [
    ageRangeMax,
    ageRangeMin,
    bio,
    currentUser,
    drinks,
    excludeDrinkers,
    excludeSmokers,
    favoriteMovie,
    favoriteSong,
    city,
    hobbies,
    instagram,
    instagramTag,
    intent,
    isSelectedCityValue,
    lookingFor,
    maxDistanceKm,
    orientation,
    passions,
    preferredGenders,
    selectedCitySuggestion,
    showMe,
    smokes,
    spotifyTag,
    t,
    telegram,
    updateAccountPreferences,
    website,
    willUserLoseEventRegistrations
  ]);

  useEffect(() => {
    const normalizedCity = city.trim();
    if (normalizedCity.length < 2 || findCityByLabel(normalizedCity)) {
      setRemoteCitySuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      searchCitiesRemote(normalizedCity, controller.signal)
        .then(setRemoteCitySuggestions)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }

          setRemoteCitySuggestions([]);
        });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [city]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    if (!accountAutosaveReadyRef.current) {
      accountAutosaveReadyRef.current = true;
      lastAccountAutosaveKeyRef.current = accountAutosaveKey;
      return;
    }

    if (accountAutosaveKey === lastAccountAutosaveKeyRef.current) {
      return;
    }

    if (accountAutosaveTimerRef.current != null) {
      window.clearTimeout(accountAutosaveTimerRef.current);
    }

    accountAutosaveTimerRef.current = window.setTimeout(() => {
      lastAccountAutosaveKeyRef.current = accountAutosaveKey;
      void savePreferences();
    }, 700);

    return () => {
      if (accountAutosaveTimerRef.current != null) {
        window.clearTimeout(accountAutosaveTimerRef.current);
      }
    };
  }, [accountAutosaveKey, currentUser, savePreferences]);

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
  const swipePhotos = currentUser.profilePhotoDataItems ?? [];
  const remainingSwipePhotoSlots = MAX_PROFILE_PHOTOS - swipePhotos.length;

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

  function updateCityInput(value: string): void {
    cityIsDirtyRef.current = true;
    setCity(value);
    setSelectedCitySuggestion(null);
  }

  function selectCitySuggestion(suggestion: GeocodeResult): void {
    cityIsDirtyRef.current = true;
    setCity(suggestion.label);
    setSelectedCitySuggestion(suggestion);
    setIsCityFieldFocused(false);
  }

  async function handleAvatarRemove(): Promise<void> {
    const error = await updateProfileImage('');
    setProfileFeedback(
      error
        ? { isError: true, message: error }
        : { isError: false, message: 'Foto profilo rimossa.' }
    );
  }

  async function handleSwipePhotosChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (remainingSwipePhotoSlots <= 0) {
      setProfileFeedback({ isError: true, message: t('profileSetup.photos.max') });
      event.target.value = '';
      return;
    }

    const files = selectedFiles.slice(0, remainingSwipePhotoSlots);
    if (files.length === 0) {
      event.target.value = '';
      return;
    }

    try {
      const [firstFile, ...remainingFiles] = files;
      await openSwipePhotoCrop(firstFile, remainingFiles, selectedFiles.length - files.length);
    } catch {
      setProfileFeedback({ isError: true, message: 'Impossibile leggere le foto per lo swipe.' });
    } finally {
      event.target.value = '';
    }
  }

  async function openSwipePhotoCrop(
    file: File,
    remainingFiles: File[],
    skippedFilesCount: number
  ): Promise<void> {
    const source = await readFileAsDataUrl(file);
    setPendingSwipePhotoCrop({
      source,
      zoom: 1,
      offsetX: 0,
      remainingFiles,
      skippedFilesCount
    });
  }

  function onSwipePhotoCropPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!pendingSwipePhotoCrop) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setSwipePhotoCropDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffsetX: pendingSwipePhotoCrop.offsetX
    });
  }

  function onSwipePhotoCropPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!swipePhotoCropDrag || swipePhotoCropDrag.pointerId !== event.pointerId) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - swipePhotoCropDrag.startX) / bounds.width) * 100;

    setPendingSwipePhotoCrop((current) =>
      current
        ? {
            ...current,
            offsetX: clamp(swipePhotoCropDrag.startOffsetX + deltaX, -50, 50)
          }
        : current
    );
  }

  function endSwipePhotoCropDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (swipePhotoCropDrag?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setSwipePhotoCropDrag(null);
    }
  }

  async function applySwipePhotoCrop(): Promise<void> {
    if (!pendingSwipePhotoCrop) {
      return;
    }

    setIsSavingSwipePhotos(true);
    try {
      const croppedPhoto = await cropSwipePhotoDataUrl(pendingSwipePhotoCrop);
      const nextPhotos = [...swipePhotos, croppedPhoto].slice(0, MAX_PROFILE_PHOTOS);
      const error = await updateProfileImages(nextPhotos);
      if (error) {
        setProfileFeedback({ isError: true, message: error });
        return;
      }

      const [nextFile, ...remainingFiles] = pendingSwipePhotoCrop.remainingFiles;
      if (nextFile && nextPhotos.length < MAX_PROFILE_PHOTOS) {
        await openSwipePhotoCrop(nextFile, remainingFiles, pendingSwipePhotoCrop.skippedFilesCount);
        return;
      }

      setPendingSwipePhotoCrop(null);
      setProfileFeedback({
        isError: pendingSwipePhotoCrop.skippedFilesCount > 0,
        message:
          pendingSwipePhotoCrop.skippedFilesCount > 0
            ? t('profileSetup.error.maxPhotos')
            : 'Foto per lo swipe aggiornate.'
      });
    } catch {
      setProfileFeedback({ isError: true, message: t('profileSetup.error.cropPhoto') });
    } finally {
      setIsSavingSwipePhotos(false);
    }
  }

  async function removeSwipePhoto(index: number): Promise<void> {
    setIsSavingSwipePhotos(true);
    try {
      const nextPhotos = swipePhotos.filter((_, photoIndex) => photoIndex !== index);
      const error = await updateProfileImages(nextPhotos);
      setProfileFeedback(
        error
          ? { isError: true, message: error }
          : { isError: false, message: 'Foto per lo swipe aggiornate.' }
      );
    } finally {
      setIsSavingSwipePhotos(false);
    }
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
    window.location.href = `mailto:support@example.test?${params.toString()}`;
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

            <div className="account-avatar-actions">
              <label className="account-inline-file account-inline-file--profile">
                <input type="file" accept="image/*" onChange={handleAvatarChange} />
                {t('account.changePhoto')}
              </label>

              {currentUser.profileImageData && (
                <Button variant="ghost" onClick={() => void handleAvatarRemove()}>
                  Rimuovi foto
                </Button>
              )}
            </div>

            <section className="account-swipe-photos">
              <div>
                <h4>{t('profileSetup.photos.title')}</h4>
                <p>{t('profileSetup.photos.subtitle')}</p>
              </div>

              <label
                className={
                  remainingSwipePhotoSlots > 0 && !isSavingSwipePhotos
                    ? 'account-inline-file account-inline-file--profile'
                    : 'account-inline-file account-inline-file--profile is-disabled'
                }
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleSwipePhotosChange}
                  disabled={remainingSwipePhotoSlots <= 0 || isSavingSwipePhotos}
                />
                {remainingSwipePhotoSlots > 0
                  ? t('profileSetup.photos.add', { count: swipePhotos.length })
                  : t('profileSetup.photos.max')}
              </label>

              {swipePhotos.length === 0 ? (
                <p className="text-muted">{t('profileSetup.photos.empty')}</p>
              ) : (
                <ul className="profile-photo-strip account-swipe-photos__strip">
                  {swipePhotos.map((photo, index) => (
                    <li key={`${photo.slice(0, 32)}-${index}`} className="profile-photo-strip__item">
                      <img src={photo} alt={t('profileSetup.photos.alt', { index: index + 1 })} />
                      {index === 0 && <span>{t('profileSetup.photos.first')}</span>}
                      <button
                        className="profile-photo-strip__remove"
                        type="button"
                        onClick={() => void removeSwipePhoto(index)}
                        aria-label={t('profileSetup.photos.remove')}
                        disabled={isSavingSwipePhotos}
                      >
                        x
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

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
                {t('account.city')}
                <div className="city-autocomplete">
                  <input
                    value={city}
                    onBlur={() => window.setTimeout(() => setIsCityFieldFocused(false), 120)}
                    onChange={(event) => updateCityInput(event.target.value)}
                    onFocus={() => setIsCityFieldFocused(true)}
                    placeholder={t('profileSetup.city.placeholder')}
                    autoComplete="off"
                  />
                  {showCitySuggestions && (
                    <div className="city-autocomplete__list" role="listbox">
                      {citySuggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}
                          type="button"
                          role="option"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectCitySuggestion(suggestion)}
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>

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
                  min={0}
                  value={maxDistanceKm}
                  placeholder={t('profileSetup.maxDistance.placeholder')}
                  onChange={(event) => setMaxDistanceKm(event.target.value)}
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

      {pendingSwipePhotoCrop && (
        <div className="profile-avatar-crop-modal" role="dialog" aria-modal="true" aria-label={t('profileSetup.crop.photo.title')}>
          <div className="profile-avatar-crop-panel">
            <div>
              <h3>{t('profileSetup.crop.photo.title')}</h3>
              <p>{t('profileSetup.crop.photo.body')}</p>
            </div>

            <div
              className={swipePhotoCropDrag ? 'profile-swipe-crop-stage is-dragging' : 'profile-swipe-crop-stage'}
              onPointerDown={onSwipePhotoCropPointerDown}
              onPointerMove={onSwipePhotoCropPointerMove}
              onPointerUp={endSwipePhotoCropDrag}
              onPointerCancel={endSwipePhotoCropDrag}
            >
              <img
                src={pendingSwipePhotoCrop.source}
                alt={t('profileSetup.crop.photo.alt')}
                draggable={false}
                style={{
                  transform: `translateX(${pendingSwipePhotoCrop.offsetX}%) scale(${pendingSwipePhotoCrop.zoom})`
                }}
              />
            </div>

            <div className="profile-avatar-crop-controls">
              <label>
                {t('profileSetup.crop.zoom')}
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={pendingSwipePhotoCrop.zoom}
                  onChange={(event) =>
                    setPendingSwipePhotoCrop((current) =>
                      current ? { ...current, zoom: Number(event.target.value) } : current
                    )
                  }
                />
              </label>
            </div>

            <div className="profile-avatar-crop-actions">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setPendingSwipePhotoCrop(null);
                  setSwipePhotoCropDrag(null);
                }}
              >
                {t('profileSetup.crop.cancel')}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setPendingSwipePhotoCrop({ ...pendingSwipePhotoCrop, zoom: 1, offsetX: 0 })}
              >
                {t('profileSetup.crop.reset')}
              </Button>
              <Button type="button" onClick={() => void applySwipePhotoCrop()} disabled={isSavingSwipePhotos}>
                {t('profileSetup.crop.photo.use')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
