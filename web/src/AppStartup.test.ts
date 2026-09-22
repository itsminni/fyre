import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStartup } from './AppStartup';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('startup without backend configuration', () => {
  it('renders a bilingual fallback instead of importing the unconfigured application', () => {
    vi.stubEnv('VITE_APPWRITE_PROJECT_ID', '');

    const markup = renderToStaticMarkup(createElement(AppStartup));

    expect(markup).toContain('Servizio non disponibile');
    expect(markup).toContain('Service unavailable');
    expect(markup).toContain('web/.env.local');
  });

  it('does not show setup instructions or configured values in production', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_APPWRITE_PROJECT_ID', '');
    vi.stubEnv('VITE_APPWRITE_ENDPOINT', 'https://private-config.example.test/v1');

    const markup = renderToStaticMarkup(createElement(AppStartup));

    expect(markup).toContain('Service unavailable');
    expect(markup).not.toContain('web/.env');
    expect(markup).not.toContain('private-config');
  });
});
