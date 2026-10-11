import type { AppNotification } from '../types/models';

export function notificationDestination(notification: AppNotification): string | null {
  if (notification.threadId && (notification.type === 'chat' || notification.type === 'match')) {
    return `/app/messages/${encodeURIComponent(notification.threadId)}`;
  }
  return notification.type === 'event' ? '/app/events/main' : null;
}
