import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import {
  GENDER_OPTIONS,
  ORIENTATION_OPTIONS,
  SHOW_ME_OPTIONS,
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
  const {
    currentUser,
    updateProfile,
    updateProfileImage,
    willUserLoseEventRegistrations
  } = useAppStore();

  const [firstName, setFirstName] = useState(currentUser?.firstName ?? '');
  const [lastName, setLastName] = useState(currentUser?.lastName ?? '');
  const [birthDate, setBirthDate] = useState(
    currentUser?.birthDate ?? new Date(new Date().setFullYear(new Date().getFullYear() - 25)).toISOString().slice(0, 10)
  );
  const [gender, setGender] = useState<UserGender>(currentUser?.gender ?? 'male');
  const [orientation, setOrientation] = useState<UserOrientation>(currentUser?.orientation ?? 'straight');
  const [showMe, setShowMe] = useState<UserShowMe>(currentUser?.showMe ?? 'everyone');
  const [smokes, setSmokes] = useState(Boolean(currentUser?.smokes));
  const [drinks, setDrinks] = useState(Boolean(currentUser?.drinks));
  const [hobbies, setHobbies] = useState(currentUser?.hobbies ?? '');
  const [passions, setPassions] = useState(currentUser?.passions ?? '');
  const [lookingFor, setLookingFor] = useState(currentUser?.lookingFor ?? '');
  const [favoriteSong, setFavoriteSong] = useState(currentUser?.favoriteSong ?? '');
  const [favoriteMovie, setFavoriteMovie] = useState(currentUser?.favoriteMovie ?? '');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const age = useMemo(() => calculateAge(birthDate), [birthDate]);

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (isProfileComplete(currentUser)) {
    return <Navigate to="/app/home" replace />;
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

    const error = updateProfile({
      firstName,
      lastName,
      birthDate,
      gender,
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

    if (error) {
      setFeedbackMessage(error);
      return;
    }

    navigate('/app/home', { replace: true });
  }

  return (
    <main className="profile-setup-page">
      <div className="profile-setup-page__inner fade-in-up">
        <Card title="Completa il profilo" subtitle="I campi con * sono necessari per entrare nell app.">
          <form className="profile-setup-form" onSubmit={onSubmit}>
            <section className="profile-setup-form__grid">
              <label>
                Nome *
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </label>

              <label>
                Cognome *
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </label>

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
                Foto profilo
                <input type="file" accept="image/*" onChange={onAvatarChange} />
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

            <section className="profile-setup-form__stack">
              <label>
                Hobby *
                <textarea value={hobbies} onChange={(event) => setHobbies(event.target.value)} rows={2} />
              </label>

              <label>
                Passioni *
                <textarea value={passions} onChange={(event) => setPassions(event.target.value)} rows={2} />
              </label>

              <label>
                Cosa stai cercando? *
                <textarea
                  value={lookingFor}
                  onChange={(event) => setLookingFor(event.target.value)}
                  rows={2}
                />
              </label>

              <label>
                Canzone preferita *
                <input value={favoriteSong} onChange={(event) => setFavoriteSong(event.target.value)} />
              </label>

              <label>
                Film preferito *
                <input value={favoriteMovie} onChange={(event) => setFavoriteMovie(event.target.value)} />
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
