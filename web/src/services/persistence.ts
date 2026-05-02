import {
  AppNotification,
  AppSettings,
  ChatAttachment,
  ChatDeliveryState,
  ChatMessage,
  ChatThread,
  MainEventConfig,
  MainEventInfo,
  MainEventState,
  PersistedAppState,
  RealtimeConnectionState,
  RelationshipState,
  User,
  UserOrientation,
  UserGender
} from '../types/models';
import { normalizeUser } from '../types/models';
import {
  createDefaultMainEventConfig,
  createDefaultMainEventInfo,
  createInitialMainEventState
} from '../data/mockData';

const STORAGE_KEY = 'fyre_web_state';
const LEGACY_STORAGE_KEY = 'fyre_web_state_v1';
const STORAGE_VERSION = 2;

interface PersistedStateEnvelope {
  version: number;
  state: unknown;
}

const defaultSettings: AppSettings = {
  language: 'it',
  themeMode: 'system',
  notificationsEnabled: true,
  matchNotificationsEnabled: true,
  messageNotificationsEnabled: true,
  eventReminderNotificationsEnabled: true,
  notificationsPollingEnabled: true,
  browserPushEnabled: false,
  showAge: true,
  showDistance: true,
  showIntent: true,
  showInterests: true,
  showInstagramTag: true,
  showSpotifyTag: true,
  chatBackgroundStyle: 'midnight',
  chatBackgroundBrightness: 0,
  chatBackgroundColor1: '#3F4755',
  chatBackgroundColor2: '#8B7A74',
  chatBackgroundColor3: '#B9A89B',
  outgoingBubblePalette: 'sunset',
  incomingBubblePalette: 'graphite',
  sendButtonColor1: '#FF9A00',
  sendButtonColor2: '#FF8A1F',
  sendButtonColor3: '#E14D33'
};

export function createDefaultPersistedState(): PersistedAppState {
  return {
    users: [],
    currentUserEmail: null,
    realtimeState: 'disconnected',
    notifications: [],
    mainEventConfig: createDefaultMainEventConfig(),
    mainEventInfo: createDefaultMainEventInfo(),
    mainEventState: createInitialMainEventState(),
    threads: [],
    settings: defaultSettings
  };
}

export function loadPersistedState(): PersistedAppState {
  const fallbackState = createDefaultPersistedState();

  if (typeof window === 'undefined') {
    return fallbackState;
  }

  const rawValue =
    window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!rawValue) {
    return fallbackState;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedAppState> | PersistedStateEnvelope;
    const candidateState = unwrapPersistedState(parsed);
    if (!candidateState) {
      return fallbackState;
    }

    return {
      users: sanitizeUsers(candidateState.users),
      currentUserEmail:
        typeof candidateState.currentUserEmail === 'string' || candidateState.currentUserEmail === null
          ? candidateState.currentUserEmail
          : fallbackState.currentUserEmail,
      realtimeState: sanitizeRealtimeState(candidateState.realtimeState, fallbackState.realtimeState),
      notifications: sanitizeNotifications(candidateState.notifications),
      mainEventConfig: sanitizeMainEventConfig(candidateState.mainEventConfig, fallbackState.mainEventConfig),
      mainEventInfo: sanitizeMainEventInfo(candidateState.mainEventInfo, fallbackState.mainEventInfo),
      mainEventState: sanitizeMainEventState(candidateState.mainEventState, fallbackState.mainEventState),
      threads: sanitizeThreads(candidateState.threads),
      settings: {
        ...defaultSettings,
        ...(isRecord(candidateState.settings) ? candidateState.settings : {})
      }
    };
  } catch {
    return fallbackState;
  }
}

