import { defineConfig } from '@playwright/test';

const resources = {
  DATABASE: 'database', PROFILES_TABLE: 'profiles', AVATARS_BUCKET: 'avatars',
  CHAT_ATTACHMENTS_BUCKET: 'attachments', EVENTS_TABLE: 'events', EVENT_REGISTRATIONS_TABLE: 'registrations',
  THREADS_TABLE: 'threads', THREAD_PARTICIPANTS_TABLE: 'participants', MESSAGES_TABLE: 'messages',
  SWIPES_TABLE: 'swipes', MATCHES_TABLE: 'matches', RELATIONSHIPS_TABLE: 'relationships',
  REGISTER_FOR_EVENT_FUNCTION: 'register', CANCEL_EVENT_REGISTRATION_FUNCTION: 'cancel', EVENT_ADMIN_FUNCTION: 'admin',
  CREATE_OR_GET_THREAD_FUNCTION: 'create-thread', SEND_MESSAGE_FUNCTION: 'send-message', RECORD_SWIPE_FUNCTION: 'swipe',
  DISCOVER_PROFILES_FUNCTION: 'discover', MANAGE_PROFILE_FUNCTION: 'profile', MANAGE_RELATIONSHIP_FUNCTION: 'relationship'
};
const environment: Record<string, string> = {
  VITE_APPWRITE_ENDPOINT: 'https://appwrite.test/v1', VITE_APPWRITE_PROJECT_ID: 'e2e',
  VITE_APPWRITE_API_FUNCTION_ID: 'fyre-api', VITE_APPWRITE_STORAGE_BUCKET_ID: 'attachments',
  VITE_PHOTON_BASE_URL: 'https://geocoder.test',
  ...Object.fromEntries(Object.entries(resources).map(([name, value]) => [`VITE_APPWRITE_${name}_ID`, value])),
  ...Object.fromEntries(['CREATE_OR_GET_THREAD', 'SEND_MESSAGE', 'RECORD_SWIPE', 'DISCOVER_PROFILES', 'EVENT_ADMIN']
    .map((name) => [`VITE_APPWRITE_${name}_FUNCTION_DOMAIN`, '']))
};

export default defineConfig({
  testDir: './e2e', testMatch: '**/*.pw.ts', timeout: 30_000, fullyParallel: true,
  forbidOnly: Boolean(process.env.CI), retries: process.env.CI ? 1 : 0,
  reporter: 'list', workers: process.env.CI ? 2 : undefined,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'small-mobile', use: { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false, env: environment }
});
