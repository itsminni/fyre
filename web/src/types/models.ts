export type ThemeMode = 'system' | 'light' | 'dark';
export type AppLanguage = 'it' | 'en';
export type RealtimeConnectionState = 'connecting' | 'connected' | 'disconnected';
export type ChatAttachmentType = 'image' | 'video' | 'audio' | 'file';
export type ChatDeliveryState = 'sending' | 'sent' | 'delivered' | 'read';
export type NotificationType = 'chat' | 'match' | 'event' | 'system';
export type MatchIntent = 'relationship' | 'friendship' | 'casual' | 'notSure';
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

export interface User {
  email: string;
  appwriteUserId?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  birthDate?: string;
  gender?: UserGender;
  orientation?: UserOrientation;
  preferredGenders?: UserGender[];
  smokes?: boolean;
  drinks?: boolean;
  excludeSmokers?: boolean;
  excludeDrinkers?: boolean;
  bio?: string;
  minPreferredAge?: number;
  maxPreferredAge?: number;
  maxDistanceKm?: number;
  intent?: MatchIntent;
  interests?: string;
  instagramTag?: string;
  spotifyTag?: string;
  avatarFileId?: string;
  photoFileIds?: string[];
  profileImageData?: string;
  profilePhotoDataItems?: string[];
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
  instagramTag?: string;
  spotifyTag?: string;
  relationshipState?: RelationshipState;
}

export interface ChatAttachment {
  id: string;
  type: ChatAttachmentType;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  width?: number;
  height?: number;
  duration?: number;
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
  notificationsEnabled: boolean;
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

export type EventHistoryStatus = 'confirmed' | 'waitlisted' | 'cancelled' | 'promoted';

export interface EventHistoryItem {
  id: string;
  email: string;
  eventTitle: string;
  eventDate: string;
  status: EventHistoryStatus;
  timestamp: string;
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
  registrationClosesAt: string | null;
  cancellationClosesAt: string | null;
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
export type EventPublicationStatus = 'active' | 'draft' | 'cancelled' | 'completed' | 'archived';

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
  status: EventPublicationStatus;
  title: string;
  place: string;
  description: string;
  rules: string[];
  startsAt: string;
  maxParticipants: number;
  maleLimit: number;
  femaleLimit: number;
  registrationClosesAt: string | null;
  cancellationClosesAt: string | null;
  participants: EventAdminParticipant[];
}

export interface EventAdminDraftInput {
  status: EventPublicationStatus;
  title: string;
  place: string;
  description: string;
  rules: string[];
  startsAt: string;
  maxParticipants: number;
  maleLimit: number;
  femaleLimit: number;
  registrationClosesAt: string | null;
  cancellationClosesAt: string | null;
}

export interface AppSettings {
  language: AppLanguage;
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
  latitude?: number;
  longitude?: number;
  birthDate: string;
  gender: UserGender;
  orientation: UserOrientation;
  preferredGenders: UserGender[];
  smokes: boolean;
  drinks: boolean;
  excludeSmokers: boolean;
  excludeDrinkers: boolean;
  bio: string;
  minPreferredAge: number;
  maxPreferredAge: number;
  maxDistanceKm?: number;
  intent: MatchIntent;
  interests: string;
  instagramTag: string;
  spotifyTag: string;
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

export function normalizeUser(user: Pick<User, 'email'> & Partial<User>): User {
  const preferredGenders = Array.isArray(user.preferredGenders)
    ? user.preferredGenders.filter((gender): gender is UserGender => isUserGender(gender))
    : [];
  const instagramTag = trimOptionalString(user.instagramTag);
  const spotifyTag = trimOptionalString(user.spotifyTag);

  return {
    email: normalizeEmail(user.email),
    appwriteUserId: user.appwriteUserId,
    firstName: trimOptionalString(user.firstName),
    lastName: trimOptionalString(user.lastName),
    city: trimOptionalString(user.city),
    latitude: pickNumber(user.latitude),
    longitude: pickNumber(user.longitude),
    birthDate: trimOptionalString(user.birthDate),
    gender: user.gender,
    orientation: user.orientation,
    preferredGenders,
    smokes: user.smokes,
    drinks: user.drinks,
    excludeSmokers: typeof user.excludeSmokers === 'boolean' ? user.excludeSmokers : undefined,
    excludeDrinkers: typeof user.excludeDrinkers === 'boolean' ? user.excludeDrinkers : undefined,
    bio: trimOptionalString(user.bio),
    minPreferredAge: pickInteger(user.minPreferredAge),
    maxPreferredAge: pickInteger(user.maxPreferredAge),
    maxDistanceKm: user.maxDistanceKm,
    intent: user.intent,
    interests: trimOptionalString(user.interests),
    instagramTag,
    spotifyTag,
    avatarFileId: user.avatarFileId,
    photoFileIds: Array.isArray(user.photoFileIds)
      ? user.photoFileIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined,
    profileImageData: user.profileImageData,
    profilePhotoDataItems: Array.isArray(user.profilePhotoDataItems)
      ? user.profilePhotoDataItems.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined
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
    user.city,
    user.bio
  ];

  return (
    requiredTextFields.every((value) => Boolean(value?.trim())) &&
    calculateAge(user.birthDate ?? '') >= 18 &&
    Boolean(user.gender) &&
    Boolean(user.orientation) &&
    Array.isArray(user.preferredGenders) &&
    user.preferredGenders.length > 0
  );
}

export function preferredGenderMatches(
  preferredGenders: UserGender[] | undefined,
  gender: UserGender | undefined
): boolean {
  if (!gender) {
    return true;
  }

  if (Array.isArray(preferredGenders) && preferredGenders.length > 0) {
    return preferredGenders.includes(gender);
  }

  return true;
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