function unwrapPersistedState(
  value: Partial<PersistedAppState> | PersistedStateEnvelope
): Partial<PersistedAppState> | null {
  if (!isRecord(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const maybeVersion = record.version;
  const maybeState = record.state;

  if (typeof maybeVersion === 'number') {
    return isRecord(maybeState) ? (maybeState as Partial<PersistedAppState>) : null;
  }

  return value as Partial<PersistedAppState>;
}

function sanitizeUsers(value: unknown): User[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((user) => sanitizeUser(user))
    .filter((user): user is User => user !== null);
}

function sanitizeUser(value: unknown): User | null {
  if (!isRecord(value) || typeof value.email !== 'string') {
    return null;
  }

  const showMe = sanitizeShowMe(value.showMe);

  return normalizeUser({
    email: value.email,
    password: typeof value.password === 'string' ? value.password : '',
    appwriteUserId: typeof value.appwriteUserId === 'string' ? value.appwriteUserId : undefined,
    firstName: typeof value.firstName === 'string' ? value.firstName : undefined,
    lastName: typeof value.lastName === 'string' ? value.lastName : undefined,
    city: typeof value.city === 'string' ? value.city : undefined,
    cityLat: typeof value.cityLat === 'number' ? value.cityLat : undefined,
    cityLng: typeof value.cityLng === 'number' ? value.cityLng : undefined,
    latitude: typeof value.latitude === 'number' ? value.latitude : undefined,
    longitude: typeof value.longitude === 'number' ? value.longitude : undefined,
    birthDate: typeof value.birthDate === 'string' ? value.birthDate : undefined,
    gender: sanitizeUserGender(value.gender),
    orientation: sanitizeUserOrientation(value.orientation),
    showMe,
    preferredGenders: sanitizePreferredGenders(value.preferredGenders),
    smokes: typeof value.smokes === 'boolean' ? value.smokes : undefined,
    drinks: typeof value.drinks === 'boolean' ? value.drinks : undefined,
    bio: typeof value.bio === 'string' ? value.bio : undefined,
    minPreferredAge: typeof value.minPreferredAge === 'number' ? value.minPreferredAge : undefined,
    maxPreferredAge: typeof value.maxPreferredAge === 'number' ? value.maxPreferredAge : undefined,
    ageRangeMin: typeof value.ageRangeMin === 'number' ? value.ageRangeMin : undefined,
    ageRangeMax: typeof value.ageRangeMax === 'number' ? value.ageRangeMax : undefined,
    maxDistanceKm: typeof value.maxDistanceKm === 'number' ? value.maxDistanceKm : undefined,
    intent: sanitizeMatchIntent(value.intent),
    hobbies: typeof value.hobbies === 'string' ? value.hobbies : undefined,
    passions: typeof value.passions === 'string' ? value.passions : undefined,
    lookingFor: typeof value.lookingFor === 'string' ? value.lookingFor : undefined,
    instagram: typeof value.instagram === 'string' ? value.instagram : undefined,
    instagramTag: typeof value.instagramTag === 'string' ? value.instagramTag : undefined,
    telegram: typeof value.telegram === 'string' ? value.telegram : undefined,
    spotifyTag: typeof value.spotifyTag === 'string' ? value.spotifyTag : undefined,
    website: typeof value.website === 'string' ? value.website : undefined,
    favoriteSong: typeof value.favoriteSong === 'string' ? value.favoriteSong : undefined,
    favoriteMovie: typeof value.favoriteMovie === 'string' ? value.favoriteMovie : undefined,
    avatarFileId: typeof value.avatarFileId === 'string' ? value.avatarFileId : undefined,
    profileImageData: typeof value.profileImageData === 'string' ? value.profileImageData : undefined
  });
}

function sanitizeShowMe(value: unknown): User['showMe'] {
  if (value === 'men' || value === 'women' || value === 'everyone') {
    return value;
  }
  return 'everyone';
}

function sanitizeUserGender(value: unknown): UserGender | undefined {
  if (value === 'male' || value === 'female' || value === 'nonBinary' || value === 'other') {
    return value;
  }
  return undefined;
}

function sanitizePreferredGenders(value: unknown): UserGender[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sanitized = value.filter(
    (gender): gender is UserGender =>
      gender === 'male' || gender === 'female' || gender === 'nonBinary' || gender === 'other'
  );

  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeUserOrientation(value: unknown): UserOrientation | undefined {
  if (
    value === 'straight' ||
    value === 'gay' ||
    value === 'lesbian' ||
    value === 'bisexual' ||
    value === 'pansexual' ||
    value === 'other'
  ) {
    return value;
  }
  return undefined;
}

function sanitizeMatchIntent(value: unknown): User['intent'] | undefined {
  if (
    value === 'relationship' ||
    value === 'friendship' ||
    value === 'casual' ||
    value === 'notSure'
  ) {
    return value;
  }
  if (value === 'networking') {
    return 'notSure';
  }
  return undefined;
}

function sanitizeMainEventState(
  value: PersistedAppState['mainEventState'] | undefined,
  fallback: MainEventState
): MainEventState {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    participants: sanitizeParticipants(value.participants),
    waitingList: sanitizeParticipants(value.waitingList),
    history: sanitizeHistory(value.history)
  };
}

function sanitizeHistory(value: unknown): MainEventState['history'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item) || typeof item.email !== 'string') {
        return null;
      }

      return {
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        email: item.email,
        eventTitle: typeof item.eventTitle === 'string' ? item.eventTitle : 'Fyre Event',
        eventDate: typeof item.eventDate === 'string' ? item.eventDate : new Date().toISOString(),
        status:
          item.status === 'confirmed' ||
          item.status === 'waitlisted' ||
          item.status === 'cancelled' ||
          item.status === 'promoted'
            ? item.status
            : 'confirmed',
        timestamp: typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString()
      };
    })
    .filter((item): item is MainEventState['history'][number] => Boolean(item));
}

