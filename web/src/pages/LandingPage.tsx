import { Link, Navigate } from 'react-router-dom';
import { GradientBackdrop } from '../components/layout/GradientBackdrop';
import { useAppStore } from '../hooks/useAppStore';
import { isProfileComplete } from '../types/models';

export function LandingPage(): JSX.Element {
  const { currentUser } = useAppStore();

  if (currentUser && isProfileComplete(currentUser)) {
    return <Navigate to="/app/home" replace />;
  }

  if (currentUser && !isProfileComplete(currentUser)) {
    return <Navigate to="/profile/setup" replace />;
  }

  return (
    <GradientBackdrop>
      <main className="landing-page fade-in-up">
        <header className="landing-page__header">
          <p className="landing-page__brand">Fyre</p>
          <h1>Dalla scintilla al fyre</h1>
          <p>
            Replica web frontend ispirata all app iOS: estetica bold, flussi completi e dati
            simulati lato client.
          </p>
        </header>

        <section className="landing-page__actions">
          <Link className="landing-page__button landing-page__button--primary" to="/auth/login">
            Accedi
          </Link>
          <Link className="landing-page__button landing-page__button--secondary" to="/auth/signup">
            Registrati
          </Link>
        </section>
      </main>
    </GradientBackdrop>
  );
}
