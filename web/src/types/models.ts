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
  intent?: MatchIntent;
  bio: string;
  imageUrl?: string;
  photos?: string[];
  compatibilityScore?: number;
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
  notificationsPollingEnabled: boolean;
  browserPushEnabled: boolean;
  showAge: boolean;
  showDistance: boolean;
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
  telegram: string;
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
