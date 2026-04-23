import {
  makeDiscoverProfileContract,
  seededIntegerFromString
} from "./contracts.js";

const MAX_RESULTS = 40;
const DEFAULT_MIN_AGE = 18;
const DEFAULT_MAX_AGE = 35;
const RECENT_PRESENCE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SHARED_INTERESTS = 4;

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = resolveCurrentUserId(req, body);
    const currentProfile = await fetchProfile(config, currentUserId);

    if (!currentProfile) {
      console.log("RESULT_JSON:{\"profiles\":[]}");
      return res.json({ profiles: [] }, 200);
    }

    const currentUserContext = makeUserContext(currentProfile);
    const profileQueries =
      currentUserContext.preferredGenders.length > 0 && currentUserContext.preferredGenders.length < 4
        ? [equal("gender", currentUserContext.preferredGenders)]
        : [];

    const [
      profiles,
      swipes,
      matchesByUserA,
      matchesByUserB,
      relationshipsByUserA,
      relationshipsByUserB
    ] = await Promise.all([
      listAllRows(config, config.profilesTableId, profileQueries),
      listAllRows(config, config.swipesTableId, [
        equal("fromUserId", [currentUserId])
      ]),
      listAllRows(config, config.matchesTableId, [
        equal("userAId", [currentUserId])
      ]),
      listAllRows(config, config.matchesTableId, [
        equal("userBId", [currentUserId])
      ]),
      config.relationshipsTableId
        ? listAllRows(config, config.relationshipsTableId, [
            equal("userAId", [currentUserId])
          ])
        : Promise.resolve([]),
      config.relationshipsTableId
        ? listAllRows(config, config.relationshipsTableId, [
            equal("userBId", [currentUserId])
          ])
        : Promise.resolve([])
    ]);
    const matches = dedupeRowsById([...matchesByUserA, ...matchesByUserB]);
    const relationships = dedupeRowsById([...relationshipsByUserA, ...relationshipsByUserB]);
    const excludedUserIds = buildExcludedUserIds(currentUserId, swipes, matches, relationships);

    const discoverProfiles = profiles
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
      .slice(0, MAX_RESULTS)
      .map(({ row, candidate, distanceKm, score }) => projectDiscoverProfile(
        config,
        row,
        candidate,
        currentUserContext,
        distanceKm,
        score,
        relationshipStateForPair(currentUserId, asString(row.userId), relationships)
      ))
      .filter(Boolean);

    console.log(`RESULT_JSON:${JSON.stringify({ profiles: discoverProfiles })}`);
    return res.json({ profiles: discoverProfiles }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return res.json({ message: "Unable to fetch discover profiles" }, 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    profilesTableId: requiredEnv("APPWRITE_PROFILES_TABLE_ID"),
    swipesTableId: requiredEnv("APPWRITE_SWIPES_TABLE_ID"),
    matchesTableId: requiredEnv("APPWRITE_MATCHES_TABLE_ID"),
    relationshipsTableId: optionalEnv("APPWRITE_RELATIONSHIPS_TABLE_ID"),
    avatarsBucketId: optionalEnv("APPWRITE_AVATARS_BUCKET_ID")
  };
}

function buildExcludedUserIds(currentUserId, swipes, matches, relationships) {
  const excludedUserIds = new Set();

  for (const swipe of swipes) {
    if (typeof swipe.toUserId === "string" && swipe.toUserId.length > 0) {
      excludedUserIds.add(swipe.toUserId);
    }
  }

  for (const match of matches) {
    if (match.userAId === currentUserId && typeof match.userBId === "string") {
      excludedUserIds.add(match.userBId);
    } else if (match.userBId === currentUserId && typeof match.userAId === "string") {
      excludedUserIds.add(match.userAId);
    }
  }

  for (const relationship of relationships) {
    const relatedUserId = otherUserIdFromRelationship(relationship, currentUserId);
    if (!relatedUserId) {
      continue;
    }

    const state = relationshipStateForUser(relationship, currentUserId);
    if (state === "archived" || state === "blocked" || state === "liked" || state === "matched") {
      excludedUserIds.add(relatedUserId);
    }
  }

  return excludedUserIds;
}

