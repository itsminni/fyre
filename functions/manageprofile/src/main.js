const PROFILE_STRING_FIELDS = {
  firstName: 100,
  lastName: 100,
  city: 160,
  bio: 5000,
  interests: 5000
};
const SOCIAL_TAG_FIELDS = ["instagramTag", "spotifyTag"];
const MAX_SOCIAL_TAG_LENGTH = 64;
const GENDERS = new Set(["male", "female", "nonBinary", "other"]);
const ORIENTATIONS = new Set(["straight", "gay", "lesbian", "bisexual", "pansexual", "other"]);
const INTENTS = new Set(["relationship", "friendship", "casual", "notSure"]);
const MAX_PROFILE_PHOTOS = 6;
const APPWRITE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const account = await resolveCurrentAccount(config, req, body);
    const action = asString(body.action) ?? "upsert";

    if (action === "presence") {
      const profile = await findProfile(config, account.$id);
      if (!profile?.$id) {
        return res.json({ message: "Profile not found" }, 404);
      }

      const now = new Date().toISOString();
      const online = body.online === true;
      await updateRow(config, profile.$id, {
        presenceUpdatedAt: now,
        ...(!online ? { lastSeenAt: now } : {})
      }, profilePermissions(account.$id));

      console.log(JSON.stringify({ event: "manageprofile.complete", action: "presence" }));
      return res.json({ updated: true, presenceUpdatedAt: now }, 200);
    }

    if (action !== "upsert") {
      return res.json({ message: "Invalid action" }, 400);
    }

    const existing = await findProfile(config, account.$id);
    const profileData = await makeProfileData(config, body, account, existing);
    let profileId = asString(existing?.$id) ?? account.$id;

    if (existing?.$id) {
      await updateRow(config, existing.$id, profileData, profilePermissions(account.$id));
    } else {
      try {
        await createRow(config, account.$id, profileData, profilePermissions(account.$id));
      } catch (createError) {
        if (createError?.statusCode !== 409) {
          throw createError;
        }

        const concurrent = await findProfile(config, account.$id);
        if (!concurrent?.$id) {
          throw createError;
        }
        profileId = concurrent.$id;
        await updateRow(config, concurrent.$id, profileData, profilePermissions(account.$id));
      }
    }

    console.log(JSON.stringify({ event: "manageprofile.complete", action: "upsert" }));
    return res.json({ profileId, profileReady: profileData.profileReady }, 200);
  } catch (err) {
    if (typeof error === "function") {
      error(JSON.stringify({
        event: "manageprofile.failed",
        statusCode: err?.statusCode ?? 500,
        type: asString(err?.type) ?? "internal_error"
      }));
    }

    const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
    const message = statusCode === 401
      ? "Unauthorized"
      : statusCode === 403
        ? "Forbidden"
        : statusCode >= 500
          ? "Unable to update profile"
          : err.message;
    return res.json({ message }, statusCode);
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
    avatarsBucketId: requiredIdentifierEnv("APPWRITE_AVATARS_BUCKET_ID")
  };
}

async function resolveCurrentAccount(config, req, body) {
  if (!config.userJwt) {
    throw httpError("Missing user JWT", 401);
  }

  const response = await fetch(`${config.endpoint}/account`, {
    headers: {
      "X-Appwrite-Project": config.projectId,
      "X-Appwrite-JWT": config.userJwt,
      "X-Appwrite-Response-Format": "1.8.0"
    }
  });
  const payload = await response.json().catch(() => ({}));
  const userId = response.ok ? appwriteIdentifier(payload.$id) : null;
  const email = response.ok ? normalizedEmail(payload.email) : null;
  if (!userId || !email) {
    throw httpError("Invalid user JWT", 401);
  }

  const claimedUserIds = [
    optionalHeader(req, "x-appwrite-user-id"),
    body.currentUserId
  ].map(asString).filter(Boolean);
  if (claimedUserIds.some((claimedUserId) => claimedUserId !== userId)) {
    throw httpError("Authenticated user mismatch", 403);
  }

  return { $id: userId, email };
}

