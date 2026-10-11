import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountSettings, storeAccountSettings } from './accountSettings';
import { createDefaultPersistedState } from './persistence';

afterEach(() => vi.unstubAllGlobals());

describe('account preferences', () => {
  it('isolates notifications and privacy while keeping the device appearance', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    const device = { ...createDefaultPersistedState().settings, themeMode: 'dark' as const, language: 'en' as const, browserPushEnabled: true, showAge: false };
    storeAccountSettings(device, 'project', 'a');
    const b = accountSettings(device, 'project', 'b');
    expect(b.browserPushEnabled).toBe(false); expect(b.showAge).toBe(true);
    expect(b.themeMode).toBe('dark'); expect(b.language).toBe('en');
    expect(accountSettings(b, 'project', 'a').browserPushEnabled).toBe(true);
    expect(accountSettings(b, 'other-project', 'a').browserPushEnabled).toBe(false);
    expect(accountSettings(device, 'project', null).browserPushEnabled).toBe(false);
  });

  it('ignores malformed settings and tolerates unavailable storage', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => '{"browserPushEnabled":"true","showAge":false}' } });
    const settings = accountSettings(createDefaultPersistedState().settings, 'p', 'a');
    expect(settings.browserPushEnabled).toBe(false); expect(settings.showAge).toBe(false);
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('unavailable'); }, setItem: () => { throw new Error('unavailable'); } } });
    expect(accountSettings(settings, 'p', 'a').showAge).toBe(true);
    expect(() => storeAccountSettings(settings, 'p', 'a')).not.toThrow();
  });
});
