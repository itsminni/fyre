import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { GradientBackdrop } from '../../components/layout/GradientBackdrop';
import { LanguageSwitch } from '../../components/layout/LanguageSwitch';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { useI18n } from '../../i18n';
import { isProfileComplete, isValidEmail } from '../../types/models';

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser, logIn } = useAppStore();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFormValid = useMemo(
    () => isValidEmail(email) && password.trim().length >= 8,
    [email, password]
  );

  if (currentUser && isProfileComplete(currentUser)) {
    return <Navigate to="/app/home" replace />;
  }

  if (currentUser && !isProfileComplete(currentUser)) {
    return <Navigate to="/profile/setup" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const error = await logIn(email, password);
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error);
      return;
    }

    navigate('/profile/setup', { replace: true });
  }

  return (
    <GradientBackdrop>
      <main className="auth-page fade-in-up">
        <div className="public-language-row">
          <LanguageSwitch />
        </div>

        <Card title={t('auth.login')} subtitle={t('auth.login.subtitle')}>
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              {t('auth.email')}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@email.com"
                autoComplete="username"
              />
            </label>

            <label>
              {t('auth.password')}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('auth.password.placeholder')}
                autoComplete="current-password"
              />
            </label>

            {errorMessage && <p className="form-feedback form-feedback--error">{errorMessage}</p>}

            <Button type="submit" fullWidth disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? t('auth.login.loading') : t('auth.login.submit')}
            </Button>
          </form>

          <p className="auth-form__switch">
            {t('auth.noAccount')} <Link to="/auth/signup">{t('auth.signup')}</Link>
          </p>
        </Card>
      </main>
    </GradientBackdrop>
  );
}
