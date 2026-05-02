import { Link, Navigate } from 'react-router-dom';
import { GradientBackdrop } from '../components/layout/GradientBackdrop';
import { LanguageSwitch } from '../components/layout/LanguageSwitch';
import { useAppStore } from '../hooks/useAppStore';
import { useI18n } from '../i18n';
import { isProfileComplete } from '../types/models';

export function LandingPage(): JSX.Element {
  const { currentUser } = useAppStore();
  const { t } = useI18n();

  if (currentUser && isProfileComplete(currentUser)) {
    return <Navigate to="/app/home" replace />;
  }

  if (currentUser && !isProfileComplete(currentUser)) {
    return <Navigate to="/profile/setup" replace />;
  }

  return (
    <GradientBackdrop>
      <main className="landing-page fade-in-up">
        <div className="public-language-row">
          <LanguageSwitch />
        </div>

        <header className="landing-page__header">
          <div className="landing-page__title-row">
            <h1>Fyre</h1>
            <img src="/images/fyre-app-icon.png" alt="" aria-hidden />
          </div>
          <p>{t('landing.tagline')}</p>
        </header>

        <section className="landing-page__actions">
          <Link className="landing-page__button landing-page__button--primary" to="/auth/login">
            {t('auth.login')}
          </Link>
          <Link className="landing-page__button landing-page__button--secondary" to="/auth/signup">
            {t('auth.signup')}
          </Link>
        </section>
      </main>
    </GradientBackdrop>
  );
}
