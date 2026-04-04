const MAX_RESULTS = 40;
const DEFAULT_MIN_AGE = 18;
const DEFAULT_MAX_AGE = 35;
const RECENT_PRESENCE_MS = 3 * 24 * 60 * 60 * 1000;

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = resolveCurrentUserId(req, body);

    const [currentProfile, profiles, swipes, matches] = await Promise.all([
      fetchProfile(config, currentUserId),
      listRows(config, config.profilesTableId, []),
      listRows(config, config.swipesTableId, [
        equal("fromUserId", [currentUserId])
      ]),
      listRows(config, config.matchesTableId, [])
    ]);

    if (!currentProfile) {
      console.log("RESULT_JSON:{\"profiles\":[]}");
      return res.json({ profiles: [] }, 200);
    }

    const currentUserContext = makeUserContext(currentProfile);
    const excludedUserIds = buildExcludedUserIds(currentUserId, swipes, matches);

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
      .map(({ row, distanceKm }) => projectDiscoverProfile(row, distanceKm));

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
    matchesTableId: requiredEnv("APPWRITE_MATCHES_TABLE_ID")
  };
}

function buildExcludedUserIds(currentUserId, swipes, matches) {
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

  if (distanceKm > currentUser.maxDistanceKm || distanceKm > candidate.maxDistanceKm) {
    return null;
  }

  return { row, candidate, distanceKm };
}

function candidateScore(row, candidate, currentUser, distanceKm) {
  let score = 0;

  score += distanceScore(distanceKm);

  if (currentUser.city && candidate.city && currentUser.city === candidate.city) {
    score += 1;
  }

  if (currentUser.intent && candidate.intent && currentUser.intent === candidate.intent) {
    score += 3;
  }

  const sharedInterests = candidate.interests.filter((interest) => currentUser.interests.includes(interest)).length;
  score += Math.min(sharedInterests, 3);

  if (typeof currentUser.smokes === "boolean" && typeof candidate.smokes === "boolean" && currentUser.smokes === candidate.smokes) {
    score += 1;
  }

  if (typeof currentUser.drinks === "boolean" && typeof candidate.drinks === "boolean" && currentUser.drinks === candidate.drinks) {
    score += 1;
  }

  if (isRecentlyActive(row.presenceUpdatedAt)) {
    score += 1;
  }

  return score;
}

function projectDiscoverProfile(row, distanceKm) {
  return {
    userId: row.userId,
    email: row.email ?? null,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    birthDate: row.birthDate ?? null,
    gender: normalizeGender(row.gender),
    city: row.city ?? null,
    intent: normalizeIntent(row.intent),
    distanceKm: roundedDistance(distanceKm),
    bio: firstNonEmpty([row.bio]),
    interests: firstNonEmpty([row.interests]),
    avatarFileId: row.avatarFileId ?? null
  };
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
  return Math.max(DEFAULT_MIN_AGE, Math.min(80, Math.trunc(numeric)));
}

function normalizeMaxAge(value, minValue) {
  const minAge = normalizeAge(minValue, DEFAULT_MIN_AGE);
  const fallbackMax = Math.max(minAge, DEFAULT_MAX_AGE);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallbackMax;
  }
  return Math.max(minAge, Math.min(80, Math.trunc(numeric)));
}

function normalizeDistanceKm(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 50;
  }
  return Math.max(5, Math.min(300, Math.trunc(numeric)));
}

function normalizeCity(value) {
  const city = asString(value);
  return city ? city.toLowerCase() : null;
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
    return 0;
  }
  if (distanceKm <= 10) {
    return 4;
  }
  if (distanceKm <= 25) {
    return 3;
  }
  if (distanceKm <= 50) {
    return 2;
  }
  if (distanceKm <= 100) {
    return 1;
  }
  return 0;
}

function roundedDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return null;
  }
  return Math.max(1, Math.round(distanceKm));
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
