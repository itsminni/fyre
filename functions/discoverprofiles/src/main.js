import {
  makeDiscoverProfileContract,
  seededIntegerFromString
} from "./contracts.js";

const MAX_RESULTS = 40;
const DEFAULT_MIN_AGE = 18;
const DEFAULT_MAX_AGE = 35;
const RECENT_PRESENCE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SHARED_INTERESTS = 4;
const MIN_COMPATIBILITY_SCORE = 24;
const MAX_COMPATIBILITY_SCORE = 96;
const AVATAR_TOKEN_CACHE_LIMIT = 256;
const AVATAR_TOKEN_CACHE_SAFETY_MS = 30_000;
const AVATAR_TOKEN_ISSUE_CONCURRENCY = 4;
const PROFILE_SCAN_PAGE_SIZE = 100;
const MAX_PROFILE_SCAN_ROWS = 400;
const EXCLUSION_QUERY_CHUNK_SIZE = 100;
const APPWRITE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;
const avatarTokenCache = new Map();

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);
    const currentProfile = await fetchProfile(config, currentUserId);

    if (!currentProfile || asString(currentProfile.userId) !== currentUserId) {
      console.log(JSON.stringify({ event: "discoverprofiles.complete", profileCount: 0 }));
      return res.json({ profiles: [], nextCursor: null }, 200);
    }

    const currentUserContext = makeUserContext(currentProfile);
    const profileCursor = optionalCursor(body.profileCursor);
    const profileQueries =
      currentUserContext.preferredGenders.length > 0 && currentUserContext.preferredGenders.length < 4
        ? [equal("gender", currentUserContext.preferredGenders.map(storedGenderValue))]
        : [];
    const profileWindow = await listRowsWindow(
      config,
      config.profilesTableId,
      profileQueries,
      profileCursor,
      MAX_PROFILE_SCAN_ROWS,
      PROFILE_SCAN_PAGE_SIZE
    );
    const profiles = profileWindow.rows;
    const candidateUserIds = Array.from(new Set(
      profiles
        .map((row) => appwriteIdentifier(row.userId))
        .filter((userId) => userId && userId !== currentUserId)
    ));
    const [swipes, relationships] = await Promise.all([
      listRowsByExactValues(
        config,
        config.swipesTableId,
        "swipeKey",
        candidateUserIds.map((userId) => `${currentUserId}:${userId}`)
      ),
      listRowsByExactValues(
        config,
        config.relationshipsTableId,
        "pairKey",
        candidateUserIds.map((userId) => [currentUserId, userId].sort().join(":"))
      )
    ]);
    const excludedUserIds = buildExcludedUserIds(currentUserId, swipes, relationships);

    const selectedEntries = profiles
      .map((row) => buildCandidateEntry(row, currentUserId, currentUserContext, excludedUserIds))
      .filter(Boolean)
      .map((entry) => ({
        ...entry,
        score: candidateScore(entry.row, entry.candidate, currentUserContext, entry.distanceKm)
      }))
      .sort((lhs, rhs) => {
        if (rhs.score !== lhs.score) {
          return rhs.score - lhs.score;
        }

        const lhsDistance = lhs.distanceKm ?? Number.POSITIVE_INFINITY;
        const rhsDistance = rhs.distanceKm ?? Number.POSITIVE_INFINITY;
        if (lhsDistance !== rhsDistance) {
          return lhsDistance - rhsDistance;
        }

        const lhsPresence = timestampValue(lhs.row.presenceUpdatedAt);
        const rhsPresence = timestampValue(rhs.row.presenceUpdatedAt);
        return rhsPresence - lhsPresence;
      })
      .slice(0, MAX_RESULTS);
    const discoverProfiles = (await mapWithConcurrency(
      selectedEntries,
      AVATAR_TOKEN_ISSUE_CONCURRENCY,
      ({ row, candidate, distanceKm, score }) => projectDiscoverProfile(
        config,
        row,
        candidate,
        currentUserContext,
        distanceKm,
        score,
        relationshipStateForPair(currentUserId, asString(row.userId), relationships)
      )
    ))
      .filter(Boolean);

    console.log(JSON.stringify({
      event: "discoverprofiles.complete",
      profileCount: discoverProfiles.length,
      scannedProfileCount: profiles.length,
      hasNextPage: profileWindow.nextCursor !== null
    }));
    return res.json({ profiles: discoverProfiles, nextCursor: profileWindow.nextCursor }, 200);
  } catch (err) {
    error(`discoverprofiles failed (${err?.statusCode ?? 500})`);
    const message = err?.statusCode === 401
      ? "Unauthorized"
      : err?.statusCode === 403
        ? "Forbidden"
        : "Unable to fetch discover profiles";
    return res.json({ message }, err?.statusCode ?? 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredIdentifierEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
    databaseId: requiredIdentifierEnv("APPWRITE_DATABASE_ID"),
    profilesTableId: requiredIdentifierEnv("APPWRITE_PROFILES_TABLE_ID"),
    swipesTableId: requiredIdentifierEnv("APPWRITE_SWIPES_TABLE_ID"),
    relationshipsTableId: requiredIdentifierEnv("APPWRITE_RELATIONSHIPS_TABLE_ID"),
    avatarsBucketId: requiredIdentifierEnv("APPWRITE_AVATARS_BUCKET_ID"),
    avatarTokenTtlSeconds: requiredIntegerEnv("APPWRITE_AVATAR_TOKEN_TTL_SECONDS", 300, 900)
  };
}

