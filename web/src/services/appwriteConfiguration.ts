export interface AppwriteConfiguration {
  endpoint: string;
  projectId: string;
  databaseId: string;
  profilesTableId: string;
  avatarsBucketId: string;
  chatAttachmentsBucketId: string | null;
  eventsTableId: string;
  eventRegistrationsTableId: string;
  threadsTableId: string;
  threadParticipantsTableId: string;
  messagesTableId: string;
  swipesTableId: string | null;
  matchesTableId: string | null;
  registerForEventFunctionId: string;
  cancelEventRegistrationFunctionId: string;
  eventAdminFunctionId: string | null;
  createOrGetThreadFunctionId: string;
  sendMessageFunctionId: string;
  recordSwipeFunctionId: string | null;
  discoverProfilesFunctionId: string | null;
}

function normalizedValue(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredEnvValue(name: string): string | null {
  return normalizedValue(import.meta.env[name]);
}

function optionalEnvValue(name: string): string | null {
  return normalizedValue(import.meta.env[name]);
}

function isBackendExplicitlyDisabled(): boolean {
  const flag = normalizedValue(import.meta.env.VITE_USE_APPWRITE_BACKEND);
  if (!flag) {
    return false;
  }

  const normalized = flag.toLowerCase();
  return normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no';
}

export function loadAppwriteConfiguration(): AppwriteConfiguration | null {
  if (isBackendExplicitlyDisabled()) {
    return null;
  }

  const endpoint = requiredEnvValue('VITE_APPWRITE_ENDPOINT');
  const projectId = requiredEnvValue('VITE_APPWRITE_PROJECT_ID');
  const databaseId = requiredEnvValue('VITE_APPWRITE_DATABASE_ID');
  const profilesTableId = requiredEnvValue('VITE_APPWRITE_PROFILES_TABLE_ID');
  const avatarsBucketId = requiredEnvValue('VITE_APPWRITE_AVATARS_BUCKET_ID');
  const eventsTableId = requiredEnvValue('VITE_APPWRITE_EVENTS_TABLE_ID');
  const eventRegistrationsTableId = requiredEnvValue('VITE_APPWRITE_EVENT_REGISTRATIONS_TABLE_ID');
  const threadsTableId = requiredEnvValue('VITE_APPWRITE_THREADS_TABLE_ID');
  const threadParticipantsTableId = requiredEnvValue('VITE_APPWRITE_THREAD_PARTICIPANTS_TABLE_ID');
  const messagesTableId = requiredEnvValue('VITE_APPWRITE_MESSAGES_TABLE_ID');
  const registerForEventFunctionId = requiredEnvValue('VITE_APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID');
  const cancelEventRegistrationFunctionId = requiredEnvValue('VITE_APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID');
  const createOrGetThreadFunctionId = requiredEnvValue('VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID');
  const sendMessageFunctionId = requiredEnvValue('VITE_APPWRITE_SEND_MESSAGE_FUNCTION_ID');

  if (
    !endpoint ||
    !projectId ||
    !databaseId ||
    !profilesTableId ||
    !avatarsBucketId ||
    !eventsTableId ||
    !eventRegistrationsTableId ||
    !threadsTableId ||
    !threadParticipantsTableId ||
    !messagesTableId ||
    !registerForEventFunctionId ||
    !cancelEventRegistrationFunctionId ||
    !createOrGetThreadFunctionId ||
    !sendMessageFunctionId
  ) {
    return null;
  }

  return {
    endpoint,
    projectId,
    databaseId,
    profilesTableId,
    avatarsBucketId,
    chatAttachmentsBucketId: optionalEnvValue('VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID'),
    eventsTableId,
    eventRegistrationsTableId,
    threadsTableId,
    threadParticipantsTableId,
    messagesTableId,
    swipesTableId: optionalEnvValue('VITE_APPWRITE_SWIPES_TABLE_ID'),
    matchesTableId: optionalEnvValue('VITE_APPWRITE_MATCHES_TABLE_ID'),
    registerForEventFunctionId,
    cancelEventRegistrationFunctionId,
    eventAdminFunctionId: optionalEnvValue('VITE_APPWRITE_EVENT_ADMIN_FUNCTION_ID'),
    createOrGetThreadFunctionId,
    sendMessageFunctionId,
    recordSwipeFunctionId: optionalEnvValue('VITE_APPWRITE_RECORD_SWIPE_FUNCTION_ID'),
    discoverProfilesFunctionId: optionalEnvValue('VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_ID')
  };
}
