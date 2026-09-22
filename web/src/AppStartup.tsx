import { lazy, Suspense } from 'react';
import { GradientBackdrop } from './components/layout/GradientBackdrop';
import { Card } from './components/ui/Card';
import { loadAppwriteConfiguration } from './services/appwriteConfiguration';

// AppContext initializes its service at module scope. Import it only after
// configuration validation so a fresh checkout can show a useful error screen.
const App = lazy(() => import('./App'));

export function AppStartup(): JSX.Element {
  try {
    loadAppwriteConfiguration();
  } catch {
    return (
      <GradientBackdrop>
        <main className="auth-page">
          <Card>
            <h1>Fyre</h1>
            <section lang="it">
              <h2>Servizio non disponibile</h2>
              <p>La configurazione di Fyre è incompleta o non valida.</p>
              {import.meta.env.DEV && (
                <p>
                  Per avviare il progetto, copiare <code>web/.env.example</code> in{' '}
                  <code>web/.env.local</code>, compilare i valori Appwrite e riavviare il server.
                </p>
              )}
            </section>
            <section lang="en">
              <h2>Service unavailable</h2>
              <p>Fyre’s configuration is incomplete or invalid.</p>
              {import.meta.env.DEV && (
                <p>
                  To run the project, copy <code>web/.env.example</code> to{' '}
                  <code>web/.env.local</code>, fill in the Appwrite values and restart the server.
                </p>
              )}
            </section>
          </Card>
        </main>
      </GradientBackdrop>
    );
  }

  return (
    <Suspense fallback={<main className="auth-bootstrap" role="status">Fyre…</main>}>
      <App />
    </Suspense>
  );
}