function buildExcludedUserIds(currentUserId, swipes, relationships) {
  const excludedUserIds = new Set();

  for (const swipe of swipes) {
    if (typeof swipe.toUserId === "string" && swipe.toUserId.length > 0) {
      excludedUserIds.add(swipe.toUserId);
    }
  }

  for (const relationship of relationships) {
    const relatedUserId = otherUserIdFromRelationship(relationship, currentUserId);
    if (!relatedUserId) {
      continue;
    }

    const state = relationshipStateForUser(relationship, currentUserId);
    const relatedState = relationshipStateForUser(relationship, relatedUserId);
    if (
      state === "archived"
      || state === "blocked"
      || state === "liked"
      || state === "matched"
      || relatedState === "blocked"
    ) {
      excludedUserIds.add(relatedUserId);
    }
  }

  return excludedUserIds;
}

export function buildCandidateEntry(row, currentUserId, currentUser, excludedUserIds) {
  const candidateUserId = appwriteIdentifier(row.userId);
  if (!candidateUserId || candidateUserId === currentUserId || excludedUserIds.has(candidateUserId)) {
    return null;
  }

  if (!isProfileReady(row)) {
    return null;
  }

  const candidate = makeUserContext(row);
  if (!candidate.gender || candidate.age < 18) {
    return null;
  }

  if (!currentUser.preferredGenders.includes(candidate.gender)) {
    return null;
  }

  if (candidate.preferredGenders.length > 0 && currentUser.gender && !candidate.preferredGenders.includes(currentUser.gender)) {
    return null;
  }

  if (candidate.age < currentUser.minAge || candidate.age > currentUser.maxAge) {
    return null;
  }

  if (currentUser.age < candidate.minAge || currentUser.age > candidate.maxAge) {
    return null;
  }

  if (currentUser.excludeSmokers && candidate.smokes === true) {
    return null;
  }

  if (currentUser.excludeDrinkers && candidate.drinks === true) {
    return null;
  }

  if (candidate.excludeSmokers && currentUser.smokes === true) {
    return null;
  }

  if (candidate.excludeDrinkers && currentUser.drinks === true) {
    return null;
  }

  const distanceKm = distanceKmBetween(currentUser, candidate);
  if (distanceKm != null && Number.isFinite(currentUser.maxDistanceKm) && distanceKm > currentUser.maxDistanceKm) {
    return null;
  }

  if (distanceKm != null && Number.isFinite(candidate.maxDistanceKm) && distanceKm > candidate.maxDistanceKm) {
    return null;
  }

  return { row, candidate, distanceKm };
}

