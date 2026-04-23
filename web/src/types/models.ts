export type ThemeMode = 'system' | 'light' | 'dark';
export type RealtimeConnectionState = 'connecting' | 'connected' | 'disconnected';
export type ChatAttachmentType = 'image' | 'video' | 'audio' | 'file';
export type ChatDeliveryState = 'sending' | 'sent' | 'delivered' | 'read';
export type NotificationType = 'chat' | 'match' | 'event' | 'system';
export type MatchIntent = 'relationship' | 'friendship' | 'casual' | 'networking' | 'notSure';
export type RelationshipState = 'none' | 'liked' | 'matched' | 'archived' | 'blocked';
export type ChatBackgroundStyle = 'sunset' | 'midnight' | 'aurora' | 'custom';
export type ChatBubblePalette = 'default' | 'sunset' | 'ocean' | 'graphite';

export type UserGender = 'male' | 'female' | 'nonBinary' | 'other';
export type UserOrientation =
  | 'straight'
  | 'gay'
  | 'lesbian'
  | 'bisexual'
  | 'pansexual'
  | 'other';
export type UserShowMe = 'men' | 'women' | 'everyone';

export interface User {
  email: string;
  password: string;
  appwriteUserId?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  cityLat?: number;
  cityLng?: number;
  latitude?: number;
  longitude?: number;
  birthDate?: string;
  gender?: UserGender;
  orientation?: UserOrientation;
  showMe: UserShowMe;
  preferredGenders?: UserGender[];
  smokes?: boolean;
  drinks?: boolean;
  bio?: string;
  minPreferredAge?: number;
  maxPreferredAge?: number;
  ageRangeMin?: number;
  ageRangeMax?: number;
  maxDistanceKm?: number;
  intent?: MatchIntent;
  hobbies?: string;
  passions?: string;
  lookingFor?: string;
  instagram?: string;
  instagramTag?: string;
  telegram?: string;
  spotifyTag?: string;
  website?: string;
  favoriteSong?: string;
  favoriteMovie?: string;
  avatarFileId?: string;
  profileImageData?: string;
}

export interface DiscoverProfile {
  id: string;
  name: string;
  age: number;
  gender?: UserGender;
  city?: string;
  distanceKm?: number;
  compatibilityScore?: number;
  intent?: MatchIntent;
  bio: string;
  imageUrl?: string;
  photos?: string[];
  commonInterests?: string[];
  relationshipState?: RelationshipState;
}

export interface ChatAttachment {
  id: string;
  type: ChatAttachmentType;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  isMe: boolean;
  time: string;
  createdAt: string;
  senderName?: string;
  replyToMessageId?: string;
  attachments?: ChatAttachment[];
  readAt?: string;
  deliveryState?: ChatDeliveryState;
}

export interface ChatThread {
  id: string;
  name: string;
  avatar: string;
  isOnline: boolean;
  isTyping?: boolean;
  unreadCount: number;
  createdAt: string;
  matchedAt?: string;
  lastSeenAt?: string;
  relationshipState?: RelationshipState;
  messages: ChatMessage[];
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
  threadId?: string;
}

export interface EventParticipant {
  email: string;
  gender: UserGender;
}

export type EventHistoryStatus = 'confirmed' | 'waitlisted' | 'cancelled' | 'promoted';

export interface EventHistoryItem {
  id: string;
  email: string;
  eventTitle: string;
  eventDate: string;
  status: EventHistoryStatus;
  timestamp: string;
}

export interface MainEventState {
  participants: EventParticipant[];
  waitingList: EventParticipant[];
  history: EventHistoryItem[];
}

export interface MainEventConfig {
  date: string;
  title: string;
  maxParticipants: number;
  maxPerGender: number;
}

export interface MainEventInfo {
  venue: string;
  address: string;
  timeLabel: string;
  contribution: string;
  contact: string;
  dressCode: string;
  description: string;
  rules: string[];
}

export interface MainEventSnapshot {
  date: string;
  title: string;
  maxParticipants: number;
  maleLimit: number;
  femaleLimit: number;
  maleCount: number;
  femaleCount: number;
  waitingListCount: number;
  totalCount: number;
  remainingMaleSlots: number;
  remainingFemaleSlots: number;
}

export type EventAdminMutableStatus = 'confirmed' | 'waitlisted' | 'promoted';

export interface EventAdminParticipant {
  registrationId: string;
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  gender?: UserGender;
  status: EventHistoryStatus;
  createdAt?: string;
}

