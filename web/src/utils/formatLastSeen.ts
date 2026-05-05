export function formatLastSeen(dateIso: string | undefined): string {
  if (!dateIso) {
    return 'Ultimo accesso non disponibile';
  }

  const timestamp = new Date(dateIso).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Ultimo accesso non disponibile';
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes <= 1) {
    return 'Attivo poco fa';
  }
  if (diffMinutes < 60) {
    return `Attivo ${diffMinutes} min fa`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Attivo ${diffHours} h fa`;
  }

  return `Attivo il ${new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))}`;
}
