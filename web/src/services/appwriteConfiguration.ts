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
  swipesTableId: string;
  matchesTableId: string;
  relationshipsTableId: string;
  registerForEventFunctionId: string;
  cancelEventRegistrationFunctionId: string;
  eventAdminFunctionId: string;
  createOrGetThreadFunctionId: string;
  sendMessageFunctionId: string;
  recordSwipeFunctionId: string;
  discoverProfilesFunctionId: string;
  manageProfileFunctionId: string;
  manageRelationshipFunctionId: string;
  createOrGetThreadFunctionDomain: string | null;
  sendMessageFunctionDomain: string | null;
  recordSwipeFunctionDomain: string | null;
  discoverProfilesFunctionDomain: string | null;
  eventAdminFunctionDomain: string | null;
}

type AppwriteEnvironment = Record<string, unknown>;

const REQUIRED_VARIABLES = [
  'VITE_APPWRITE_ENDPOINT',
  'VITE_APPWRITE_PROJECT_ID',
  'VITE_APPWRITE_DATABASE_ID',
  'VITE_APPWRITE_PROFILES_TABLE_ID',
  'VITE_APPWRITE_AVATARS_BUCKET_ID',
  'VITE_APPWRITE_EVENTS_TABLE_ID',
  'VITE_APPWRITE_EVENT_REGISTRATIONS_TABLE_ID',
  'VITE_APPWRITE_THREADS_TABLE_ID',
  'VITE_APPWRITE_THREAD_PARTICIPANTS_TABLE_ID',
  'VITE_APPWRITE_MESSAGES_TABLE_ID',
  'VITE_APPWRITE_SWIPES_TABLE_ID',
  'VITE_APPWRITE_MATCHES_TABLE_ID',
  'VITE_APPWRITE_RELATIONSHIPS_TABLE_ID',
  'VITE_APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID',
  'VITE_APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID',
  'VITE_APPWRITE_EVENT_ADMIN_FUNCTION_ID',
  'VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID',
  'VITE_APPWRITE_SEND_MESSAGE_FUNCTION_ID',
  'VITE_APPWRITE_RECORD_SWIPE_FUNCTION_ID',
  'VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_ID',
  'VITE_APPWRITE_MANAGE_PROFILE_FUNCTION_ID',
  'VITE_APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID'
] as const;

function readAppwriteEnvironment(): AppwriteEnvironment {
  return {
    VITE_APPWRITE_ENDPOINT: import.meta.env.VITE_APPWRITE_ENDPOINT,
    VITE_APPWRITE_PROJECT_ID: import.meta.env.VITE_APPWRITE_PROJECT_ID,
    VITE_APPWRITE_DATABASE_ID: import.meta.env.VITE_APPWRITE_DATABASE_ID,
    VITE_APPWRITE_PROFILES_TABLE_ID: import.meta.env.VITE_APPWRITE_PROFILES_TABLE_ID,
    VITE_APPWRITE_AVATARS_BUCKET_ID: import.meta.env.VITE_APPWRITE_AVATARS_BUCKET_ID,
    VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID: import.meta.env.VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID,
    VITE_APPWRITE_EVENTS_TABLE_ID: import.meta.env.VITE_APPWRITE_EVENTS_TABLE_ID,
    VITE_APPWRITE_EVENT_REGISTRATIONS_TABLE_ID: import.meta.env.VITE_APPWRITE_EVENT_REGISTRATIONS_TABLE_ID,
    VITE_APPWRITE_THREADS_TABLE_ID: import.meta.env.VITE_APPWRITE_THREADS_TABLE_ID,
    VITE_APPWRITE_THREAD_PARTICIPANTS_TABLE_ID: import.meta.env.VITE_APPWRITE_THREAD_PARTICIPANTS_TABLE_ID,
    VITE_APPWRITE_MESSAGES_TABLE_ID: import.meta.env.VITE_APPWRITE_MESSAGES_TABLE_ID,
    VITE_APPWRITE_SWIPES_TABLE_ID: import.meta.env.VITE_APPWRITE_SWIPES_TABLE_ID,
    VITE_APPWRITE_MATCHES_TABLE_ID: import.meta.env.VITE_APPWRITE_MATCHES_TABLE_ID,
    VITE_APPWRITE_RELATIONSHIPS_TABLE_ID: import.meta.env.VITE_APPWRITE_RELATIONSHIPS_TABLE_ID,
    VITE_APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID: import.meta.env.VITE_APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID,
    VITE_APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID: import.meta.env.VITE_APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID,
    VITE_APPWRITE_EVENT_ADMIN_FUNCTION_ID: import.meta.env.VITE_APPWRITE_EVENT_ADMIN_FUNCTION_ID,
    VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID: import.meta.env.VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID,
    VITE_APPWRITE_SEND_MESSAGE_FUNCTION_ID: import.meta.env.VITE_APPWRITE_SEND_MESSAGE_FUNCTION_ID,
    VITE_APPWRITE_RECORD_SWIPE_FUNCTION_ID: import.meta.env.VITE_APPWRITE_RECORD_SWIPE_FUNCTION_ID,
    VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_ID: import.meta.env.VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_ID,
    VITE_APPWRITE_MANAGE_PROFILE_FUNCTION_ID: import.meta.env.VITE_APPWRITE_MANAGE_PROFILE_FUNCTION_ID,
    VITE_APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID: import.meta.env.VITE_APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID,
    VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN: import.meta.env.VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN,
    VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN: import.meta.env.VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN,
    VITE_APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN: import.meta.env.VITE_APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN,
    VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN: import.meta.env.VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN,
    VITE_APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN: import.meta.env.VITE_APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN
  };
}

