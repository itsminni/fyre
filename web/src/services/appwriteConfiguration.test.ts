import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppwriteConfiguration } from './appwriteConfiguration';

const requiredEnvironment: Record<string, string> = {
  VITE_APPWRITE_ENDPOINT: 'https://example.appwrite.test/v1/',
  VITE_APPWRITE_PROJECT_ID: 'project-id',
  VITE_APPWRITE_DATABASE_ID: 'database-id',
  VITE_APPWRITE_PROFILES_TABLE_ID: 'profiles',
  VITE_APPWRITE_AVATARS_BUCKET_ID: 'avatars',
  VITE_APPWRITE_EVENTS_TABLE_ID: 'events',
  VITE_APPWRITE_EVENT_REGISTRATIONS_TABLE_ID: 'event-registrations',
  VITE_APPWRITE_THREADS_TABLE_ID: 'threads',
  VITE_APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: 'thread-participants',
  VITE_APPWRITE_MESSAGES_TABLE_ID: 'messages',
  VITE_APPWRITE_SWIPES_TABLE_ID: 'swipes',
  VITE_APPWRITE_MATCHES_TABLE_ID: 'matches',
  VITE_APPWRITE_RELATIONSHIPS_TABLE_ID: 'relationships',
  VITE_APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID: 'register-event',
  VITE_APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID: 'cancel-event',
  VITE_APPWRITE_EVENT_ADMIN_FUNCTION_ID: 'event-admin',
  VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID: 'create-thread',
  VITE_APPWRITE_SEND_MESSAGE_FUNCTION_ID: 'send-message',
  VITE_APPWRITE_RECORD_SWIPE_FUNCTION_ID: 'record-swipe',
  VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_ID: 'discover-profiles',
  VITE_APPWRITE_MANAGE_PROFILE_FUNCTION_ID: 'manage-profile',
  VITE_APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID: 'manage-relationship'
};

const optionalEnvironmentNames = [
  'VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID',
  'VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN',
  'VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN',
  'VITE_APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN',
  'VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN',
  'VITE_APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN'
];

function stubRequiredEnvironment(): void {
  for (const [name, value] of Object.entries(requiredEnvironment)) {
    vi.stubEnv(name, value);
  }
  for (const name of optionalEnvironmentNames) {
    vi.stubEnv(name, '');
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Appwrite configuration', () => {
  it('fails fast and lists every missing required variable', () => {
    for (const name of Object.keys(requiredEnvironment)) {
      vi.stubEnv(name, '');
    }

    expect(() => loadAppwriteConfiguration()).toThrowError(
      /VITE_APPWRITE_ENDPOINT.*VITE_APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID/
    );
  });

  it('rejects the placeholders shipped in .env.example', () => {
    stubRequiredEnvironment();
    vi.stubEnv('VITE_APPWRITE_PROJECT_ID', '<APPWRITE_PROJECT_ID>');

    expect(() => loadAppwriteConfiguration()).toThrowError(/VITE_APPWRITE_PROJECT_ID/);
  });

  it('loads required and optional values exclusively from Vite environment variables', () => {
    stubRequiredEnvironment();
    vi.stubEnv('VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID', 'chat-files');
    vi.stubEnv('VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_ID', 'discover-profiles-override');

    expect(loadAppwriteConfiguration()).toMatchObject({
      endpoint: 'https://example.appwrite.test/v1',
      projectId: 'project-id',
      chatAttachmentsBucketId: 'chat-files',
      discoverProfilesFunctionId: 'discover-profiles-override',
      eventAdminFunctionId: 'event-admin'
    });
  });

  it('rejects a non-HTTP endpoint with a clear error', () => {
    stubRequiredEnvironment();
    vi.stubEnv('VITE_APPWRITE_ENDPOINT', 'ftp://example.test/v1');

    expect(() => loadAppwriteConfiguration()).toThrowError(/must use HTTPS/);
  });

  it('rejects HTTP for a remote Appwrite endpoint', () => {
    stubRequiredEnvironment();
    vi.stubEnv('VITE_APPWRITE_ENDPOINT', 'http://example.test/v1');

    expect(() => loadAppwriteConfiguration()).toThrowError(/HTTP is allowed only for localhost/);
  });

  it('rejects endpoint credentials, query strings and fragments', () => {
    stubRequiredEnvironment();

    for (const endpoint of [
      'https://user:secret@example.test/v1',
      'https://example.test/v1?token=value',
      'https://example.test/v1#fragment'
    ]) {
      vi.stubEnv('VITE_APPWRITE_ENDPOINT', endpoint);
      expect(() => loadAppwriteConfiguration()).toThrowError(/VITE_APPWRITE_ENDPOINT.*HTTPS/);
    }
  });

  it('allows HTTP for loopback development endpoints', () => {
    stubRequiredEnvironment();
    vi.stubEnv('VITE_APPWRITE_ENDPOINT', 'http://127.0.0.1:8080/v1/');

    expect(loadAppwriteConfiguration().endpoint).toBe('http://127.0.0.1:8080/v1');
  });

  it('validates and normalizes optional direct function domains', () => {
    stubRequiredEnvironment();
    vi.stubEnv('VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN', 'send.example.test');

    expect(loadAppwriteConfiguration().sendMessageFunctionDomain).toBe('https://send.example.test');

    vi.stubEnv('VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN', 'http://send.example.test');
    expect(() => loadAppwriteConfiguration()).toThrowError(/VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN.*HTTPS/);

    vi.stubEnv('VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN', 'https://send.example.test?token=value');
    expect(() => loadAppwriteConfiguration()).toThrowError(/VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN.*HTTPS/);
  });
});