function buildCandidateEntry(row, currentUserId, currentUser, excludedUserIds) {
  const candidateUserId = asString(row.userId);
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

  const distanceKm = distanceKmBetween(currentUser, candidate);
  if (distanceKm == null) {
    return null;
  }

  if (Number.isFinite(currentUser.maxDistanceKm) && distanceKm > currentUser.maxDistanceKm) {
    return null;
  }

  if (Number.isFinite(candidate.maxDistanceKm) && distanceKm > candidate.maxDistanceKm) {
    return null;
  }

  return { row, candidate, distanceKm };
}

function candidateScore(row, candidate, currentUser, distanceKm) {
  const sharedInterests = candidate.interests.filter((interest) => currentUser.interests.includes(interest)).length;
  const interestsScore = Math.min(sharedInterests, MAX_SHARED_INTERESTS) * 14;
  const distanceComponent = distanceScore(distanceKm);
  const completenessComponent = profileCompletenessScore(row);
  const activityBoost = isRecentlyActive(row.presenceUpdatedAt) ? 4 : 0;
  const deterministicScore = interestsScore + distanceComponent + completenessComponent + activityBoost;
  const boostMin = Math.max(1, Math.round(deterministicScore * 0.05));
  const boostMax = Math.max(boostMin, Math.round(deterministicScore * 0.1));
  const rankingBoost = seededIntegerFromString(
    `${asString(row.userId) ?? "candidate"}:${currentUser.gender ?? "unknown"}:${currentUser.city ?? "unknown"}`,
    boostMin,
    boostMax
  );

  return Math.max(1, Math.round(deterministicScore + rankingBoost));
}

function projectDiscoverProfile(config, row, candidate, currentUser, distanceKm, score, relationshipState) {
  const commonInterests = candidate.interests.filter((interest) => currentUser.interests.includes(interest));
  const photos = discoverPhotoURLs(config, row);

  return makeDiscoverProfileContract({
    id: row.userId,
    name: discoverName(row),
    age: candidate.age,
    gender: candidate.gender,
    city: asString(row.city),
    intent: candidate.intent,
    bio: discoverBio(row, commonInterests),
    imageUrl: photos[0] ?? null,
    photos,
    photoFileIds: discoverPhotoFileIds(row),
    avatarFileId: asString(row.avatarFileId),
    compatibilityScore: Math.min(99, Math.max(42, score)),
    distanceKm: roundedDistance(distanceKm),
    distance: roundedDistance(distanceKm),
    commonInterests: commonInterests.slice(0, MAX_SHARED_INTERESTS),
    relationshipState
  });
}

function makeUserContext(row) {
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
    drinks: asNullableBool(row.drinks)
  };
}

function isProfileReady(row) {
  if (asBool(row.profileReady)) {
    return true;
  }

  return Boolean(
    asString(row.firstName)
    && normalizeCity(row.city)
    && normalizeGender(row.gender)
    && Number.isFinite(numberValue(row.latitude))
    && Number.isFinite(numberValue(row.longitude))
    && ageFromBirthDate(row.birthDate) >= 18
    && firstNonEmpty([row.bio])
  );
}

