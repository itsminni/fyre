import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LanguageSwitch } from '../../components/layout/LanguageSwitch';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { TranslationKey, useI18n } from '../../i18n';
import { findCityByLabel, searchCities } from '../../services/geocode';
import {
  GENDER_OPTIONS,
  ORIENTATION_OPTIONS,
  MatchIntent,
  UserGender,
  UserOrientation,
  isProfileComplete
} from '../../types/models';

const MAX_PROFILE_PHOTOS = 6;
const AVATAR_CROP_SIZE = 512;
const SWIPE_PHOTO_WIDTH = 1080;
const SWIPE_PHOTO_HEIGHT = 1920;
const SWIPE_PHOTO_JPEG_QUALITY = 0.88;

interface AvatarCropState {
  source: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

interface SwipePhotoCropState {
  source: string;
  zoom: number;
  offsetX: number;
  remainingFiles: File[];
  skippedFilesCount: number;
}

interface AvatarCropDragState {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
}

interface SwipePhotoCropDragState {
  pointerId: number;
  startX: number;
  startOffsetX: number;
}

interface ProfilePhotoDragState {
  pointerId: number;
  sourceIndex: number;
  targetIndex: number;
}

const genderLabelKeys: Record<UserGender, TranslationKey> = {
  male: 'gender.male',
  female: 'gender.female',
  nonBinary: 'gender.nonBinary',
  other: 'gender.other'
};

const orientationLabelKeys: Record<UserOrientation, TranslationKey> = {
  straight: 'orientation.straight',
  gay: 'orientation.gay',
  lesbian: 'orientation.lesbian',
  bisexual: 'orientation.bisexual',
  pansexual: 'orientation.pansexual',
  other: 'orientation.other'
};

const intentLabelKeys: Record<MatchIntent, TranslationKey> = {
  relationship: 'intent.relationship',
  casual: 'intent.casual',
  friendship: 'intent.friendship',
  notSure: 'intent.notSure'
};

function defaultPreferredGenders(preferredGenders: UserGender[] | undefined): UserGender[] {
  return preferredGenders && preferredGenders.length > 0 ? preferredGenders : [...GENDER_OPTIONS];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossibile leggere l\'immagine'));
    image.src = source;
  });
}

async function cropAvatarDataUrl({ source, zoom, offsetX, offsetY }: AvatarCropState): Promise<string> {
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_CROP_SIZE;
  canvas.height = AVATAR_CROP_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas non disponibile');
  }

  const scale = Math.max(AVATAR_CROP_SIZE / image.width, AVATAR_CROP_SIZE / image.height) * zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const maxShiftX = Math.max(0, (drawWidth - AVATAR_CROP_SIZE) / 2);
  const maxShiftY = Math.max(0, (drawHeight - AVATAR_CROP_SIZE) / 2);
  const drawX = (AVATAR_CROP_SIZE - drawWidth) / 2 + (offsetX / 50) * maxShiftX;
  const drawY = (AVATAR_CROP_SIZE - drawHeight) / 2 + (offsetY / 50) * maxShiftY;

  context.fillStyle = '#160f0b';
  context.fillRect(0, 0, AVATAR_CROP_SIZE, AVATAR_CROP_SIZE);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return canvas.toDataURL('image/jpeg', 0.9);
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

