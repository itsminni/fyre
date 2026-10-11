export function formatLastSeen(dateIso: string | undefined, language = 'it'): string {
  if (!dateIso) {
    return language === 'it' ? 'Ultimo accesso non disponibile' : 'Last seen unavailable';
  }

  const timestamp = new Date(dateIso).getTime();
  if (Number.isNaN(timestamp)) {
    return language === 'it' ? 'Ultimo accesso non disponibile' : 'Last seen unavailable';
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes <= 1) {
    return language === 'it' ? 'Attivo poco fa' : 'Active just now';
  }
  if (diffMinutes < 60) {
    return language === 'it' ? `Attivo ${diffMinutes} min fa` : `Active ${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return language === 'it' ? `Attivo ${diffHours} h fa` : `Active ${diffHours} h ago`;
  }

  return `${language === 'it' ? 'Attivo il' : 'Last seen'} ${new Intl.DateTimeFormat(language === 'it' ? 'it-IT' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))}`;
}