function sanitizeParticipants(value: unknown): MainEventState['participants'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item) || typeof item.email !== 'string') {
        return null;
      }

      const gender = sanitizeParticipantGender(item.gender);
      if (!gender) {
        return null;
      }

      return {
        email: item.email,
        gender
      };
    })
    .filter((item): item is MainEventState['participants'][number] => Boolean(item));
}

function sanitizeParticipantGender(value: unknown): UserGender | null {
  if (value === 'male' || value === 'female' || value === 'nonBinary' || value === 'other') {
    return value;
  }
  return null;
}

function sanitizeRealtimeState(
  value: unknown,
  fallback: RealtimeConnectionState
): RealtimeConnectionState {
  if (value === 'connecting' || value === 'connected' || value === 'disconnected') {
    return value;
  }
  return fallback;
}

function sanitizeMainEventConfig(
  value: unknown,
  fallback: MainEventConfig
): MainEventConfig {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    date: typeof value.date === 'string' ? value.date : fallback.date,
    title: typeof value.title === 'string' ? value.title : fallback.title,
    maxParticipants:
      typeof value.maxParticipants === 'number' && value.maxParticipants > 0
        ? Math.round(value.maxParticipants)
        : fallback.maxParticipants,
    maxPerGender:
      typeof value.maxPerGender === 'number' && value.maxPerGender > 0
        ? Math.round(value.maxPerGender)
        : fallback.maxPerGender
  };
}

function sanitizeMainEventInfo(value: unknown, fallback: MainEventInfo): MainEventInfo {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    venue: typeof value.venue === 'string' ? value.venue : fallback.venue,
    address: typeof value.address === 'string' ? value.address : fallback.address,
    timeLabel: typeof value.timeLabel === 'string' ? value.timeLabel : fallback.timeLabel,
    contribution: typeof value.contribution === 'string' ? value.contribution : fallback.contribution,
    contact: typeof value.contact === 'string' ? value.contact : fallback.contact,
    dressCode: typeof value.dressCode === 'string' ? value.dressCode : fallback.dressCode,
    description: typeof value.description === 'string' ? value.description : fallback.description,
    rules: Array.isArray(value.rules)
      ? value.rules.filter((rule): rule is string => typeof rule === 'string')
      : fallback.rules
  };
}

function sanitizeThreads(value: unknown): ChatThread[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((thread) => sanitizeThread(thread))
    .filter((thread): thread is ChatThread => Boolean(thread));
}

function sanitizeThread(value: unknown): ChatThread | null {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return null;
  }

  const messages = sanitizeMessages(value.messages);
  const unreadFromMessages = messages.filter((message) => !message.isMe && !message.readAt).length;

  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    name: value.name,
    avatar: typeof value.avatar === 'string' ? value.avatar : value.name.slice(0, 1).toUpperCase(),
    isOnline: typeof value.isOnline === 'boolean' ? value.isOnline : false,
    isTyping: typeof value.isTyping === 'boolean' ? value.isTyping : false,
    unreadCount:
      typeof value.unreadCount === 'number' && value.unreadCount >= 0
        ? Math.round(value.unreadCount)
        : unreadFromMessages,
    createdAt:
      typeof value.createdAt === 'string'
        ? value.createdAt
        : messages[0]?.createdAt ?? new Date().toISOString(),
    matchedAt: typeof value.matchedAt === 'string' ? value.matchedAt : undefined,
    lastSeenAt: typeof value.lastSeenAt === 'string' ? value.lastSeenAt : undefined,
    notificationsEnabled:
      typeof value.notificationsEnabled === 'boolean'
        ? value.notificationsEnabled
        : typeof value.muted === 'boolean'
          ? !value.muted
          : true,
    relationshipState: sanitizeRelationshipState(value.relationshipState),
    messages
  };
}

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((message) => sanitizeMessage(message))
    .filter((message): message is ChatMessage => Boolean(message));
}

function sanitizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === 'string'
      ? value.createdAt
      : typeof value.time === 'string'
        ? new Date().toISOString()
        : null;

  if (!createdAt) {
    return null;
  }

  const text = typeof value.text === 'string' ? value.text : '';
  const attachments = sanitizeAttachments(value.attachments);
  if (!text && attachments.length === 0) {
    return null;
  }

  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    text,
    isMe: typeof value.isMe === 'boolean' ? value.isMe : false,
    time: typeof value.time === 'string' ? value.time : '--:--',
    createdAt,
    senderName: typeof value.senderName === 'string' ? value.senderName : undefined,
    replyToMessageId:
      typeof value.replyToMessageId === 'string' ? value.replyToMessageId : undefined,
    attachments,
    readAt: typeof value.readAt === 'string' ? value.readAt : undefined,
    deliveryState: sanitizeDeliveryState(value.deliveryState)
  };
}

function sanitizeDeliveryState(value: unknown): ChatDeliveryState | undefined {
  if (value === 'sending' || value === 'sent' || value === 'delivered' || value === 'read') {
    return value;
  }
  return undefined;
}

function sanitizeRelationshipState(value: unknown): RelationshipState | undefined {
  if (
    value === 'none' ||
    value === 'liked' ||
    value === 'matched' ||
    value === 'archived' ||
    value === 'blocked'
  ) {
    return value;
  }

  return undefined;
}

function sanitizeAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((attachment): ChatAttachment | null => {
      if (!isRecord(attachment) || typeof attachment.dataUrl !== 'string') {
        return null;
      }

      return {
        id: typeof attachment.id === 'string' ? attachment.id : crypto.randomUUID(),
        type: sanitizeAttachmentType(attachment.type, attachment.mimeType),
        name: typeof attachment.name === 'string' ? attachment.name : 'attachment',
        mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType : 'application/octet-stream',
        sizeBytes: typeof attachment.sizeBytes === 'number' ? attachment.sizeBytes : 0,
        dataUrl: attachment.dataUrl,
        width: typeof attachment.width === 'number' ? attachment.width : undefined,
        height: typeof attachment.height === 'number' ? attachment.height : undefined,
        duration: typeof attachment.duration === 'number' ? attachment.duration : undefined
      };
    })
    .filter((attachment): attachment is ChatAttachment => Boolean(attachment));
}

function sanitizeAttachmentType(
  value: unknown,
  mimeType: unknown
): ChatAttachment['type'] {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'file') {
    return value;
  }

  if (typeof mimeType === 'string') {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    if (mimeType.startsWith('video/')) {
      return 'video';
    }
    if (mimeType.startsWith('audio/')) {
      return 'audio';
    }
  }

  return 'file';
}

function sanitizeNotifications(value: unknown): AppNotification[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const mapped: Array<AppNotification | null> = value
    .map((item) => {
      if (!isRecord(item) || typeof item.title !== 'string' || typeof item.body !== 'string') {
        return null;
      }

      const type: AppNotification['type'] =
        item.type === 'chat' ||
        item.type === 'match' ||
        item.type === 'event' ||
        item.type === 'system'
          ? item.type
          : 'system';

      return {
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        type,
        title: item.title,
        body: item.body,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        readAt: typeof item.readAt === 'string' ? item.readAt : undefined,
        threadId: typeof item.threadId === 'string' ? item.threadId : undefined
      };
    });

  return mapped.filter((item): item is AppNotification => item !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function persistState(value: PersistedAppState): void {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: PersistedStateEnvelope = {
    version: STORAGE_VERSION,
    state: value
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