async function makeProfileData(config, body, account, existing) {
  const data = {
    userId: account.$id,
    email: account.email
  };

  for (const [field, maximumLength] of Object.entries(PROFILE_STRING_FIELDS)) {
    data[field] = nullableString(body[field], field, maximumLength);
  }
  for (const field of SOCIAL_TAG_FIELDS) {
    data[field] = nullableSocialTag(body[field], field);
  }

  data.birthDate = normalizedBirthDate(body.birthDate);
  data.gender = nullableEnum(body.gender, "gender", GENDERS);
  data.orientation = nullableEnum(body.orientation, "orientation", ORIENTATIONS);
  data.intent = nullableEnum(body.intent, "intent", INTENTS);
  data.preferredGenders = enumArray(body.preferredGenders, "preferredGenders", GENDERS, 4);

  data.minPreferredAge = boundedInteger(body.minPreferredAge, "minPreferredAge", 18, 99, 18);
  data.maxPreferredAge = boundedInteger(body.maxPreferredAge, "maxPreferredAge", 18, 99, 35);
  if (data.minPreferredAge >= data.maxPreferredAge) {
    throw httpError("minPreferredAge must be less than maxPreferredAge", 400);
  }

  data.maxDistanceKm = nullableBoundedInteger(body.maxDistanceKm, "maxDistanceKm", 5, 999);
  data.latitude = nullableBoundedNumber(body.latitude, "latitude", -90, 90);
  data.longitude = nullableBoundedNumber(body.longitude, "longitude", -180, 180);
  data.smokes = nullableBoolean(body.smokes, "smokes");
  data.drinks = nullableBoolean(body.drinks, "drinks");
  data.excludeSmokers = booleanValue(body.excludeSmokers, "excludeSmokers", false);
  data.excludeDrinkers = booleanValue(body.excludeDrinkers, "excludeDrinkers", false);

  data.avatarFileId = nullableIdentifier(body.avatarFileId, "avatarFileId");
  data.photoFileIds = identifierArray(body.photoFileIds, "photoFileIds", MAX_PROFILE_PHOTOS);
  await secureOwnedFiles(config, account.$id, [data.avatarFileId, ...data.photoFileIds].filter(Boolean));

  data.profileReady = isProfileReady(data);
  data.presenceUpdatedAt = asNullableISODate(existing?.presenceUpdatedAt);
  data.lastSeenAt = asNullableISODate(existing?.lastSeenAt);
  return data;
}

function isProfileReady(data) {
  return Boolean(
    data.firstName
    && data.city
    && data.birthDate
    && data.gender
    && data.orientation
    && data.bio
    && data.preferredGenders.length > 0
  );
}

async function secureOwnedFiles(config, userId, fileIds) {
  for (const fileId of new Set(fileIds)) {
    const file = await request(
      config,
      "GET",
      `/storage/buckets/${pathSegment(config.avatarsBucketId)}/files/${pathSegment(fileId)}`
    );
    const permissions = Array.isArray(file.$permissions) ? file.$permissions : [];
    const updatePermission = `update(\"user:${userId}\")`;
    const deletePermission = `delete(\"user:${userId}\")`;
    if (!permissions.includes(updatePermission) || !permissions.includes(deletePermission)) {
      throw httpError("Avatar file is not owned by the authenticated user", 403);
    }

    const securedPermissions = [
      `read(\"user:${userId}\")`,
      updatePermission,
      deletePermission
    ];
    if (!sameStringSet(permissions, securedPermissions)) {
      await request(
        config,
        "PUT",
        `/storage/buckets/${pathSegment(config.avatarsBucketId)}/files/${pathSegment(fileId)}`,
        {
          name: asString(file.name) ?? `profile-${fileId}`,
          permissions: securedPermissions
        }
      );
    }
  }
}

function sameStringSet(first, second) {
  if (first.length !== second.length) {
    return false;
  }
  const expected = new Set(second);
  return first.every((entry) => expected.has(entry));
}

async function findProfile(config, userId) {
  try {
    return await request(
      config,
      "GET",
      `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(config.profilesTableId)}/rows/${pathSegment(userId)}`
    );
  } catch (err) {
    if (err?.statusCode !== 404) {
      throw err;
    }
  }

  const payload = await request(
    config,
    "GET",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(config.profilesTableId)}/rows`,
    undefined,
    [equal("userId", [userId]), limit(1)]
  );
  return Array.isArray(payload.rows) ? payload.rows[0] ?? null : null;
}

function profilePermissions(userId) {
  return [`read(\"user:${userId}\")`];
}

async function createRow(config, rowId, data, permissions) {
  return request(
    config,
    "POST",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(config.profilesTableId)}/rows`,
    { rowId, data, permissions }
  );
}

async function updateRow(config, rowId, data, permissions) {
  return request(
    config,
    "PATCH",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(config.profilesTableId)}/rows/${pathSegment(rowId)}`,
    { data, permissions }
  );
}

