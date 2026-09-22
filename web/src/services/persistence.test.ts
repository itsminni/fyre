import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultPersistedState,
  loadPersistedState,
  persistState,
  withoutSensitivePersistedData
} from './persistence';

function installLocalStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
  vi.stubGlobal('window', { localStorage });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persisted session privacy', () => {
  it('falls back to defaults when access to browser storage is denied', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('Storage access denied');
      }
    });

    expect(loadPersistedState()).toEqual(createDefaultPersistedState());
    expect(() => persistState(createDefaultPersistedState())).not.toThrow();
  });

  it('keeps in-memory preferences when a storage write fails', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('Storage read failed'); },
        setItem: () => { throw new Error('Storage quota exceeded'); }
      }
    });
    const state = createDefaultPersistedState();
    state.settings = { ...state.settings, language: 'en' };

    expect(loadPersistedState()).toEqual(createDefaultPersistedState());
    expect(() => persistState(state)).not.toThrow();
    expect(state.settings.language).toBe('en');
  });

  it('removes account, chat, and notification data while preserving preferences', () => {
    const state = createDefaultPersistedState();
    state.users = [{
      email: 'private@example.com',
      profileImageData: 'data:image/jpeg;base64,private'
    }];
    state.currentUserEmail = 'private@example.com';
    state.realtimeState = 'connected';
    state.notifications = [{
      id: 'notification-1',
      type: 'chat',
      title: 'Private message',
      body: 'Sensitive body',
      createdAt: '2030-01-01T00:00:00.000Z'
    }];
    state.threads = [{
      id: 'thread-1',
      name: 'Private chat',
      avatar: '',
      isOnline: false,
      unreadCount: 1,
      createdAt: '2030-01-01T00:00:00.000Z',
      notificationsEnabled: true,
      messages: [{
        id: 'message-1',
        text: 'Sensitive message',
        isMe: false,
        time: '12:00',
        createdAt: '2030-01-01T00:00:00.000Z'
      }]
    }];

    const sanitized = withoutSensitivePersistedData(state);

    expect(sanitized).toMatchObject({
      users: [],
      currentUserEmail: null,
      realtimeState: 'disconnected',
      notifications: [],
      threads: []
    });
    expect(sanitized.settings).toEqual(state.settings);
  });

  it('persists and loads only the current versioned envelope', () => {
    const values = installLocalStorage();
    const state = createDefaultPersistedState();
    const legacyUser = {
      email: 'legacy@example.com',
      password: 'must-not-be-persisted'
    };
    state.users = [legacyUser];
    state.currentUserEmail = legacyUser.email;
    state.settings = { ...state.settings, language: 'en' };

    persistState(state);

    const serialized = values.get('fyre_web_state') ?? '';
    expect(JSON.parse(serialized)).toMatchObject({
      version: 2,
      state: {
        users: [],
        currentUserEmail: null,
        settings: { language: 'en' }
      }
    });
    expect(serialized).not.toContain(legacyUser.password);
    expect(loadPersistedState().settings.language).toBe('en');
  });

  it('ignores unversioned payloads instead of migrating them', () => {
    const unversionedState = createDefaultPersistedState();
    unversionedState.settings = { ...unversionedState.settings, language: 'en' };
    installLocalStorage({ fyre_web_state: JSON.stringify(unversionedState) });

    expect(loadPersistedState().settings.language).toBe('it');
  });
});
