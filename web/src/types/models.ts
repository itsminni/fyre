export type ThemeMode = 'system' | 'light' | 'dark';

export type UserGender = 'male' | 'female' | 'nonBinary' | 'other';
export type UserOrientation =
  | 'straight'
  | 'gay'
  | 'lesbian'
  | 'bisexual'
  | 'pansexual'
  | 'other';
export type UserShowMe = 'men' | 'women' | 'everyone';
export type UserIntent = 'relationship' | 'casual' | 'friendship' | 'notSure';

export interface User {
  email: string;
  password: string;
  appwriteUserId?: string;
  avatarFileId?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  birthDate?: string;
  gender?: UserGender;
  orientation?: UserOrientation;
  preferredGenders?: UserGender[];
  minPreferredAge?: number;
  maxPreferredAge?: number;
  maxDistanceKm?: number;
  latitude?: number;
  longitude?: number;
  showMe: UserShowMe;
  smokes?: boolean;
  drinks?: boolean;
  bio?: string;
  intent?: UserIntent;
  hobbies?: string;
  passions?: string;
  lookingFor?: string;
  instagramTag?: string;
  spotifyTag?: string;
  favoriteSong?: string;
  favoriteMovie?: string;
  profileImageData?: string;
}

export interface DiscoverProfile {
  id: string;
  name: string;
  age: number;
  gender: UserGender;
  bio: string;
  imageUrl?: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  isMe: boolean;
  time: string;
}

export interface ChatThread {
  id: string;
  name: string;
  avatar: string;
  isOnline: boolean;
  messages: ChatMessage[];
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

export interface MainEventSnapshot {
  date: string;
  title: string;
  maxParticipants: number;
  maleCount: number;
  femaleCount: number;
  waitingListCount: number;
  totalCount: number;
  remainingMaleSlots: number;
  remainingFemaleSlots: number;
}

export interface AppSettings {
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  showAge: boolean;
  showDistance: boolean;
}

export interface PersistedAppState {
  users: User[];
  currentUserEmail: string | null;
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
  birthDate: string;
  gender: UserGender;
  orientation: UserOrientation;
  showMe: UserShowMe;
  smokes: boolean;
  drinks: boolean;
  hobbies: string;
  passions: string;
  lookingFor: string;
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
