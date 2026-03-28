import { useEffect, useMemo, useState } from 'react';

function humanizeDuration(milliseconds: number): string {
  if (milliseconds <= 0) {
    return 'chiuse';
  }

  const totalMinutes = Math.floor(milliseconds / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const chunks: string[] = [];
  if (days > 0) {
    chunks.push(`${days}g`);
  }
  if (hours > 0) {
    chunks.push(`${hours}h`);
  }
  chunks.push(`${minutes}m`);

  return chunks.join(' ');
}

export function useCountdown(targetDateIso: string): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return useMemo(() => {
    const target = new Date(targetDateIso).getTime();
    return humanizeDuration(target - now);
  }, [now, targetDateIso]);
}
