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
  relationshipsTableId: string | null;
  registerForEventFunctionId: string;
  cancelEventRegistrationFunctionId: string;
  eventAdminFunctionId: string | null;
  createOrGetThreadFunctionId: string;
  sendMessageFunctionId: string;
  recordSwipeFunctionId: string | null;
  discoverProfilesFunctionId: string | null;
  manageRelationshipFunctionId: string | null;
  createOrGetThreadFunctionDomain: string | null;
  sendMessageFunctionDomain: string | null;
  recordSwipeFunctionDomain: string | null;
  discoverProfilesFunctionDomain: string | null;
  eventAdminFunctionDomain: string | null;
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

function optionalUrlEnvValue(name: string): string | null {
  const value = optionalEnvValue(name);
  if (!value) {
    return null;
  }

  return value.includes('://') ? value : `https://${value}`;
}

function isBackendExplicitlyDisabled(): boolean {
  const flag = normalizedValue(import.meta.env.VITE_USE_APPWRITE_BACKEND);
  if (!flag) {
    return false;
  }

  const normalized = flag.toLowerCase();
  return normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no';
}

function shouldRequireBackend(): boolean {
  return Boolean(import.meta.env.PROD);
}

function missingConfigurationError(missingKeys: string[]): Error {
  return new Error(
    `Missing Appwrite configuration for production: ${missingKeys.join(', ')}`
  );
}

export function loadAppwriteConfiguration(): AppwriteConfiguration | null {
  if (isBackendExplicitlyDisabled()) {
    if (shouldRequireBackend()) {
      throw new Error('Appwrite backend cannot be disabled in production builds.');
    }
    return null;
  }

  const requiredValues = {
    endpoint: requiredEnvValue('VITE_APPWRITE_ENDPOINT'),
    projectId: requiredEnvValue('VITE_APPWRITE_PROJECT_ID'),
    databaseId: requiredEnvValue('VITE_APPWRITE_DATABASE_ID'),
    profilesTableId: requiredEnvValue('VITE_APPWRITE_PROFILES_TABLE_ID'),
    avatarsBucketId: requiredEnvValue('VITE_APPWRITE_AVATARS_BUCKET_ID'),
    eventsTableId: requiredEnvValue('VITE_APPWRITE_EVENTS_TABLE_ID'),
    eventRegistrationsTableId: requiredEnvValue('VITE_APPWRITE_EVENT_REGISTRATIONS_TABLE_ID'),
    threadsTableId: requiredEnvValue('VITE_APPWRITE_THREADS_TABLE_ID'),
    threadParticipantsTableId: requiredEnvValue('VITE_APPWRITE_THREAD_PARTICIPANTS_TABLE_ID'),
    messagesTableId: requiredEnvValue('VITE_APPWRITE_MESSAGES_TABLE_ID'),
    registerForEventFunctionId: requiredEnvValue('VITE_APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID'),
    cancelEventRegistrationFunctionId: requiredEnvValue('VITE_APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID'),
    createOrGetThreadFunctionId: requiredEnvValue('VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID'),
    sendMessageFunctionId: requiredEnvValue('VITE_APPWRITE_SEND_MESSAGE_FUNCTION_ID'),
    recordSwipeFunctionId: requiredEnvValue('VITE_APPWRITE_RECORD_SWIPE_FUNCTION_ID')
  };

  const missingKeys = Object.entries(requiredValues)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    if (shouldRequireBackend()) {
      throw missingConfigurationError(missingKeys);
    }

    return null;
  }

  const {
    endpoint,
    projectId,
    databaseId,
    profilesTableId,
    avatarsBucketId,
    eventsTableId,
    eventRegistrationsTableId,
    threadsTableId,
    threadParticipantsTableId,
    messagesTableId,
    registerForEventFunctionId,
    cancelEventRegistrationFunctionId,
    createOrGetThreadFunctionId,
    sendMessageFunctionId,
    recordSwipeFunctionId
  } = requiredValues as Record<keyof typeof requiredValues, string>;

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
    relationshipsTableId: optionalEnvValue('VITE_APPWRITE_RELATIONSHIPS_TABLE_ID'),
    registerForEventFunctionId,
    cancelEventRegistrationFunctionId,
    eventAdminFunctionId: optionalEnvValue('VITE_APPWRITE_EVENT_ADMIN_FUNCTION_ID'),
    createOrGetThreadFunctionId,
    sendMessageFunctionId,
    recordSwipeFunctionId,
    discoverProfilesFunctionId: optionalEnvValue('VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_ID'),
    manageRelationshipFunctionId: optionalEnvValue('VITE_APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID'),
    createOrGetThreadFunctionDomain: optionalUrlEnvValue('VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN'),
    sendMessageFunctionDomain: optionalUrlEnvValue('VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN'),
    recordSwipeFunctionDomain: optionalUrlEnvValue('VITE_APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN'),
    discoverProfilesFunctionDomain: optionalUrlEnvValue('VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN'),
    eventAdminFunctionDomain: optionalUrlEnvValue('VITE_APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN')
  };
}