export function ProfileSetupPage(): JSX.Element {
  const navigate = useNavigate();
  const {
    currentUser,
    updateProfile,
    updateProfileImage,
    updateProfileImages,
    willUserLoseEventRegistrations
  } = useAppStore();
  const { t } = useI18n();

  const [firstName, setFirstName] = useState(currentUser?.firstName ?? '');
  const [lastName, setLastName] = useState(currentUser?.lastName ?? '');
  const [city, setCity] = useState(currentUser?.city ?? '');
  const [birthDate, setBirthDate] = useState(
    currentUser?.birthDate ??
      new Date(new Date().setFullYear(new Date().getFullYear() - 25)).toISOString().slice(0, 10)
  );
  const [gender, setGender] = useState<UserGender>(currentUser?.gender ?? 'male');
  const [orientation, setOrientation] = useState<UserOrientation>(currentUser?.orientation ?? 'straight');
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [intent, setIntent] = useState<MatchIntent>(currentUser?.intent ?? 'relationship');
  const [interests, setInterests] = useState(currentUser?.hobbies ?? '');
  const [preferredGenders, setPreferredGenders] = useState<UserGender[]>(
    defaultPreferredGenders(currentUser?.preferredGenders)
  );
  const [ageRangeMin, setAgeRangeMin] = useState(
    ageInputValue(currentUser?.ageRangeMin ?? currentUser?.minPreferredAge, 20)
  );
  const [ageRangeMax, setAgeRangeMax] = useState(
    ageInputValue(currentUser?.ageRangeMax ?? currentUser?.maxPreferredAge, 32)
  );
  const [maxDistanceKm, setMaxDistanceKm] = useState(
    currentUser?.maxDistanceKm == null ? '' : String(currentUser.maxDistanceKm)
  );
  const [excludeSmokers, setExcludeSmokers] = useState(Boolean(currentUser?.excludeSmokers));
  const [excludeDrinkers, setExcludeDrinkers] = useState(Boolean(currentUser?.excludeDrinkers));
  const [instagramTag, setInstagramTag] = useState(currentUser?.instagramTag ?? '');
  const [spotifyTag, setSpotifyTag] = useState(currentUser?.spotifyTag ?? '');
  const [smokes, setSmokes] = useState(Boolean(currentUser?.smokes));
  const [drinks, setDrinks] = useState(Boolean(currentUser?.drinks));
  const [avatarImage, setAvatarImage] = useState(currentUser?.profileImageData ?? '');
  const [profilePhotos, setProfilePhotos] = useState<string[]>(currentUser?.profilePhotoDataItems ?? []);
  const [pendingAvatarCrop, setPendingAvatarCrop] = useState<AvatarCropState | null>(null);
  const [avatarCropDrag, setAvatarCropDrag] = useState<AvatarCropDragState | null>(null);
  const [pendingSwipePhotoCrop, setPendingSwipePhotoCrop] = useState<SwipePhotoCropState | null>(null);
  const [swipePhotoCropDrag, setSwipePhotoCropDrag] = useState<SwipePhotoCropDragState | null>(null);
  const [profilePhotoDrag, setProfilePhotoDrag] = useState<ProfilePhotoDragState | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const citySuggestions = useMemo(() => searchCities(city), [city]);
  const remainingProfilePhotoSlots = MAX_PROFILE_PHOTOS - profilePhotos.length;

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  const profileAlreadyComplete = isProfileComplete(currentUser);

  function togglePreferredGender(option: UserGender): void {
    setPreferredGenders((current) =>
      current.includes(option)
        ? current.filter((candidate) => candidate !== option)
        : [...current, option]
    );
  }

  async function onAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imageData = await readFileAsDataUrl(file);
      setPendingAvatarCrop({ source: imageData, zoom: 1, offsetX: 0, offsetY: 0 });
    } catch {
      setFeedbackMessage(t('profileSetup.error.uploadPhoto'));
    } finally {
      event.target.value = '';
    }
  }

  async function applyAvatarCrop(): Promise<void> {
    if (!pendingAvatarCrop) {
      return;
    }

    try {
      const croppedImage = await cropAvatarDataUrl(pendingAvatarCrop);
      setAvatarImage(croppedImage);
      setPendingAvatarCrop(null);
      const error = await updateProfileImage(croppedImage);
      if (error) {
        setFeedbackMessage(error);
      }
    } catch {
      setFeedbackMessage(t('profileSetup.error.cropPhoto'));
    }
  }

  async function removeAvatar(): Promise<void> {
    setAvatarImage('');
    setPendingAvatarCrop(null);
    const error = await updateProfileImage('');
    if (error) {
      setFeedbackMessage(error);
    }
  }

  function onAvatarCropPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!pendingAvatarCrop) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setAvatarCropDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: pendingAvatarCrop.offsetX,
      startOffsetY: pendingAvatarCrop.offsetY
    });
  }

  function onAvatarCropPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!avatarCropDrag || avatarCropDrag.pointerId !== event.pointerId) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = ((event.clientX - avatarCropDrag.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - avatarCropDrag.startY) / bounds.height) * 100;

    setPendingAvatarCrop((current) =>
      current
        ? {
            ...current,
            offsetX: clamp(avatarCropDrag.startOffsetX + deltaX, -50, 50),
            offsetY: clamp(avatarCropDrag.startOffsetY + deltaY, -50, 50)
          }
        : current
    );
  }

  function endAvatarCropDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (avatarCropDrag?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setAvatarCropDrag(null);
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

    try {
      const croppedPhoto = await cropSwipePhotoDataUrl(pendingSwipePhotoCrop);
      const nextPhotos = [...profilePhotos, croppedPhoto].slice(0, MAX_PROFILE_PHOTOS);
      setProfilePhotos(nextPhotos);
      const error = await updateProfileImages(nextPhotos);
      if (error) {
        setFeedbackMessage(error);
      }

      const [nextFile, ...remainingFiles] = pendingSwipePhotoCrop.remainingFiles;
      if (nextFile && nextPhotos.length < MAX_PROFILE_PHOTOS) {
        await openSwipePhotoCrop(nextFile, remainingFiles, pendingSwipePhotoCrop.skippedFilesCount);
        return;
      }

      if (pendingSwipePhotoCrop.skippedFilesCount > 0) {
        setFeedbackMessage(t('profileSetup.error.maxPhotos'));
      }
      setPendingSwipePhotoCrop(null);
    } catch {
      setFeedbackMessage(t('profileSetup.error.cropPhoto'));
    }
  }

  async function onProfilePhotosChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (remainingProfilePhotoSlots <= 0) {
      setFeedbackMessage(t('profileSetup.error.maxPhotos'));
      event.target.value = '';
      return;
    }

    const files = selectedFiles.slice(0, remainingProfilePhotoSlots);
    if (files.length === 0) {
      return;
    }

    try {
      const [firstFile, ...remainingFiles] = files;
      await openSwipePhotoCrop(firstFile, remainingFiles, selectedFiles.length - files.length);
    } catch {
      setFeedbackMessage(t('profileSetup.error.readPhotos'));
    } finally {
      event.target.value = '';
    }
  }

  async function removeProfilePhoto(index: number): Promise<void> {
    const nextPhotos = profilePhotos.filter((_, photoIndex) => photoIndex !== index);
    setProfilePhotos(nextPhotos);
    const error = await updateProfileImages(nextPhotos);
    if (error) {
      setFeedbackMessage(error);
    }
  }

  function profilePhotoIndexFromPoint(clientX: number, clientY: number): number | null {
    const element = document.elementFromPoint(clientX, clientY);
    const photoElement = element?.closest('[data-profile-photo-index]');
    if (!(photoElement instanceof HTMLElement)) {
      return null;
    }

    const index = Number(photoElement.dataset.profilePhotoIndex);
    return Number.isInteger(index) ? index : null;
  }

  function onProfilePhotoPointerDown(event: ReactPointerEvent<HTMLLIElement>, index: number): void {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setProfilePhotoDrag({
      pointerId: event.pointerId,
      sourceIndex: index,
      targetIndex: index
    });
  }

  function onProfilePhotoPointerMove(event: ReactPointerEvent<HTMLLIElement>): void {
    if (!profilePhotoDrag || profilePhotoDrag.pointerId !== event.pointerId) {
      return;
    }

    const targetIndex = profilePhotoIndexFromPoint(event.clientX, event.clientY);
    if (targetIndex == null || targetIndex < 0 || targetIndex >= profilePhotos.length) {
      return;
    }

    setProfilePhotoDrag((current) => current ? { ...current, targetIndex } : current);
  }

  async function commitProfilePhotoDrag(event: ReactPointerEvent<HTMLLIElement>): Promise<void> {
    if (!profilePhotoDrag || profilePhotoDrag.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const { sourceIndex, targetIndex } = profilePhotoDrag;
    setProfilePhotoDrag(null);

    if (sourceIndex === targetIndex) {
      return;
    }

    const nextPhotos = [...profilePhotos];
    const [photo] = nextPhotos.splice(sourceIndex, 1);
    nextPhotos.splice(targetIndex, 0, photo);
    setProfilePhotos(nextPhotos);
    const error = await updateProfileImages(nextPhotos);
    if (error) {
      setFeedbackMessage(error);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackMessage(null);

    if (willUserLoseEventRegistrations(gender, orientation)) {
      const confirmed = window.confirm(t('profileSetup.confirm.eventLoss'));
      if (!confirmed) {
        return;
      }
    }

    const resolvedCity = findCityByLabel(city) ?? searchCities(city)[0] ?? null;
    const parsedAgeRangeMin = ageRangeMin.trim().length > 0 ? Number(ageRangeMin) : 18;
    const parsedAgeRangeMax = ageRangeMax.trim().length > 0 ? Number(ageRangeMax) : 99;
    const parsedMaxDistance = maxDistanceKm.trim().length > 0 ? Number(maxDistanceKm) : undefined;

    setIsSaving(true);
    const error = await updateProfile({
      firstName,
      lastName,
      city: resolvedCity?.city ?? city,
      cityLat: resolvedCity?.lat,
      cityLng: resolvedCity?.lng,
      birthDate,
      gender,
      orientation,
      showMe: 'everyone',
      preferredGenders,
      smokes,
      drinks,
      excludeSmokers,
      excludeDrinkers,
      bio,
      ageRangeMin: parsedAgeRangeMin,
      ageRangeMax: parsedAgeRangeMax,
      maxDistanceKm: parsedMaxDistance,
      intent,
      hobbies: interests,
      passions: '',
      lookingFor: '',
      instagram: '',
      instagramTag,
      telegram: '',
      spotifyTag,
      website: '',
      favoriteSong: '',
      favoriteMovie: ''
    });
    setIsSaving(false);

    if (error) {
      setFeedbackMessage(error);
      return;
    }

    navigate('/app/home', { replace: true });
  }

  return (
    <main className="profile-setup-page">
      <div className="profile-setup-page__inner fade-in-up">
        <Card
          title={profileAlreadyComplete ? t('profileSetup.title.edit') : t('profileSetup.title.complete')}
          subtitle={t('profileSetup.subtitle')}
          headerAction={<LanguageSwitch />}
        >
          <form className="profile-setup-form" onSubmit={onSubmit}>
            <section className="profile-setup-form__stack">
              <div className="profile-setup-form__section-head">
                <h4>{t('profileSetup.avatar.title')}</h4>
              </div>

              <div className="profile-setup-avatar-row">
                {avatarImage ? (
                  <img className="profile-setup-avatar" src={avatarImage} alt={t('profileSetup.avatar.alt')} />
                ) : (
                  <div className="profile-setup-avatar profile-setup-avatar--fallback">
                    {(firstName || currentUser.email).slice(0, 1).toUpperCase()}
                  </div>
                )}

                <label className="profile-setup-avatar-card__action">
                  <input type="file" accept="image/*" onChange={onAvatarChange} />
                  {avatarImage ? t('profileSetup.avatar.change') : t('profileSetup.avatar.choose')}
                </label>

                {avatarImage && (
                  <button className="profile-setup-media-button" type="button" onClick={() => void removeAvatar()}>
                    {t('profileSetup.avatar.remove')}
                  </button>
                )}
              </div>
            </section>

            <section className="profile-setup-form__stack">
              <div className="profile-setup-form__section-head">
                <h4>{t('profileSetup.photos.title')}</h4>
                <p>{t('profileSetup.photos.subtitle')}</p>
              </div>

              <label
                className={
                  remainingProfilePhotoSlots > 0
                    ? 'profile-setup-avatar-card__action'
                    : 'profile-setup-avatar-card__action is-disabled'
                }
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onProfilePhotosChange}
                  disabled={remainingProfilePhotoSlots <= 0}
                />
                {remainingProfilePhotoSlots > 0
                  ? t('profileSetup.photos.add', { count: profilePhotos.length })
                  : t('profileSetup.photos.max')}
              </label>

              {profilePhotos.length === 0 ? (
                <p className="text-muted">{t('profileSetup.photos.empty')}</p>
              ) : (
                <ul className="profile-photo-strip">
                  {profilePhotos.map((photo, index) => (
                    <li
                      key={`${photo.slice(0, 32)}-${index}`}
                      className={[
                        'profile-photo-strip__item',
                        profilePhotoDrag?.sourceIndex === index ? 'is-dragging' : '',
                        profilePhotoDrag?.targetIndex === index && profilePhotoDrag.sourceIndex !== index
                          ? 'is-drop-target'
                          : ''
                      ].filter(Boolean).join(' ')}
                      data-profile-photo-index={index}
                      onPointerDown={(event) => onProfilePhotoPointerDown(event, index)}
                      onPointerMove={onProfilePhotoPointerMove}
                      onPointerUp={(event) => void commitProfilePhotoDrag(event)}
                      onPointerCancel={(event) => void commitProfilePhotoDrag(event)}
                    >
                      <img src={photo} alt={t('profileSetup.photos.alt', { index: index + 1 })} />
                      {index === 0 && <span>{t('profileSetup.photos.first')}</span>}
                      <button
                        className="profile-photo-strip__remove"
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => void removeProfilePhoto(index)}
                        aria-label={t('profileSetup.photos.remove')}
                      >
                        x
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="profile-setup-form__stack">
              <div className="profile-setup-form__section-head">
                <h4>{t('profileSetup.required.title')}</h4>
              </div>

              <div className="profile-setup-form__grid">
                <label>
                  {t('account.firstName')} *
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                </label>

                <label>
                  {t('account.lastName')}
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </label>

                <label>
                  {t('account.city')} *
                  <input
                    list="profile-city-suggestions"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder={t('profileSetup.city.placeholder')}
                  />
                  <datalist id="profile-city-suggestions">
                    {citySuggestions.map((suggestion) => (
                      <option key={suggestion.label} value={suggestion.label} />
                    ))}
                  </datalist>
                </label>

                <label>
                  {t('account.birthDate')} *
                  <input
                    type="date"
                    value={birthDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setBirthDate(event.target.value)}
                  />
                </label>

                <label>
                  {t('account.gender')} *
                  <select value={gender} onChange={(event) => setGender(event.target.value as UserGender)}>
                    {GENDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(genderLabelKeys[option])}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {t('account.orientation')} *
                  <select
                    value={orientation}
                    onChange={(event) => setOrientation(event.target.value as UserOrientation)}
                  >
                    {ORIENTATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {t(orientationLabelKeys[option])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                {t('account.bio')} *
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={3} />
              </label>
            </section>

            <section className="profile-setup-form__stack">
              <div className="profile-setup-form__section-head">
                <h4>{t('profileSetup.discovery.title')}</h4>
                <p>{t('profileSetup.discovery.subtitle')}</p>
              </div>

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

              <div className="profile-setup-form__section-head">
                <h4>{t('profileSetup.showMe.title')}</h4>
              </div>

              <div className="profile-setup-choice-grid">
                {GENDER_OPTIONS.map((option) => (
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

              {preferredGenders.length === 0 && (
                <p className="form-feedback form-feedback--error">
                  {t('profileSetup.genderPreference.required')}
                </p>
              )}

              <div className="profile-setup-form__grid">
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

                <label>
                  {t('account.interests')}
                  <textarea value={interests} onChange={(event) => setInterests(event.target.value)} rows={2} />
                </label>
              </div>

              <section className="profile-setup-form__switches">
                <label>
                  <input
                    type="checkbox"
                    checked={excludeSmokers}
                    onChange={(event) => setExcludeSmokers(event.target.checked)}
                  />
                  <span>{t('profileSetup.excludeSmokers')}</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={excludeDrinkers}
                    onChange={(event) => setExcludeDrinkers(event.target.checked)}
                  />
                  <span>{t('profileSetup.excludeDrinkers')}</span>
                </label>
              </section>
            </section>

            <section className="profile-setup-form__stack">
              <div className="profile-setup-form__section-head">
                <h4>{t('profileSetup.social.title')}</h4>
              </div>

              <div className="profile-setup-form__grid">
                <label>
                  {t('account.instagramTag')}
                  <input
                    value={instagramTag}
                    onChange={(event) => setInstagramTag(event.target.value)}
                    placeholder={t('profileSetup.instagram.placeholder')}
                  />
                </label>

                <label>
                  {t('account.spotifyTag')}
                  <input
                    value={spotifyTag}
                    onChange={(event) => setSpotifyTag(event.target.value)}
                    placeholder={t('profileSetup.spotify.placeholder')}
                  />
                </label>
              </div>
            </section>

            <section className="profile-setup-form__stack">
              <div className="profile-setup-form__section-head">
                <h4>{t('profileSetup.preferences.title')}</h4>
                <p>{t('profileSetup.preferences.subtitle')}</p>
              </div>

              <section className="profile-setup-form__switches">
                <label>
                  <input
                    type="checkbox"
                    checked={smokes}
                    onChange={(event) => setSmokes(event.target.checked)}
                  />
                  <span>{t('account.smokes')}</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={drinks}
                    onChange={(event) => setDrinks(event.target.checked)}
                  />
                  <span>{t('account.drinks')}</span>
                </label>
              </section>
            </section>

            {feedbackMessage && <p className="form-feedback form-feedback--error">{feedbackMessage}</p>}

            <Button type="submit" fullWidth disabled={isSaving}>
              {isSaving
                ? t('profileSetup.save.loading')
                : profileAlreadyComplete
                  ? t('profileSetup.save.edit')
                  : t('profileSetup.save.complete')}
            </Button>
          </form>
        </Card>
      </div>

      {pendingAvatarCrop && (
        <div className="profile-avatar-crop-modal" role="dialog" aria-modal="true" aria-label={t('profileSetup.crop.avatar.title')}>
          <div className="profile-avatar-crop-panel">
            <div>
              <h3>{t('profileSetup.crop.avatar.title')}</h3>
              <p>{t('profileSetup.crop.avatar.body')}</p>
            </div>

            <div
              className={avatarCropDrag ? 'profile-avatar-crop-stage is-dragging' : 'profile-avatar-crop-stage'}
              onPointerDown={onAvatarCropPointerDown}
              onPointerMove={onAvatarCropPointerMove}
              onPointerUp={endAvatarCropDrag}
              onPointerCancel={endAvatarCropDrag}
            >
              <img
                src={pendingAvatarCrop.source}
                alt={t('profileSetup.crop.avatar.alt')}
                draggable={false}
                style={{
                  transform: `translate(${pendingAvatarCrop.offsetX}%, ${pendingAvatarCrop.offsetY}%) scale(${pendingAvatarCrop.zoom})`
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
                  value={pendingAvatarCrop.zoom}
                  onChange={(event) =>
                    setPendingAvatarCrop((current) =>
                      current ? { ...current, zoom: Number(event.target.value) } : current
                    )
                  }
                />
              </label>

            </div>

            <div className="profile-avatar-crop-actions">
              <Button variant="ghost" type="button" onClick={() => setPendingAvatarCrop(null)}>
                {t('profileSetup.crop.cancel')}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setPendingAvatarCrop({ ...pendingAvatarCrop, zoom: 1, offsetX: 0, offsetY: 0 })}
              >
                {t('profileSetup.crop.reset')}
              </Button>
              <Button type="button" onClick={() => void applyAvatarCrop()}>
                {t('profileSetup.crop.avatar.use')}
              </Button>
            </div>
          </div>
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
              <Button variant="ghost" type="button" onClick={() => setPendingSwipePhotoCrop(null)}>
                {t('profileSetup.crop.cancel')}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setPendingSwipePhotoCrop({ ...pendingSwipePhotoCrop, zoom: 1, offsetX: 0 })}
              >
                {t('profileSetup.crop.reset')}
              </Button>
              <Button type="button" onClick={() => void applySwipePhotoCrop()}>
                {t('profileSetup.crop.photo.use')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