export interface EventAdminState {
  eventId: string;
  title: string;
  startsAt: string;
  maxParticipants: number;
  maleLimit: number;
  femaleLimit: number;
  registrationClosesAt: string | null;
  cancellationClosesAt: string | null;
  adminUserIds: string;
  adminEmails: string;
  participants: EventAdminParticipant[];
}

export interface EventAdminDraftInput {
  title: string;
  startsAt: string;
  maxParticipants: number;
  maleLimit: number;
  femaleLimit: number;
  registrationClosesAt: string | null;
  cancellationClosesAt: string | null;
  adminUserIds: string;
  adminEmails: string;
}

export interface AppSettings {
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  matchNotificationsEnabled: boolean;
  messageNotificationsEnabled: boolean;
  eventReminderNotificationsEnabled: boolean;
  notificationsPollingEnabled: boolean;
  browserPushEnabled: boolean;
  showAge: boolean;
  showDistance: boolean;
  showIntent: boolean;
  showInterests: boolean;
  showInstagramTag: boolean;
  showSpotifyTag: boolean;
  chatBackgroundStyle: ChatBackgroundStyle;
  chatBackgroundBrightness: number;
  chatBackgroundColor1: string;
  chatBackgroundColor2: string;
  chatBackgroundColor3: string;
  outgoingBubblePalette: ChatBubblePalette;
  incomingBubblePalette: ChatBubblePalette;
  sendButtonColor1: string;
  sendButtonColor2: string;
  sendButtonColor3: string;
}

export interface PersistedAppState {
  users: User[];
  currentUserEmail: string | null;
  realtimeState: RealtimeConnectionState;
  notifications: AppNotification[];
  mainEventConfig: MainEventConfig;
  mainEventInfo: MainEventInfo;
  mainEventState: MainEventState;
  threads: ChatThread[];
  settings: AppSettings;
}

export interface LocalUserSummary {
  email: string;
  displayName: string;
  isProfileComplete: boolean;
  isCurrent: boolean;
}

export interface ProfileUpdateInput {
  firstName: string;
  lastName: string;
  city: string;
  cityLat?: number;
  cityLng?: number;
  birthDate: string;
  gender: UserGender;
  orientation: UserOrientation;
  showMe: UserShowMe;
  preferredGenders: UserGender[];
  smokes: boolean;
  drinks: boolean;
  bio: string;
  ageRangeMin: number;
  ageRangeMax: number;
  maxDistanceKm: number;
  intent: MatchIntent;
  hobbies: string;
  passions: string;
  lookingFor: string;
  instagram: string;
  instagramTag: string;
  telegram: string;
  spotifyTag: string;
  website: string;
  favoriteSong: string;
  favoriteMovie: string;
}

export const GENDER_OPTIONS: UserGender[] = ['male', 'female', 'nonBinary', 'other'];
export const ORIENTATION_OPTIONS: UserOrientation[] = [
  'straight',
  'gay',
  'lesbian',
  'bisexual',
  'pansexual',
  'other'
];
export const SHOW_ME_OPTIONS: UserShowMe[] = ['men', 'women', 'everyone'];

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isUserGender(value: unknown): value is UserGender {
  return value === 'male' || value === 'female' || value === 'nonBinary' || value === 'other';
}

export function preferredGendersFromShowMe(
  showMe: UserShowMe,
  preferredGenders?: UserGender[]
): UserGender[] {
  const sanitizedPreferredGenders = Array.isArray(preferredGenders)
    ? preferredGenders.filter((gender): gender is UserGender => isUserGender(gender))
    : [];

  if (sanitizedPreferredGenders.length > 0) {
    return sanitizedPreferredGenders;
  }

  switch (showMe) {
    case 'men':
      return ['male'];
    case 'women':
      return ['female'];
    default:
      return [...GENDER_OPTIONS];
  }
}

export function showMeFromPreferredGenders(preferredGenders?: UserGender[]): UserShowMe {
  const sanitizedPreferredGenders = Array.isArray(preferredGenders)
    ? preferredGenders.filter((gender): gender is UserGender => isUserGender(gender))
    : [];

  if (sanitizedPreferredGenders.length === 1 && sanitizedPreferredGenders[0] === 'male') {
    return 'men';
  }

  if (sanitizedPreferredGenders.length === 1 && sanitizedPreferredGenders[0] === 'female') {
    return 'women';
  }

  return 'everyone';
}

export function createEmptyUser(email: string, password: string): User {
  return {
    email: normalizeEmail(email),
    password,
    showMe: 'everyone',
    preferredGenders: preferredGendersFromShowMe('everyone')
  };
}

