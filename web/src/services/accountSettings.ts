import type { AppSettings } from '../types/models';
import { createDefaultPersistedState } from './persistence';

const keys = ['notificationsEnabled', 'matchNotificationsEnabled', 'messageNotificationsEnabled',
  'eventReminderNotificationsEnabled', 'notificationsPollingEnabled', 'browserPushEnabled',
  'showAge', 'showDistance', 'showIntent', 'showInterests', 'showInstagramTag', 'showSpotifyTag'] as const;

function storageKey(project: string, owner: string): string {
  return `fyre_account_preferences_v1:${encodeURIComponent(project)}:${encodeURIComponent(owner)}`;
}

export function accountSettings(device: AppSettings, project: string, owner: string | null): AppSettings {
  const settings = { ...device };
  const defaults = createDefaultPersistedState().settings;
  keys.forEach((key) => { settings[key] = defaults[key]; });
  if (!owner || typeof window === 'undefined') return settings;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(project, owner)) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) {
      keys.forEach((key) => {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === 'boolean') settings[key] = value;
      });
    }
  } catch { /* Keep defaults when browser storage is unavailable. */ }
  return settings;
}

export function storeAccountSettings(settings: AppSettings, project: string, owner: string | null): void {
  if (!owner || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(project, owner), JSON.stringify(
      Object.fromEntries(keys.map((key) => [key, settings[key]]))
    ));
  } catch { /* Preferences remain available in memory. */ }
}
