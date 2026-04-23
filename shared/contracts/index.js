export const RELATIONSHIP_STATES = ["none", "liked", "matched", "archived", "blocked"];
export const USER_GENDERS = ["male", "female", "nonBinary", "other"];
export const MATCH_INTENTS = ["relationship", "friendship", "casual", "networking", "notSure"];
export const CHAT_MESSAGE_TYPES = ["text", "image", "video", "audio", "file"];

export function normalizeRelationshipState(value) {
  const normalized = asString(value);
  return RELATIONSHIP_STATES.includes(normalized) ? normalized : "none";
}

export function normalizeUserGender(value) {
  switch (normalizedToken(value)) {
    case "male":
      return "male";
    case "female":
      return "female";
    case "nonbinary":
      return "nonBinary";
    case "other":
      return "other";
    default:
      return undefined;
  }
}

export function normalizeMatchIntent(value) {
  const normalized = asString(value);
  return MATCH_INTENTS.includes(normalized) ? normalized : undefined;
}

export function normalizeChatMessageType(value) {
  const normalized = asString(value);
  return CHAT_MESSAGE_TYPES.includes(normalized) ? normalized : "text";
}

export function seededIntegerFromString(seed, min, max) {
  const minimum = Number.isFinite(min) ? Math.trunc(min) : 0;
  const maximum = Number.isFinite(max) ? Math.trunc(max) : minimum;

  if (maximum <= minimum) {
    return minimum;
  }

  let hash = 0;
  const normalizedSeed = `${seed ?? ""}`;
  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash = (hash * 31 + normalizedSeed.charCodeAt(index)) >>> 0;
  }

  return minimum + (hash % (maximum - minimum + 1));
}

export function makeDiscoverProfileContract(input) {
  if (!isRecord(input)) {
    return null;
  }

  const id = asString(input.id);
  const name = asString(input.name);
  if (!id || !name) {
    return null;
  }

  const photos = toStringArray(input.photos);
  const distanceKm = normalizeNullableInteger(input.distanceKm ?? input.distance);
  const compatibilityScore = normalizeNullableInteger(input.compatibilityScore);
  const imageUrl = asString(input.imageUrl) ?? photos[0];
  const bio = asString(input.bio) ?? "Profilo Fyre";

  return {
    id,
    name,
    age: Math.max(18, normalizeNullableInteger(input.age) ?? 18),
    gender: normalizeUserGender(input.gender),
    city: asString(input.city) ?? undefined,
    intent: normalizeMatchIntent(input.intent),
    bio,
    imageUrl: imageUrl ?? undefined,
    photos,
    compatibilityScore: compatibilityScore ?? undefined,
    distanceKm: distanceKm ?? undefined,
    distance: distanceKm,
    commonInterests: toStringArray(input.commonInterests),
    relationshipState: normalizeRelationshipState(input.relationshipState)
  };
}

export function parseDiscoverProfilesPayload(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => makeDiscoverProfileContract(item))
    .filter((item) => item !== null);
}

export function makeChatMessageContract(input) {
  if (!isRecord(input)) {
    return null;
  }

  const messageId = asString(input.messageId ?? input.id);
  if (!messageId) {
    return null;
  }

  const createdAt = normalizeIsoDate(input.createdAt);
  if (!createdAt) {
    return null;
  }

  return {
    messageId,
    text: asString(input.text) ?? "",
    messageType: normalizeChatMessageType(input.messageType),
    attachmentFileId: asString(input.attachmentFileId) ?? undefined,
    attachmentName: asString(input.attachmentName) ?? undefined,
    attachmentMimeType: asString(input.attachmentMimeType) ?? undefined,
    attachmentSize: normalizeNullableInteger(input.attachmentSize) ?? undefined,
    attachmentWidth: normalizeNullableInteger(input.attachmentWidth) ?? undefined,
    attachmentHeight: normalizeNullableInteger(input.attachmentHeight) ?? undefined,
    attachmentDuration: normalizeNullableInteger(input.attachmentDuration) ?? undefined,
    replyToMessageId: asString(input.replyToMessageId) ?? undefined,
    createdAt
  };
}

export function parseChatMessageContract(input) {
  return makeChatMessageContract(input);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => asString(item))
        .filter((item) => item !== null)
    )
  );
}

function normalizeNullableInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function normalizeIsoDate(value) {
  const normalized = asString(value);
  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function normalizedToken(value) {
  const normalized = asString(value);
  return normalized ? normalized.replace(/[\s_-]/g, "").toLowerCase() : null;
}
