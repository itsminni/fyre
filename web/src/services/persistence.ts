import { AppSettings, MainEventState, PersistedAppState } from '../types/models';
import { createInitialMainEventState, createMockThreads } from '../data/mockData';

const STORAGE_KEY = 'fyre_web_state_v1';

const defaultSettings: AppSettings = {
  themeMode: 'system',
  notificationsEnabled: true,
  showAge: true,
  showDistance: true
};

export function createDefaultPersistedState(): PersistedAppState {
  return {
    users: [],
    currentUserEmail: null,
    mainEventState: createInitialMainEventState(),
    threads: createMockThreads(),
    settings: defaultSettings
  };
}

export function loadPersistedState(): PersistedAppState {
  const fallbackState = createDefaultPersistedState();

  if (typeof window === 'undefined') {
    return fallbackState;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return fallbackState;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedAppState>;

    return {
      users: Array.isArray(parsed.users) ? parsed.users : fallbackState.users,
      currentUserEmail:
        typeof parsed.currentUserEmail === 'string' || parsed.currentUserEmail === null
          ? parsed.currentUserEmail
          : fallbackState.currentUserEmail,
      mainEventState: sanitizeMainEventState(parsed.mainEventState, fallbackState.mainEventState),
      threads: Array.isArray(parsed.threads) ? parsed.threads : fallbackState.threads,
      settings: {
        ...defaultSettings,
        ...(parsed.settings ?? {})
      }
    };
  } catch {
    return fallbackState;
  }
}

function sanitizeMainEventState(
  value: PersistedAppState['mainEventState'] | undefined,
  fallback: MainEventState
): MainEventState {
  if (!value) {
    return fallback;
  }

  return {
    participants: Array.isArray(value.participants) ? value.participants : fallback.participants,
    waitingList: Array.isArray(value.waitingList) ? value.waitingList : fallback.waitingList,
    history: Array.isArray(value.history) ? value.history : fallback.history
  };
}

export function persistState(value: PersistedAppState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}
