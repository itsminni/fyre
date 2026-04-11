import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { GradientBackdrop } from '../../components/layout/GradientBackdrop';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { isProfileComplete, isValidEmail } from '../../types/models';

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser, localUsers, logIn, seedDemoUsers, isBackendMode } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFormValid = useMemo(
    () => isValidEmail(email) && password.trim().length >= 6,
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

  function seedDemoAccounts() {
    const added = seedDemoUsers();
    setHelperMessage(
      added > 0
        ? `Creati ${added} utenti demo. Password predefinita: DEMO_PASSWORD_REDACTED.`
        : 'Gli utenti demo sono gia presenti nella memoria locale.'
    );
  }

  return (
    <GradientBackdrop>
      <main className="auth-page fade-in-up">
        <Card title="Accedi" subtitle="Continua dal punto in cui eri rimasto.">
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@email.com"
                autoComplete="username"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Almeno 6 caratteri"
                autoComplete="current-password"
              />
            </label>

            {errorMessage && <p className="form-feedback form-feedback--error">{errorMessage}</p>}

            <Button fullWidth disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? 'Accesso in corso...' : 'Accedi'}
            </Button>
          </form>

          <p className="auth-form__switch">
            Non hai un account? <Link to="/auth/signup">Registrati</Link>
          </p>

          <div className="auth-helper-box">
            <p className="text-muted">
              {isBackendMode
                ? 'Backend Appwrite attivo: sessione gestita dal server.'
                : `Utenti locali disponibili: ${localUsers.length}`}
            </p>

            {!isBackendMode && localUsers.length > 0 ? (
              <div className="auth-helper-users">
                {localUsers.map((user) => (
                  <button
                    key={user.email}
                    type="button"
                    className="auth-helper-users__item"
                    onClick={() => {
                      setEmail(user.email);
                      if (user.email.endsWith('@fyre.local')) {
                        setPassword('DEMO_PASSWORD_REDACTED');
                      }
                    }}
                  >
                    {user.displayName}
                    <small>{user.email}</small>
                  </button>
                ))}
              </div>
            ) : !isBackendMode ? (
              <Button variant="secondary" onClick={seedDemoAccounts}>
                Carica utenti demo
              </Button>
            ) : null}

            {isBackendMode ? (
              <p className="text-muted">Usa email/password registrate su Appwrite.</p>
            ) : null}

            {helperMessage && !isBackendMode && <p className="form-feedback">{helperMessage}</p>}
          </div>

        </Card>
      </main>
    </GradientBackdrop>
  );
}