function candidateScore(row, candidate, currentUser, distanceKm) {
  const deterministicScore =
    10
    + interestCompatibilityScore(currentUser.interests, candidate.interests)
    + intentCompatibilityScore(currentUser.intent, candidate.intent)
    + distanceCompatibilityScore(distanceKm, currentUser.maxDistanceKm, candidate.maxDistanceKm)
    + ageCompatibilityScore(currentUser, candidate)
    + lifestyleCompatibilityScore(currentUser, candidate)
    + profileCompletenessScore(row)
    + (isRecentlyActive(row.presenceUpdatedAt) ? 3 : 0);
  const rankingVariation = seededIntegerFromString(
    `${asString(row.userId) ?? "candidate"}:${currentUser.gender ?? "unknown"}:${currentUser.city ?? "unknown"}`,
    -2,
    2
  );

  return clamp(
    Math.round(deterministicScore + rankingVariation),
    MIN_COMPATIBILITY_SCORE,
    MAX_COMPATIBILITY_SCORE
  );
}

async function projectDiscoverProfile(config, row, candidate, currentUser, distanceKm, score, relationshipState) {
  const commonInterests = candidate.interests.filter((interest) => currentUser.interests.includes(interest));
  const photos = await discoverPhotoURLs(config, row);

  return makeDiscoverProfileContract({
    id: row.userId,
    name: discoverName(row),
    age: candidate.age,
    gender: candidate.gender,
    city: asString(row.city),
    intent: candidate.intent,
    bio: discoverBio(row, commonInterests),
    instagramTag: normalizeSocialTag(row.instagramTag),
    spotifyTag: normalizeSocialTag(row.spotifyTag),
    imageUrl: photos[0] ?? null,
    photos,
    compatibilityScore: clamp(score, MIN_COMPATIBILITY_SCORE, MAX_COMPATIBILITY_SCORE),
    distanceKm: roundedDistance(distanceKm),
    distance: roundedDistance(distanceKm),
    commonInterests: commonInterests.slice(0, MAX_SHARED_INTERESTS),
    relationshipState
  });
}

export function makeUserContext(row) {
  const gender = normalizeGender(row.gender);
  return {
    gender,
    age: ageFromBirthDate(row.birthDate),
    city: normalizeCity(row.city),
    intent: normalizeIntent(row.intent),
    interests: interestTokens(row.interests),
    preferredGenders: parsePreferredGenders(row.preferredGenders),
    minAge: normalizeAge(row.minPreferredAge, DEFAULT_MIN_AGE),
    maxAge: normalizeMaxAge(row.maxPreferredAge, row.minPreferredAge),
    maxDistanceKm: normalizeDistanceKm(row.maxDistanceKm),
    latitude: numberValue(row.latitude),
    longitude: numberValue(row.longitude),
    smokes: asNullableBool(row.smokes),
    drinks: asNullableBool(row.drinks),
    excludeSmokers: asBool(row.excludeSmokers),
    excludeDrinkers: asBool(row.excludeDrinkers)
  };
}

export function isProfileReady(row) {
  return Boolean(
    asString(row.firstName)
    && normalizeCity(row.city)
    && normalizeGender(row.gender)
    && ageFromBirthDate(row.birthDate) >= 18
    && normalizeOrientation(row.orientation)
    && firstNonEmpty([row.bio])
    && parsePreferredGenders(row.preferredGenders).length > 0
  );
}