async function request(config, method, path, body, queries = []) {
  if (!config.apiKey) {
    throw new Error("Missing Appwrite server API key");
  }

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
  const payload = parseJSON(text);
  if (!response.ok) {
    const err = httpError(payload.message ?? `Request failed with status ${response.status}`, response.status);
    err.type = asString(payload.type);
    throw err;
  }
  return payload;
}

function nullableString(value, field, maximumLength) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw httpError(`${field} must be a string or null`, 400);
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > maximumLength) {
    throw httpError(`${field} is too long`, 400);
  }
  return normalized;
}

function nullableSocialTag(value, field) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw httpError(`${field} must be a string or null`, 400);
  }

  const normalized = value.replace(/[@\s]+/g, "");
  if (!normalized) {
    return null;
  }
  if (normalized.length > MAX_SOCIAL_TAG_LENGTH) {
    throw httpError(`${field} is too long`, 400);
  }
  return normalized;
}

function normalizedBirthDate(value) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw httpError("birthDate must be an ISO date", 400);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw httpError("birthDate must be an ISO date", 400);
  }

  const now = new Date();
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDifference = now.getUTCMonth() - parsed.getUTCMonth();
  if (monthDifference < 0 || (monthDifference === 0 && now.getUTCDate() < parsed.getUTCDate())) {
    age -= 1;
  }
  if (age < 18 || parsed.getTime() > now.getTime()) {
    throw httpError("birthDate must belong to an adult account", 400);
  }
  return parsed.toISOString();
}

function nullableEnum(value, field, allowed) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !allowed.has(value.trim())) {
    throw httpError(`Invalid ${field}`, 400);
  }
  return value.trim();
}

function enumArray(value, field, allowed, maximumItems) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw httpError(`Invalid ${field}`, 400);
  }
  const normalized = value.map((entry) => nullableEnum(entry, field, allowed));
  if (normalized.some((entry) => entry == null)) {
    throw httpError(`Invalid ${field}`, 400);
  }
  return Array.from(new Set(normalized));
}

function boundedInteger(value, field, minimum, maximum, fallback) {
  if (value == null || value === "") {
    return fallback;
  }
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw httpError(`Invalid ${field}`, 400);
  }
  return value;
}

function nullableBoundedInteger(value, field, minimum, maximum) {
  if (value == null || value === "") {
    return null;
  }
  return boundedInteger(value, field, minimum, maximum, minimum);
}

function nullableBoundedNumber(value, field, minimum, maximum) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw httpError(`Invalid ${field}`, 400);
  }
  return value;
}

function nullableBoolean(value, field) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "boolean") {
    throw httpError(`Invalid ${field}`, 400);
  }
  return value;
}

function booleanValue(value, field, fallback) {
  if (value == null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw httpError(`Invalid ${field}`, 400);
  }
  return value;
}

function nullableIdentifier(value, field) {
  if (value == null || value === "") {
    return null;
  }
  const identifier = asString(value);
  if (!appwriteIdentifier(identifier)) {
    throw httpError(`Invalid ${field}`, 400);
  }
  return identifier;
}

function identifierArray(value, field, maximumItems) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw httpError(`Invalid ${field}`, 400);
  }
  const identifiers = value.map((entry) => nullableIdentifier(entry, field));
  if (identifiers.some((entry) => entry == null)) {
    throw httpError(`Invalid ${field}`, 400);
  }
  return Array.from(new Set(identifiers));
}

function normalizedEmail(value) {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return email && email.length <= 320 ? email : null;
}

function asNullableISODate(value) {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

function resolveApiKey(req) {
  const runtimeKey = optionalHeader(req, "x-appwrite-key");
  if (typeof runtimeKey === "string" && runtimeKey.trim()) {
    return runtimeKey.trim();
  }
  throw new Error("Missing Appwrite function runtime key");
}

function optionalHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function equal(field, values) {
  return JSON.stringify({ method: "equal", attribute: field, values });
}

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}

function parseJSON(text) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function asString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

export function appwriteIdentifier(value) {
  const identifier = asString(value);
  return identifier && APPWRITE_IDENTIFIER_PATTERN.test(identifier) ? identifier : null;
}

export function pathSegment(value) {
  return encodeURIComponent(String(value));
}

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