async function fetchProfile(config, userId) {
  try {
    return await request(config, "GET", `/tablesdb/${config.databaseId}/tables/${config.profilesTableId}/rows/${userId}`);
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
    : asString(rawValue)
      ?.split(",")
      .map((item) => normalizeGender(item))
      .filter(Boolean);

  if (explicit?.length) {
    return Array.from(new Set(explicit));
  }

  return ["male", "female", "nonbinary", "other"];
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
  const timestamp = timestampValue(value);
  if (!timestamp) {
    return 0;
  }

  const birthDate = new Date(timestamp);
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
  return Math.max(5, Math.trunc(numeric));
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

function profileCompletenessScore(row) {
  let score = 0;

  if (isProfileReady(row)) {
    score += 8;
  }

  if (discoverPhotoFileIds(row).length > 0) {
    score += 4;
  }

  if (interestTokens(row.interests).length > 0) {
    score += 3;
  }

  if (asString(row.bio)) {
    score += 3;
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

function distanceScore(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return 6;
  }
  if (distanceKm <= 5) {
    return 24;
  }
  if (distanceKm <= 15) {
    return 18;
  }
  if (distanceKm <= 35) {
    return 12;
  }
  if (distanceKm <= 60) {
    return 8;
  }
  if (distanceKm <= 100) {
    return 4;
  }
  return 0;
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

function optionalEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requiredHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  if (!value) {
    throw new Error(`Missing header ${name}`);
  }
  return Array.isArray(value) ? value[0] : value;
}

function resolveCurrentUserId(req, body) {
  const headerValue = req.headers?.["x-appwrite-user-id"]
    ?? req.headers?.["X-Appwrite-User-Id"]
    ?? req.headers?.["X-APPWRITE-USER-ID"];
  if (headerValue) {
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }

  const bodyValue = typeof body.currentUserId === "string" ? body.currentUserId.trim() : "";
  if (bodyValue) {
    return bodyValue;
  }

  throw new Error("Missing current user id");
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
  const runtimeKey = process.env.APPWRITE_FUNCTION_API_KEY ?? process.env.APPWRITE_API_KEY;
  if (typeof runtimeKey === "string" && runtimeKey.trim().length > 0) {
    return runtimeKey.trim();
  }
  return requiredHeader(req, "x-appwrite-key");
}

async function listRows(config, tableId, queries) {
  const payload = await request(
    config,
    "GET",
    `/tablesdb/${config.databaseId}/tables/${tableId}/rows`,
    undefined,
    queries
  );
  return Array.isArray(payload.rows) ? payload.rows : [];
}

async function listAllRows(config, tableId, baseQueries, pageSize = 100) {
  const rows = [];
  let page = 0;

  while (true) {
    const batch = await listRows(config, tableId, [
      ...baseQueries,
      limit(pageSize),
      offset(page * pageSize)
    ]);
    rows.push(...batch);

    if (batch.length < pageSize) {
      return rows;
    }

    page += 1;
  }
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

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}

function offset(value) {
  return JSON.stringify({ method: "offset", values: [value] });
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

function discoverName(row) {
  const firstName = asString(row.firstName) ?? "";
  const lastName = asString(row.lastName) ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  const email = asString(row.email);
  if (email) {
    return email.split("@")[0];
  }

  return "Fyre";
}

function discoverPhotoFileIds(row) {
  if (Array.isArray(row.photoFileIds)) {
    return row.photoFileIds
      .map((value) => asString(value))
      .filter(Boolean);
  }

  const serialized = asString(row.photoFileIds);
  if (serialized) {
    return serialized
      .split(/[,|\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
}

function discoverPhotoURLs(config, row) {
  if (Array.isArray(row.photos)) {
    const directUrls = row.photos.map((value) => asString(value)).filter(Boolean);
    if (directUrls.length > 0) {
      return directUrls;
    }
  }

  if (!config.avatarsBucketId) {
    return [];
  }

  return discoverPhotoFileIds(row)
    .map((fileId) => buildStorageFileURL(config, fileId))
    .filter(Boolean);
}

function buildStorageFileURL(config, fileId) {
  if (!fileId || !config.avatarsBucketId) {
    return null;
  }

  const url = new URL(`${config.endpoint}/storage/buckets/${config.avatarsBucketId}/files/${fileId}/view`);
  url.searchParams.set("project", config.projectId);
  return url.toString();
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
