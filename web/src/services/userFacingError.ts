import { AppwriteServiceError } from './appwriteError';

export function mapAppwriteError(error: unknown, fallback: string, language = 'it', authentication = false): string {
  const italian = language === 'it';
  const text = (it: string, en: string) => italian ? it : en;
  if (error instanceof AppwriteServiceError) {
    const type = error.type?.toLowerCase() ?? '';
    const message = error.message.toLowerCase();
    const status = error.statusCode;
    if (status === 401) return text('Credenziali non valide o sessione scaduta.', 'Invalid credentials or expired session.');
    if (status === 409) return authentication
      ? text('Esiste già un account con questa email.', 'An account with this email already exists.')
      : text('I dati sono cambiati. Aggiornare e riprovare.', 'The data has changed. Refresh and try again.');
    if (type === 'upload_size') return text('Il file è vuoto o supera la dimensione consentita.', 'The file is empty or exceeds the size limit.');
    if (type === 'upload_format') return text('Formato del file non supportato.', 'Unsupported file format.');
    if (authentication && (type.includes('password') || message.includes('password'))) return text('La password deve contenere almeno 8 caratteri.', 'The password must contain at least 8 characters.');
    if (authentication && (type.includes('email') || message.includes('email'))) return text('Inserisci un indirizzo email valido.', 'Enter a valid email address.');
    if (status === 429) return text('Troppe richieste in poco tempo. Riprova tra qualche minuto.', 'Too many requests. Try again in a few minutes.');
    if (status === 400) return text('Controlla i dati inseriti e riprova.', 'Check your input and try again.');
    if (status !== null && status >= 500) return text('Il server non è disponibile adesso. Riprova tra poco.', 'The server is unavailable. Try again shortly.');
  }
  if (error instanceof TypeError) return text('Impossibile raggiungere il server. Controlla la connessione e riprova.', 'Unable to reach the server. Check your connection and try again.');
  return italian ? fallback : 'Unable to complete the request. Try again.';
}