async function fetchProfile(config, userId) {
  try {
    return await request(config, "GET", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(config.profilesTableId)}/rows/${pathSegment(userId)}`);
  } catch (err) {
    const rows = await listRows(config, config.profilesTableId, [
      equal("userId", [userId]),
      limit(1)
    ]);
    return rows[0] ?? null;
  }
}

function normalizeGender(value) {
  switch (asString(value)?.replace(/[\s_-]/g, "").toLowerCase()) {
    case "male":
      return "male";
    case "female":
      return "female";
    case "nonbinary":
      return "nonbinary";
    case "other":
      return "other";
    default:
      return null;
  }
}

function normalizeOrientation(value) {
  switch (asString(value)) {
    case "straight":
    case "gay":
    case "lesbian":
    case "bisexual":
    case "pansexual":
    case "other":
      return value.trim();
    default:
      return null;
  }
}

function storedGenderValue(value) {
  return value === "nonbinary" ? "nonBinary" : value;
}

function normalizeIntent(value) {
  switch (asString(value)) {
    case "relationship":
    case "casual":
    case "friendship":
    case "notSure":
      return value.trim();
    default:
      return null;
  }
}

function parsePreferredGenders(rawValue) {
  const explicit = Array.isArray(rawValue)
    ? rawValue.map((item) => normalizeGender(item)).filter(Boolean)
    : [];

  return explicit?.length ? Array.from(new Set(explicit)) : [];
}

function interestTokens(rawValue) {
  const value = asString(rawValue);
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(/[,|\n]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function ageFromBirthDate(value) {
  const normalized = asString(value);
  if (!normalized) {
    return 0;
  }

  const birthDate = new Date(normalized);
  if (Number.isNaN(birthDate.getTime())) {
    return 0;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = now.getUTCDate() - birthDate.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

function normalizeAge(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(DEFAULT_MIN_AGE, Math.min(98, Math.trunc(numeric)));
}

function normalizeMaxAge(value, minValue) {
  const minAge = normalizeAge(minValue, DEFAULT_MIN_AGE);
  const fallbackMax = Math.max(minAge + 1, DEFAULT_MAX_AGE);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(99, fallbackMax);
  }
  return Math.max(Math.max(minAge + 1, 19), Math.min(99, Math.trunc(numeric)));
}

function normalizeDistanceKm(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric <= 0) {
    return null;
  }
  return Math.min(999, Math.max(5, Math.trunc(numeric)));
}

function normalizeCity(value) {
  const city = asString(value);
  return city ? city.toLowerCase() : null;
}

function normalizeSocialTag(value) {
  const rawValue = asString(value);
  if (!rawValue) {
    return null;
  }

  const withoutAtPrefix = rawValue.replace(/^@+/, "");
  const withoutWhitespace = withoutAtPrefix.replace(/\s+/g, "");
  const sanitized = withoutWhitespace.replace(/@/g, "").trim();

  if (!sanitized) {
    return null;
  }

  return sanitized.slice(0, 64);
}

function interestCompatibilityScore(currentInterests, candidateInterests) {
  if (currentInterests.length === 0 && candidateInterests.length === 0) {
    return 6;
  }

  if (currentInterests.length === 0 || candidateInterests.length === 0) {
    return 3;
  }

  const currentSet = new Set(currentInterests);
  const sharedCount = candidateInterests.filter((interest) => currentSet.has(interest)).length;
  const unionCount = new Set([...currentInterests, ...candidateInterests]).size;
  const sharedDepth = Math.min(sharedCount / MAX_SHARED_INTERESTS, 1);
  const overlapRatio = unionCount > 0 ? sharedCount / unionCount : 0;

  return Math.round((sharedDepth * 18) + (overlapRatio * 8));
}

function intentCompatibilityScore(currentIntent, candidateIntent) {
  if (!currentIntent || !candidateIntent) {
    return 5;
  }

  if (currentIntent === candidateIntent) {
    return 16;
  }

  const pairKey = [currentIntent, candidateIntent].sort().join(":");
  const compatibilityByPair = {
    "casual:notSure": 10,
    "friendship:notSure": 9,
    "notSure:relationship": 9,
    "friendship:relationship": 7,
    "casual:friendship": 6,
    "casual:relationship": 2
  };

  return compatibilityByPair[pairKey] ?? 4;
}

function ageCompatibilityScore(currentUser, candidate) {
  return Math.round(
    (ageRangeFitScore(candidate.age, currentUser.minAge, currentUser.maxAge) * 7)
    + (ageRangeFitScore(currentUser.age, candidate.minAge, candidate.maxAge) * 7)
  );
}

function ageRangeFitScore(age, minAge, maxAge) {
  if (!Number.isFinite(age) || !Number.isFinite(minAge) || !Number.isFinite(maxAge)) {
    return 0.5;
  }

  const range = Math.max(maxAge - minAge, 1);
  const midpoint = minAge + (range / 2);
  const distanceFromMidpoint = Math.abs(age - midpoint);
  const normalizedDistance = distanceFromMidpoint / Math.max(range / 2, 1);

  return clamp(1 - (normalizedDistance * 0.55), 0.35, 1);
}

function lifestyleCompatibilityScore(currentUser, candidate) {
  return Math.min(
    10,
    2
    + lifestyleTraitScore(currentUser.smokes, candidate.smokes)
    + lifestyleTraitScore(currentUser.drinks, candidate.drinks)
  );
}

function lifestyleTraitScore(currentValue, candidateValue) {
  if (currentValue == null || candidateValue == null) {
    return 2;
  }

  return currentValue === candidateValue ? 4 : 1;
}

function profileCompletenessScore(row) {
  let score = 0;

  if (isProfileReady(row)) {
    score += 3;
  }

  if (discoverPhotoFileIds(row).length > 0) {
    score += 2;
  }

  if (interestTokens(row.interests).length > 0) {
    score += 1;
  }

  if (asString(row.bio)) {
    score += 2;
  }

  return score;
}

function numberValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function distanceKmBetween(lhs, rhs) {
  if (!Number.isFinite(lhs.latitude)
    || !Number.isFinite(lhs.longitude)
    || !Number.isFinite(rhs.latitude)
    || !Number.isFinite(rhs.longitude)) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latDelta = toRadians(rhs.latitude - lhs.latitude);
  const lonDelta = toRadians(rhs.longitude - lhs.longitude);
  const lhsLat = toRadians(lhs.latitude);
  const rhsLat = toRadians(rhs.latitude);

  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(lhsLat) * Math.cos(rhsLat) * Math.sin(lonDelta / 2) ** 2;
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusKm * arc;
}

function distanceCompatibilityScore(distanceKm, currentMaxDistanceKm, candidateMaxDistanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return 8;
  }

  const distanceLimit = [currentMaxDistanceKm, candidateMaxDistanceKm]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((lhs, rhs) => lhs - rhs)[0];

  if (Number.isFinite(distanceLimit)) {
    const ratio = distanceKm / Math.max(distanceLimit, 5);
    return Math.round(clamp(18 - (ratio * 14), 4, 18));
  }

  if (distanceKm <= 5) {
    return 18;
  }
  if (distanceKm <= 15) {
    return 15;
  }
  if (distanceKm <= 35) {
    return 11;
  }
  if (distanceKm <= 60) {
    return 7;
  }
  if (distanceKm <= 100) {
    return 4;
  }
  if (distanceKm <= 250) {
    return 2;
  }
  return 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundedDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return null;
  }
  return Math.max(1, Math.round(distanceKm));
}

function discoverBio(row, commonInterests) {
  const explicitBio = asString(row.bio);
  if (explicitBio) {
    return explicitBio;
  }

  if (commonInterests.length > 0) {
    return `Interessi in comune: ${commonInterests.slice(0, 2).join(", ")}`;
  }

  return "Profilo Fyre";
}

function toRadians(value) {
  return value * (Math.PI / 180);
}

function isRecentlyActive(value) {
  const timestamp = timestampValue(value);
  if (!timestamp) {
    return false;
  }
  return Date.now() - timestamp <= RECENT_PRESENCE_MS;
}

function timestampValue(value) {
  const stringValue = asString(value);
  if (!stringValue) {
    return 0;
  }

  const timestamp = Date.parse(stringValue);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function firstNonEmpty(values) {
  for (const value of values) {
    const normalized = asString(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function requiredIdentifierEnv(name) {
  const value = requiredEnv(name);
  if (!appwriteIdentifier(value)) {
    throw new Error(`Invalid environment variable ${name}`);
  }
  return value;
}

function requiredIntegerEnv(name, minimum, maximum) {
  const rawValue = requiredEnv(name);
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid environment variable ${name}`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid environment variable ${name}`);
  }
  return value;
}

function optionalHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

async function resolveCurrentUserId(config, req, body) {
  const jwtUserId = await fetchUserIdFromJwt(config);
  const headerValue = optionalHeader(req, "x-appwrite-user-id");
  const bodyValue = asString(body.currentUserId);

  if (headerValue && asString(headerValue) !== jwtUserId) {
    throw authError("Authenticated user mismatch");
  }

  if (bodyValue && bodyValue !== jwtUserId) {
    throw authError("Authenticated user mismatch");
  }

  return jwtUserId;
}

async function fetchUserIdFromJwt(config) {
  if (!config.userJwt) {
    throw authError("Missing user JWT", 401);
  }

  const response = await fetch(`${config.endpoint}/account`, {
    headers: {
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-JWT": config.userJwt,
      "X-Appwrite-Response-Format": "1.8.0"
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw authError("Invalid user JWT", 401);
  }
  const userId = appwriteIdentifier(payload.$id);
  if (!userId) {
    throw authError("Invalid user JWT", 401);
  }
  return userId;
}

function authError(message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") {
    return req.bodyJson;
  }

  if (!req.bodyText) {
    return {};
  }

  try {
    return JSON.parse(req.bodyText);
  } catch {
    return {};
  }
}

function resolveApiKey(req) {
  const runtimeKey = optionalHeader(req, "x-appwrite-key");
  if (typeof runtimeKey === "string" && runtimeKey.trim().length > 0) {
    return runtimeKey.trim();
  }
  throw new Error("Missing Appwrite function runtime key");
}

async function listRows(config, tableId, queries) {
  const payload = await request(
    config,
    "GET",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`,
    undefined,
    queries
  );
  return Array.isArray(payload.rows) ? payload.rows : [];
}