function readEnvironmentValue(environment: AppwriteEnvironment, name: string): string | null {
  const value = environment[name];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || /^<[^>]+>$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function optionalEnvironmentValue(environment: AppwriteEnvironment, name: string): string | null {
  return readEnvironmentValue(environment, name);
}

function requireEnvironmentValue(environment: AppwriteEnvironment, name: typeof REQUIRED_VARIABLES[number]): string {
  const value = readEnvironmentValue(environment, name);
  if (!value) {
    throw new Error(`Missing required Appwrite environment variable: ${name}`);
  }
  return value;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized === '::1') {
    return true;
  }

  const octets = normalized.split('.');
  return octets.length === 4
    && octets[0] === '127'
    && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

function validateSecureUrl(value: string, variableName: string, allowMissingScheme = false): string {
  const normalizedValue = allowMissingScheme && !value.includes('://') ? `https://${value}` : value;
  let url: URL;
  try {
    url = new URL(normalizedValue);
  } catch {
    throw new Error(`${variableName} must be a valid absolute URL.`);
  }

  const secureProtocol = url.protocol === 'https:';
  const localDevelopmentProtocol = url.protocol === 'http:' && isLoopbackHostname(url.hostname);
  if (
    (!secureProtocol && !localDevelopmentProtocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${variableName} must use HTTPS; HTTP is allowed only for localhost or a loopback IP.`);
  }

  return normalizedValue.replace(/\/+$/, '');
}

function optionalSecureUrl(environment: AppwriteEnvironment, name: string): string | null {
  const value = optionalEnvironmentValue(environment, name);
  return value ? validateSecureUrl(value, name, true) : null;
}

export function loadAppwriteConfiguration(): AppwriteConfiguration {
  const environment = readAppwriteEnvironment();
  const missingVariables = REQUIRED_VARIABLES.filter(
    (name) => !readEnvironmentValue(environment, name)
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Appwrite configuration is incomplete. Missing or placeholder variables: ${missingVariables.join(', ')}. ` +
      'Copy web/.env.example to web/.env.local and provide values for this environment.'
    );
  }

  return {
    endpoint: validateSecureUrl(
      requireEnvironmentValue(environment, 'VITE_APPWRITE_ENDPOINT'),
      'VITE_APPWRITE_ENDPOINT'
    ),
    projectId: requireEnvironmentValue(environment, 'VITE_APPWRITE_PROJECT_ID'),
    databaseId: requireEnvironmentValue(environment, 'VITE_APPWRITE_DATABASE_ID'),
    profilesTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_PROFILES_TABLE_ID'),
    avatarsBucketId: requireEnvironmentValue(environment, 'VITE_APPWRITE_AVATARS_BUCKET_ID'),
    chatAttachmentsBucketId: optionalEnvironmentValue(environment, 'VITE_APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID'),
    eventsTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_EVENTS_TABLE_ID'),
    eventRegistrationsTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_EVENT_REGISTRATIONS_TABLE_ID'),
    threadsTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_THREADS_TABLE_ID'),
    threadParticipantsTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_THREAD_PARTICIPANTS_TABLE_ID'),
    messagesTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_MESSAGES_TABLE_ID'),
    swipesTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_SWIPES_TABLE_ID'),
    matchesTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_MATCHES_TABLE_ID'),
    relationshipsTableId: requireEnvironmentValue(environment, 'VITE_APPWRITE_RELATIONSHIPS_TABLE_ID'),
    registerForEventFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_REGISTER_FOR_EVENT_FUNCTION_ID'),
    cancelEventRegistrationFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_CANCEL_EVENT_REGISTRATION_FUNCTION_ID'),
    eventAdminFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_EVENT_ADMIN_FUNCTION_ID'),
    createOrGetThreadFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_ID'),
    sendMessageFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_SEND_MESSAGE_FUNCTION_ID'),
    recordSwipeFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_RECORD_SWIPE_FUNCTION_ID'),
    discoverProfilesFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_ID'),
    manageProfileFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_MANAGE_PROFILE_FUNCTION_ID'),
    manageRelationshipFunctionId: requireEnvironmentValue(environment, 'VITE_APPWRITE_MANAGE_RELATIONSHIP_FUNCTION_ID'),
    createOrGetThreadFunctionDomain: optionalSecureUrl(environment, 'VITE_APPWRITE_CREATE_OR_GET_THREAD_FUNCTION_DOMAIN'),
    sendMessageFunctionDomain: optionalSecureUrl(environment, 'VITE_APPWRITE_SEND_MESSAGE_FUNCTION_DOMAIN'),
    recordSwipeFunctionDomain: optionalSecureUrl(environment, 'VITE_APPWRITE_RECORD_SWIPE_FUNCTION_DOMAIN'),
    discoverProfilesFunctionDomain: optionalSecureUrl(environment, 'VITE_APPWRITE_DISCOVER_PROFILES_FUNCTION_DOMAIN'),
    eventAdminFunctionDomain: optionalSecureUrl(environment, 'VITE_APPWRITE_EVENT_ADMIN_FUNCTION_DOMAIN')
  };
}