export function normalizeUser(user: Pick<User, 'email' | 'password'> & Partial<User>): User {
  const preferredGenders = preferredGendersFromShowMe(
    user.showMe ?? showMeFromPreferredGenders(user.preferredGenders),
    user.preferredGenders
  );
  const showMe = showMeFromPreferredGenders(preferredGenders);
  const instagramTag = trimOptionalString(user.instagramTag ?? user.favoriteMovie);
  const spotifyTag = trimOptionalString(user.spotifyTag ?? user.favoriteSong);
  const favoriteMovie = trimOptionalString(user.favoriteMovie ?? instagramTag);
  const favoriteSong = trimOptionalString(user.favoriteSong ?? spotifyTag);
  const cityLat = pickNumber(user.cityLat, user.latitude);
  const cityLng = pickNumber(user.cityLng, user.longitude);
  const ageRangeMin = pickInteger(user.ageRangeMin, user.minPreferredAge);
  const ageRangeMax = pickInteger(user.ageRangeMax, user.maxPreferredAge);

  return {
    ...user,
    email: normalizeEmail(user.email),
    password: user.password,
    firstName: trimOptionalString(user.firstName),
    lastName: trimOptionalString(user.lastName),
    city: trimOptionalString(user.city),
    birthDate: trimOptionalString(user.birthDate),
    bio: trimOptionalString(user.bio),
    hobbies: trimOptionalString(user.hobbies),
    passions: trimOptionalString(user.passions),
    lookingFor: trimOptionalString(user.lookingFor),
    instagram: trimOptionalString(user.instagram),
    instagramTag,
    telegram: trimOptionalString(user.telegram),
    spotifyTag,
    website: trimOptionalString(user.website),
    favoriteSong,
    favoriteMovie,
    showMe,
    preferredGenders,
    cityLat,
    cityLng,
    latitude: pickNumber(user.latitude, cityLat),
    longitude: pickNumber(user.longitude, cityLng),
    ageRangeMin,
    ageRangeMax,
    minPreferredAge: ageRangeMin,
    maxPreferredAge: ageRangeMax
  };
}

export function calculateAge(birthDate: string): number {
  if (!birthDate) {
    return 0;
  }
  const now = new Date();
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) {
    return 0;
  }

  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function getDisplayName(user: User): string {
  const fullName = [user.firstName, user.lastName]
    .filter((part) => Boolean(part?.trim()))
    .join(' ')
    .trim();

  return fullName || user.email;
}

export function isProfileComplete(user: User): boolean {
  const requiredTextFields = [
    user.firstName,
    user.lastName,
    user.hobbies,
    user.passions,
    user.lookingFor,
    user.favoriteSong,
    user.favoriteMovie
  ];

  return (
    requiredTextFields.every((value) => Boolean(value?.trim())) &&
    calculateAge(user.birthDate ?? '') >= 18 &&
    Boolean(user.gender) &&
    Boolean(user.orientation) &&
    typeof user.smokes === 'boolean' &&
    typeof user.drinks === 'boolean'
  );
}

export function audienceMatches(showMe: UserShowMe, gender: UserGender): boolean {
  if (showMe === 'everyone') {
    return true;
  }
  if (showMe === 'men') {
    return gender === 'male';
  }
  return gender === 'female';
}

export function preferredGenderMatches(
  preferredGenders: UserGender[] | undefined,
  showMe: UserShowMe,
  gender: UserGender | undefined
): boolean {
  if (!gender) {
    return true;
  }

  if (Array.isArray(preferredGenders) && preferredGenders.length > 0) {
    return preferredGenders.includes(gender);
  }

  return audienceMatches(showMe, gender);
}

export function inferShowMeFromPreferredGenders(
  preferredGenders: UserGender[] | undefined,
  fallback: UserShowMe = 'everyone'
): UserShowMe {
  if (!preferredGenders || preferredGenders.length === 0) {
    return fallback;
  }

  if (preferredGenders.length === 1 && preferredGenders[0] === 'male') {
    return 'men';
  }

  if (preferredGenders.length === 1 && preferredGenders[0] === 'female') {
    return 'women';
  }

  return 'everyone';
}

function trimOptionalString(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickNumber(...values: Array<number | null | undefined>): number | undefined {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function pickInteger(...values: Array<number | null | undefined>): number | undefined {
  const value = values.find(
    (candidate): candidate is number => typeof candidate === 'number' && Number.isFinite(candidate)
  );
  return typeof value === 'number' ? Math.round(value) : undefined;
}