async function listRowsWindow(config, tableId, baseQueries, initialCursor, maxRows, pageSize) {
  const rows = [];
  const seenIds = new Set();
  let cursor = initialCursor;
  const maximumPageCount = Math.ceil(maxRows / pageSize) + 1;

  for (let page = 0; page < maximumPageCount && rows.length < maxRows; page += 1) {
    const remaining = maxRows - rows.length;
    const requestLimit = Math.min(pageSize, remaining);
    const batch = await listRows(config, tableId, [
      ...baseQueries,
      orderAsc("$id"),
      ...(cursor ? [cursorAfter(cursor)] : []),
      limit(requestLimit)
    ]);

    if (batch.length > requestLimit) {
      throw paginationError();
    }
    if (batch.length === 0) {
      return { rows, nextCursor: null };
    }

    const acceptedBatch = batch.slice(0, remaining);
    for (const row of acceptedBatch) {
      const rowId = appwriteIdentifier(row?.$id);
      if (!rowId || rowId === cursor || seenIds.has(rowId)) {
        throw paginationError();
      }
      seenIds.add(rowId);
      rows.push(row);
    }

    const lastId = appwriteIdentifier(acceptedBatch.at(-1)?.$id);
    if (!lastId) {
      throw paginationError();
    }

    if (batch.length < requestLimit) {
      return { rows, nextCursor: null };
    }

    cursor = lastId;
  }

  if (rows.length === maxRows) {
    const lastId = appwriteIdentifier(rows.at(-1)?.$id);
    if (!lastId) {
      throw paginationError();
    }
    const probe = await listRows(config, tableId, [
      ...baseQueries,
      orderAsc("$id"),
      cursorAfter(lastId),
      limit(1)
    ]);
    if (probe.length === 0) {
      return { rows, nextCursor: null };
    }
    const probeId = appwriteIdentifier(probe[0]?.$id);
    if (!probeId || probeId === lastId || seenIds.has(probeId)) {
      throw paginationError();
    }
    return { rows, nextCursor: lastId };
  }
  throw paginationError();
}

