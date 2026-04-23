import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { findCityByLabel, searchCities } from '../../services/geocode';
import {
  GENDER_OPTIONS,
  ORIENTATION_OPTIONS,
  SHOW_ME_OPTIONS,
  MatchIntent,
  UserGender,
  UserOrientation,
  UserShowMe,
  calculateAge,
  isProfileComplete
} from '../../types/models';

const genderLabels: Record<UserGender, string> = {
  male: 'Uomo',
  female: 'Donna',
  nonBinary: 'Non binario',
  other: 'Altro'
};

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

const intentLabels: Record<MatchIntent, string> = {
  relationship: 'Relazione',
  friendship: 'Amicizia',
  casual: 'Casual',
  networking: 'Networking',
  notSure: 'Non so ancora'
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

export function ProfileSetupPage(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser, updateProfile, updateProfileImage, willUserLoseEventRegistrations } =
    useAppStore();

  const [firstName, setFirstName] = useState(currentUser?.firstName ?? '');
  const [lastName, setLastName] = useState(currentUser?.lastName ?? '');
  const [city, setCity] = useState(currentUser?.city ?? '');
  const [birthDate, setBirthDate] = useState(
    currentUser?.birthDate ??
      new Date(new Date().setFullYear(new Date().getFullYear() - 25)).toISOString().slice(0, 10)
  );
  const [gender, setGender] = useState<UserGender>(currentUser?.gender ?? 'male');
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
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const age = useMemo(() => calculateAge(birthDate), [birthDate]);
  const citySuggestions = useMemo(() => searchCities(city), [city]);

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (isProfileComplete(currentUser)) {
    return <Navigate to="/app/home" replace />;
  }

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
      const error = updateProfileImage(imageData);
      if (error) {
        setFeedbackMessage(error);
      }
    } catch {
      setFeedbackMessage('Impossibile caricare la foto.');
    } finally {
      event.target.value = '';
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackMessage(null);

    if (willUserLoseEventRegistrations(gender, orientation)) {
      const confirmed = window.confirm(
        'Cambio genere/orientamento: eventuali iscrizioni evento verranno rimosse. Vuoi continuare?'
      );
      if (!confirmed) {
        return;
      }
    }

    const resolvedCity = findCityByLabel(city) ?? searchCities(city)[0] ?? null;

    const error = updateProfile({
      firstName,
      lastName,
      city: resolvedCity?.city ?? city,
      cityLat: resolvedCity?.lat,
      cityLng: resolvedCity?.lng,
      birthDate,
      gender,
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
          title="Completa il profilo"
          subtitle="Portiamo il setup web allo stesso livello del flusso iOS: discovery, social e preferenze di match."
        >
          <form className="profile-setup-form" onSubmit={onSubmit}>
            <section className="profile-setup-form__grid">
              <div className="profile-setup-avatar-card">
                {currentUser.profileImageData ? (
                  <img
                    className="profile-setup-avatar-card__image"
                    src={currentUser.profileImageData}
                    alt="Profilo"
                  />
                ) : (
                  <div className="profile-setup-avatar-card__fallback">
                    {(firstName || currentUser.email).slice(0, 1).toUpperCase()}
                  </div>
                )}

                <label className="profile-setup-avatar-card__action">
                  <input type="file" accept="image/*" onChange={onAvatarChange} />
                  Carica foto profilo
                </label>
              </div>

              <div className="profile-setup-form__stack">
                <label>
                  Nome *
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                </label>

                <label>
                  Cognome *
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </label>

                <label>
                  Citta *
                  <input
                    list="profile-city-suggestions"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="Es. Reggio Emilia"
                  />
                  <datalist id="profile-city-suggestions">
                    {citySuggestions.map((suggestion) => (
                      <option key={suggestion.label} value={suggestion.label} />
                    ))}
                  </datalist>
                </label>

                <div className="profile-setup-form__grid">
                  <label>
                    Data di nascita *
                    <input
                      type="date"
                      value={birthDate}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(event) => setBirthDate(event.target.value)}
                    />
                  </label>

                  <label>
                    Eta
                    <input value={`${age} anni`} disabled />
                  </label>
                </div>
              </div>
            </section>

            <section className="profile-setup-form__grid">
              <label>
                Genere *
                <select value={gender} onChange={(event) => setGender(event.target.value as UserGender)}>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {genderLabels[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Orientamento *
                <select
                  value={orientation}
                  onChange={(event) => setOrientation(event.target.value as UserOrientation)}
                >
                  {ORIENTATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {orientationLabels[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Mostrami
                <select value={showMe} onChange={(event) => setShowMe(event.target.value as UserShowMe)}>
                  {SHOW_ME_OPTIONS.map((option) => (
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
            </section>

            <section className="profile-setup-form__stack">
              <div className="profile-setup-form__section-head">
                <h4>Discovery</h4>
                <p>Le stesse preferenze di matching e compatibilita che hai su iOS.</p>
              </div>

              <div className="profile-setup-choice-grid">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      preferredGenders.includes(option)
                        ? 'account-chip is-active'
                        : 'account-chip'
                    }
                    onClick={() => togglePreferredGender(option)}
                  >
                    {genderLabels[option]}
                  </button>
                ))}
              </div>

              {preferredGenders.length === 0 && (
                <p className="form-feedback form-feedback--error">
                  Seleziona almeno un genere preferito per continuare.
                </p>
              )}

              <div className="profile-setup-form__grid">
                <label>
                  Eta minima preferita
                  <input
                    type="number"
                    min={18}
                    max={80}
                    value={ageRangeMin}
                    onChange={(event) => setAgeRangeMin(Number(event.target.value))}
                  />
                </label>

                <label>
                  Eta massima preferita
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

                <label>
                  Bio *
                  <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={2} />
                </label>
              </div>
            </section>

            <section className="profile-setup-form__stack">
              <div className="profile-setup-form__section-head">
                <h4>Profilo</h4>
                <p>Campi descrittivi usati dal web per il ranking e dai fallback locali.</p>
              </div>

              <label>
                Interessi *
                <textarea value={hobbies} onChange={(event) => setHobbies(event.target.value)} rows={2} />
              </label>

              <label>
                Cosa ti rappresenta *
                <textarea value={passions} onChange={(event) => setPassions(event.target.value)} rows={2} />
              </label>

              <label>
                Cosa stai cercando *
                <textarea
                  value={lookingFor}
                  onChange={(event) => setLookingFor(event.target.value)}
                  rows={2}
                />
              </label>
            </section>

            <section className="profile-setup-form__grid">
              <label>
                Instagram
                <input value={instagram} onChange={(event) => setInstagram(event.target.value)} />
              </label>

              <label>
                Instagram tag
                <input
                  value={instagramTag}
                  onChange={(event) => setInstagramTag(event.target.value)}
                  placeholder="@tuo_handle"
                />
              </label>

              <label>
                Telegram
                <input value={telegram} onChange={(event) => setTelegram(event.target.value)} />
              </label>

              <label>
                Spotify tag
                <input
                  value={spotifyTag}
                  onChange={(event) => setSpotifyTag(event.target.value)}
                  placeholder="@tuo_tag"
                />
              </label>

              <label>
                Sito / portfolio
                <input value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>

              <label>
                Brano del momento *
                <input value={favoriteSong} onChange={(event) => setFavoriteSong(event.target.value)} />
              </label>

              <label>
                Film preferito *
                <input value={favoriteMovie} onChange={(event) => setFavoriteMovie(event.target.value)} />
              </label>
            </section>

            <section className="profile-setup-form__switches">
              <label>
                <input
                  type="checkbox"
                  checked={smokes}
                  onChange={(event) => setSmokes(event.target.checked)}
                />
                <span>Fumi?</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={drinks}
                  onChange={(event) => setDrinks(event.target.checked)}
                />
                <span>Bevi alcolici?</span>
              </label>
            </section>

            {feedbackMessage && <p className="form-feedback form-feedback--error">{feedbackMessage}</p>}

            <Button fullWidth>Completa profilo</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
