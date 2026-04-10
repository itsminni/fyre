import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { GradientBackdrop } from '../../components/layout/GradientBackdrop';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAppStore } from '../../hooks/useAppStore';
import { isProfileComplete, isValidEmail } from '../../types/models';

export function SignUpPage(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser, signUp } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFormValid = useMemo(
    () => isValidEmail(email) && password.trim().length >= 6 && agree,
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
        <Card title="Crea account" subtitle="Inizia il tuo profilo Fyre in pochi passaggi.">
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@email.com"
                autoComplete="email"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Almeno 6 caratteri"
                autoComplete="new-password"
              />
            </label>

            <label className="auth-form__checkbox">
              <input
                type="checkbox"
                checked={agree}
                onChange={(event) => setAgree(event.target.checked)}
              />
              <span>Accetto Termini e Informativa Privacy.</span>
            </label>

            {errorMessage && <p className="form-feedback form-feedback--error">{errorMessage}</p>}

            <Button fullWidth disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? 'Registrazione in corso...' : 'Registrati'}
            </Button>
          </form>

          <p className="auth-form__switch">
            Hai gia un account? <Link to="/auth/login">Accedi</Link>
          </p>
        </Card>
      </main>
    </GradientBackdrop>
  );
}