async function listRowsByExactValues(config, tableId, attribute, values) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  const batches = [];
  for (let index = 0; index < uniqueValues.length; index += EXCLUSION_QUERY_CHUNK_SIZE) {
    const chunk = uniqueValues.slice(index, index + EXCLUSION_QUERY_CHUNK_SIZE);
    batches.push(listRows(config, tableId, [
      equal(attribute, chunk),
      orderAsc("$id"),
      limit(chunk.length)
    ]));
  }
  return dedupeRowsById((await Promise.all(batches)).flat());
}

function optionalCursor(value) {
  if (value == null || value === "") {
    return null;
  }
  const cursor = appwriteIdentifier(value);
  if (!cursor) {
    const err = new Error("Invalid discovery cursor");
    err.statusCode = 400;
    throw err;
  }
  return cursor;
}

function paginationError() {
  const err = new Error("Appwrite returned an invalid cursor page");
  err.statusCode = 502;
  return err;
}

async function request(config, method, path, body, queries = []) {
  const url = new URL(`${config.endpoint}${path}`);
  for (const query of queries) {
    url.searchParams.append("queries[]", query);
  }

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-Key": config.apiKey,
      "X-Appwrite-Response-Format": "1.8.0"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with status ${response.status}`);
  }
  return payload;
}

function equal(field, values) {
  return JSON.stringify({ method: "equal", attribute: field, values });
}

function orderAsc(field) {
  return JSON.stringify({ method: "orderAsc", attribute: field });
}

function cursorAfter(value) {
  return JSON.stringify({ method: "cursorAfter", values: [value] });
}

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}

export function dedupeRowsById(rows) {
  const seenIds = new Set();
  const deduped = [];

  for (const row of rows) {
    const rowId = asString(row?.$id)
      ?? `${asString(row?.userAId) ?? ""}:${asString(row?.userBId) ?? ""}:${asString(row?.matchKey) ?? ""}:${asString(row?.pairKey) ?? ""}`;
    if (seenIds.has(rowId)) {
      continue;
    }

    seenIds.add(rowId);
    deduped.push(row);
  }

  return deduped;
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function appwriteIdentifier(value) {
  const identifier = asString(value);
  return identifier && APPWRITE_IDENTIFIER_PATTERN.test(identifier) ? identifier : null;
}

export function pathSegment(value) {
  return encodeURIComponent(String(value));
}

function asBool(value) {
  if (value === true || value === false) {
    return value;
  }

  const stringValue = asString(value);
  if (!stringValue) {
    return false;
  }

  return stringValue === "true";
}

function asNullableBool(value) {
  if (value === true || value === false) {
    return value;
  }

  const stringValue = asString(value);
  if (!stringValue) {
    return null;
  }

  if (stringValue === "true") {
    return true;
  }
  if (stringValue === "false") {
    return false;
  }
  return null;
}

export function discoverName(row) {
  const firstName = asString(row.firstName) ?? "";
  const lastName = asString(row.lastName) ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  return "Fyre";
}

function discoverPhotoFileIds(row) {
  if (Array.isArray(row.photoFileIds)) {
    return normalizedAvatarFileIds(row.photoFileIds);
  }

  const serialized = asString(row.photoFileIds);
  if (serialized) {
    return normalizedAvatarFileIds(serialized
      .split(/[,|\n]/)
      .map((value) => value.trim()));
  }

  return [];
}

async function discoverPhotoURLs(config, row) {
  const photoFileIds = discoverPhotoFileIds(row);
  const avatarFileId = normalizedAvatarFileId(row.avatarFileId);
  const fileIds = photoFileIds.length > 0
    ? photoFileIds
    : avatarFileId ? [avatarFileId] : [];
  const urls = await Promise.all(fileIds.map(async (fileId) => {
    try {
      return await temporaryAvatarURL(config, fileId);
    } catch {
      return null;
    }
  }));
  return urls.filter(Boolean);
}

function normalizedAvatarFileIds(values) {
  return Array.from(new Set(values.map(normalizedAvatarFileId).filter(Boolean))).slice(0, 6);
}

function normalizedAvatarFileId(value) {
  const fileId = asString(value);
  return appwriteIdentifier(fileId);
}

async function temporaryAvatarURL(config, fileId) {
  const now = Date.now();
  pruneAvatarTokenCache(now);
  const cacheKey = `${config.endpoint}\u0000${config.projectId}\u0000${config.avatarsBucketId}\u0000${fileId}`;
  const cached = avatarTokenCache.get(cacheKey);
  if (cached && cached.usableUntil > now) {
    avatarTokenCache.delete(cacheKey);
    avatarTokenCache.set(cacheKey, cached);
    return cached.url;
  }

  const requestedExpiry = new Date(now + config.avatarTokenTtlSeconds * 1000).toISOString();
  const token = await request(
    config,
    "POST",
    `/tokens/buckets/${pathSegment(config.avatarsBucketId)}/files/${pathSegment(fileId)}`,
    { expire: requestedExpiry }
  );
  const secret = asString(token.secret);
  if (!secret) {
    throw new Error("Appwrite returned an invalid avatar file token");
  }

  const parsedResponseExpiry = Date.parse(asString(token.expire) ?? requestedExpiry);
  const responseExpiry = Number.isFinite(parsedResponseExpiry)
    ? parsedResponseExpiry
    : now + config.avatarTokenTtlSeconds * 1000;
  const usableUntil = Math.max(
    now,
    Math.min(now + config.avatarTokenTtlSeconds * 1000, responseExpiry) - AVATAR_TOKEN_CACHE_SAFETY_MS
  );
  const url = new URL(`${config.endpoint}/storage/buckets/${pathSegment(config.avatarsBucketId)}/files/${pathSegment(fileId)}/view`);
  url.searchParams.set("project", config.projectId);
  url.searchParams.set("token", secret);
  const cachedValue = { url: url.toString(), usableUntil };
  if (avatarTokenCache.size >= AVATAR_TOKEN_CACHE_LIMIT) {
    avatarTokenCache.delete(avatarTokenCache.keys().next().value);
  }
  avatarTokenCache.set(cacheKey, cachedValue);
  return cachedValue.url;
}

function pruneAvatarTokenCache(now) {
  for (const [cacheKey, entry] of avatarTokenCache) {
    if (entry.usableUntil <= now) {
      avatarTokenCache.delete(cacheKey);
    }
  }
}

async function mapWithConcurrency(values, concurrency, transform) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await transform(values[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function relationshipStateForPair(currentUserId, otherUserId, relationships) {
  if (!currentUserId || !otherUserId) {
    return "none";
  }

  const pairKey = [currentUserId, otherUserId].sort().join(":");
  const relationship = relationships.find((row) => asString(row.pairKey) === pairKey);
  if (!relationship) {
    return "none";
  }

  const currentState = relationshipStateForUser(relationship, currentUserId);
  const otherState = relationshipStateForUser(relationship, otherUserId);
  if (currentState === "blocked" || otherState === "blocked") {
    return "blocked";
  }
  if (currentState === "archived") {
    return "archived";
  }
  if (relationship.matchedAt || currentState === "matched" || otherState === "matched") {
    return "matched";
  }
  if (currentState === "liked") {
    return "liked";
  }
  return "none";
}

function relationshipStateForUser(relationship, userId) {
  if (relationship.userAId === userId) {
    return asString(relationship.userAState) ?? "none";
  }
  if (relationship.userBId === userId) {
    return asString(relationship.userBState) ?? "none";
  }
  return "none";
}

function otherUserIdFromRelationship(relationship, currentUserId) {
  if (relationship.userAId === currentUserId) {
    return asString(relationship.userBId);
  }
  if (relationship.userBId === currentUserId) {
    return asString(relationship.userAId);
  }
  return null;
}
