import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { GradientBackdrop } from '../../components/layout/GradientBackdrop';
import { LanguageSwitch } from '../../components/layout/LanguageSwitch';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { useI18n } from '../../i18n';
import { isProfileComplete, isValidEmail } from '../../types/models';

export function SignUpPage(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser, signUp } = useAppStore();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFormValid = useMemo(
    () => isValidEmail(email) && password.length >= 8 && agree,
    [agree, email, password]
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

    const error = await signUp(email, password);
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

        <Card title={t('auth.signup')} subtitle={t('auth.signup.subtitle')}>
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              {t('auth.email')}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@email.com"
                autoComplete="email"
              />
            </label>

            <label>
              {t('auth.password')}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('auth.password.placeholder')}
                autoComplete="new-password"
              />
            </label>

            <div className="auth-form__terms">
              <input
                id="signup-terms"
                type="checkbox"
                checked={agree}
                onChange={(event) => setAgree(event.target.checked)}
              />
              <span>
                <label htmlFor="signup-terms">{t('auth.termsPrefix')} </label>
                <Link to="/auth/terms-privacy">{t('auth.termsLink')}</Link>
              </span>
            </div>

            {errorMessage && <p className="form-feedback form-feedback--error">{errorMessage}</p>}

            <Button type="submit" fullWidth disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? t('auth.signup.loading') : t('auth.signup.submit')}
            </Button>
          </form>

          <p className="auth-form__switch">
            {t('auth.hasAccount')} <Link to="/auth/login">{t('auth.login')}</Link>
          </p>
        </Card>
      </main>
    </GradientBackdrop>
  );
}
