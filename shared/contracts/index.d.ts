export type RelationshipStateContract = "none" | "liked" | "matched" | "archived" | "blocked";
export type UserGenderContract = "male" | "female" | "nonBinary" | "other";
export type MatchIntentContract =
  | "relationship"
  | "friendship"
  | "casual"
  | "notSure";
export type ChatMessageTypeContract = "text" | "image" | "video" | "audio" | "file";

export interface DiscoverProfileContract {
  id: string;
  name: string;
  age: number;
  gender?: UserGenderContract;
  city?: string;
  intent?: MatchIntentContract;
  bio: string;
  instagramTag?: string;
  spotifyTag?: string;
  imageUrl?: string;
  photos: string[];
  compatibilityScore?: number;
  distanceKm?: number;
  distance: number | null;
  commonInterests: string[];
  relationshipState: RelationshipStateContract;
}

export interface ChatMessageContract {
  messageId: string;
  text: string;
  messageType: ChatMessageTypeContract;
  attachmentFileId?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  attachmentSize?: number;
  attachmentWidth?: number;
  attachmentHeight?: number;
  attachmentDuration?: number;
  replyToMessageId?: string;
  createdAt: string;
}

export const RELATIONSHIP_STATES: RelationshipStateContract[];
export const USER_GENDERS: UserGenderContract[];
export const MATCH_INTENTS: MatchIntentContract[];
export const CHAT_MESSAGE_TYPES: ChatMessageTypeContract[];

export function normalizeRelationshipState(value: unknown): RelationshipStateContract;
export function normalizeUserGender(value: unknown): UserGenderContract | undefined;
export function normalizeMatchIntent(value: unknown): MatchIntentContract | undefined;
export function normalizeChatMessageType(value: unknown): ChatMessageTypeContract;
export function seededIntegerFromString(seed: unknown, min: number, max: number): number;
export function makeDiscoverProfileContract(input: unknown): DiscoverProfileContract | null;
export function parseDiscoverProfilesPayload(value: unknown): DiscoverProfileContract[];
export function makeChatMessageContract(input: unknown): ChatMessageContract | null;
export function parseChatMessageContract(input: unknown): ChatMessageContract | null;
