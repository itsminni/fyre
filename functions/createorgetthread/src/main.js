import { createHash } from "node:crypto";

const DEFAULT_MATCH_SUBJECT = "Match";
const AVATAR_TOKEN_CACHE_LIMIT = 256;
const AVATAR_TOKEN_CACHE_SAFETY_MS = 30_000;
const APPWRITE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;
const avatarTokenCache = new Map();

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);
    const otherUserId = appwriteIdentifier(body.otherUserId);
    const action = body.action == null ? "createOrGet" : asString(body.action);

    if (
      !otherUserId
      || otherUserId === currentUserId
      || (action !== "createOrGet" && action !== "peerProjection")
    ) {
      return json(res, { message: "Invalid participant" }, 400);
    }

    const participantIds = [currentUserId, otherUserId].sort();
    const expectedThreadId = stableThreadRowId(participantIds);
    const relationship = await findRelationshipRow(config, participantIds);
    if (
      !isCanonicalRelationshipRow(relationship, participantIds)
      || !relationshipAllowsThread(relationship, currentUserId, otherUserId)
    ) {
      return json(res, { message: "Relationship unavailable" }, 403);
    }

    const threadId = expectedThreadId;
    if (action === "peerProjection") {
      const participantRows = await listRows(config, config.threadParticipantsTableId, [
        equal("threadId", [threadId]),
        limit(3)
      ]);
      if (!isCanonicalParticipantSet(participantRows, threadId, participantIds)) {
        return json(res, { message: "Forbidden" }, 403);
      }
    } else {
      await ensureThreadAccess(config, threadId, currentUserId, otherUserId);
    }
    const peer = await fetchPeerProjection(config, otherUserId);

    return json(res, { threadId, peer }, 200);
  } catch (err) {
    error(`createorgetthread failed (${err?.statusCode ?? 500})`);
    const message = err?.statusCode === 401
      ? "Unauthorized"
      : err?.statusCode === 403
        ? "Forbidden"
        : "Unable to create thread";
    return json(res, { message }, err?.statusCode ?? 500);
  }
};

function json(res, payload, status) {
  console.log(JSON.stringify({ event: "createorgetthread.response", status }));
  return res.json(payload, status);
}

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredIdentifierEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
    databaseId: requiredIdentifierEnv("APPWRITE_DATABASE_ID"),
    profilesTableId: requiredIdentifierEnv("APPWRITE_PROFILES_TABLE_ID"),
    threadsTableId: requiredIdentifierEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredIdentifierEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    relationshipsTableId: requiredIdentifierEnv("APPWRITE_RELATIONSHIPS_TABLE_ID"),
    avatarsBucketId: requiredIdentifierEnv("APPWRITE_AVATARS_BUCKET_ID"),
    avatarTokenTtlSeconds: requiredIntegerEnv("APPWRITE_AVATAR_TOKEN_TTL_SECONDS", 300, 900)
  };
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

function resolveApiKey(req) {
  const runtimeKey = optionalHeader(req, "x-appwrite-key");
  if (typeof runtimeKey === "string" && runtimeKey.trim().length > 0) {
    return runtimeKey.trim();
  }
  throw new Error("Missing Appwrite function runtime key");
}

export function sharedConversationPermissions(userIds) {
  return userIds.map((userId) => `read("user:${userId}")`);
}

export function participantRowPermissions(userIds) {
  return sharedConversationPermissions(userIds);
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

async function createRow(config, tableId, rowId, data, permissions) {
  return request(config, "POST", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`, {
    rowId,
    data,
    permissions
  });
}

async function updateRow(config, tableId, rowId, data, permissions) {
  return request(config, "PATCH", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`, {
    data,
    permissions
  });
}

async function ensureThreadAccess(config, threadId, currentUserId, otherUserId) {
  const participantIds = [currentUserId, otherUserId].sort();
  if (threadId !== stableThreadRowId(participantIds)) {
    throw authError("Invalid thread id");
  }
  const permissions = sharedConversationPermissions(participantIds);
  const existingParticipantRows = await listRows(config, config.threadParticipantsTableId, [
    equal("threadId", [threadId]),
    limit(3)
  ]);
  if (!isCanonicalParticipantSubset(existingParticipantRows, threadId, participantIds)) {
    throw authError("Invalid thread participants");
  }
  await createOrReuseThreadRow(config, threadId, currentUserId, permissions);
  await Promise.all([
    ensureThreadParticipant(config, threadId, currentUserId, participantIds),
    ensureThreadParticipant(config, threadId, otherUserId, participantIds)
  ]);

  const participantRows = await listRows(config, config.threadParticipantsTableId, [
    equal("threadId", [threadId]),
    limit(3)
  ]);
  if (!isCanonicalParticipantSet(participantRows, threadId, participantIds)) {
    throw authError("Invalid thread participants");
  }
}

async function createOrReuseThreadRow(config, threadId, currentUserId, permissions) {
  const existingThread = await getRowIfExists(config, config.threadsTableId, threadId);
  if (existingThread?.$id) {
    await updateRow(
      config,
      config.threadsTableId,
      threadId,
      threadPayloadFromExisting(existingThread, threadId, currentUserId),
      permissions
    );
    return threadId;
  }

  try {
    await createRow(
      config,
      config.threadsTableId,
      threadId,
      threadPayloadFromExisting(null, threadId, currentUserId),
      permissions
    );
  } catch (err) {
    if (!isAlreadyExistsError(err)) {
      throw new Error(`Failed creating row in ${config.threadsTableId}: ${err?.message ?? err}`);
    }
  }

  return threadId;
}

async function ensureThreadParticipant(config, threadId, userId, participantIds) {
  const participantRowId = stableParticipantRowId(threadId, userId);
  const permissions = participantRowPermissions(participantIds);
  const existingParticipant = await getRowIfExists(config, config.threadParticipantsTableId, participantRowId);

  if (existingParticipant?.$id) {
    await updateRow(
      config,
      config.threadParticipantsTableId,
      participantRowId,
      participantPayloadFromExisting(existingParticipant, threadId, userId),
      permissions
    );
    return participantRowId;
  }

  try {
    const participantRow = await createRow(
      config,
      config.threadParticipantsTableId,
      participantRowId,
      participantPayloadFromExisting(null, threadId, userId),
      permissions
    );
    return participantRow?.$id ?? null;
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      return participantRowId;
    }
    throw new Error(`Failed creating participant row in ${config.threadParticipantsTableId}: ${err?.message ?? err}`);
  }
}

async function findRelationshipRow(config, userIds) {
  const stableRelationship = await getRowIfExists(
    config,
    config.relationshipsTableId,
    stableRelationshipRowId(userIds)
  );
  if (stableRelationship?.$id) {
    return stableRelationship;
  }

  return null;
}

export function isCanonicalRelationshipRow(relationship, userIds) {
  if (
    !relationship
    || typeof relationship !== "object"
    || !Array.isArray(userIds)
    || userIds.length !== 2
    || userIds[0] === userIds[1]
  ) {
    return false;
  }

  const pairKey = userIds.join(":");
  const expectedThreadId = stableThreadRowId(userIds);
  return asString(relationship.$id) === stableRelationshipRowId(userIds)
    && asString(relationship.pairKey) === pairKey
    && asString(relationship.userAId) === userIds[0]
    && asString(relationship.userBId) === userIds[1]
    && (relationship.threadId == null || asString(relationship.threadId) === expectedThreadId);
}

function relationshipAllowsThread(relationship, currentUserId, otherUserId) {
  const currentState = relationshipStateForUser(relationship, currentUserId);
  const otherState = relationshipStateForUser(relationship, otherUserId);

  return currentState === "matched"
    && otherState === "matched";
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

async function getRowIfExists(config, tableId, rowId) {
  try {
    return await request(config, "GET", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

export function threadPayloadFromExisting(threadRow, threadId, currentUserId) {
  return {
    threadId,
    createdByUserId: asString(threadRow?.createdByUserId) ?? currentUserId,
    subject: DEFAULT_MATCH_SUBJECT,
    status: asString(threadRow?.status) ?? "active",
    lastMessageText: threadRow?.lastMessageText ?? null,
    lastMessageAt: threadRow?.lastMessageAt ?? null
  };
}

function participantPayloadFromExisting(participantRow, threadId, userId) {
  return {
    threadId,
    userId,
    role: "participant",
    lastReadAt: participantRow?.lastReadAt ?? null,
    muted: typeof participantRow?.muted === "boolean" ? participantRow.muted : false,
    pinned: typeof participantRow?.pinned === "boolean" ? participantRow.pinned : false,
    notificationsEnabled: typeof participantRow?.notificationsEnabled === "boolean"
      ? participantRow.notificationsEnabled
      : true
  };
}

export function isCanonicalParticipantSubset(rows, threadId, userIds) {
  if (
    !Array.isArray(rows)
    || !Array.isArray(userIds)
    || rows.length > userIds.length
    || userIds.length !== 2
    || new Set(userIds).size !== 2
  ) {
    return false;
  }

  const seenUserIds = new Set();
  for (const row of rows) {
    const userId = asString(row?.userId);
    if (
      !userId
      || !userIds.includes(userId)
      || seenUserIds.has(userId)
      || asString(row?.threadId) !== threadId
      || asString(row?.$id) !== stableParticipantRowId(threadId, userId)
    ) {
      return false;
    }
    seenUserIds.add(userId);
  }

  return true;
}

export function isCanonicalParticipantSet(rows, threadId, userIds) {
  return Array.isArray(rows)
    && Array.isArray(userIds)
    && rows.length === userIds.length
    && isCanonicalParticipantSubset(rows, threadId, userIds);
}

async function fetchPeerProjection(config, userId) {
  let profile = await getRowIfExists(config, config.profilesTableId, userId);
  if (!isProfileForUser(profile, userId)) {
    const rows = await listRows(config, config.profilesTableId, [
      equal("userId", [userId]),
      limit(2)
    ]);
    const matchingRows = rows.filter((row) => isProfileForUser(row, userId));
    profile = matchingRows.length === 1 ? matchingRows[0] : null;
  }

  const projection = peerProjectionFromProfile(profile, userId);
  const avatarFileId = normalizedAvatarFileId(profile?.avatarFileId);
  if (!avatarFileId) {
    return projection;
  }

  try {
    return {
      ...projection,
      avatarUrl: await temporaryAvatarURL(config, avatarFileId)
    };
  } catch {
    return projection;
  }
}

function isProfileForUser(profile, userId) {
  return profile && typeof profile === "object" && asString(profile.userId) === userId;
}

export function peerProjectionFromProfile(profile, userId) {
  const validProfile = isProfileForUser(profile, userId) ? profile : null;
  const firstName = displayNamePart(validProfile?.firstName);
  const lastName = displayNamePart(validProfile?.lastName);
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || DEFAULT_MATCH_SUBJECT;

  return {
    userId,
    displayName,
    avatarUrl: null,
    presenceUpdatedAt: asIsoDate(validProfile?.presenceUpdatedAt),
    lastSeenAt: asIsoDate(validProfile?.lastSeenAt)
  };
}

function displayNamePart(value) {
  const text = asString(value);
  return text ? text.replace(/\s+/g, " ").slice(0, 100) : null;
}

function asIsoDate(value) {
  const text = asString(value);
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function normalizedAvatarFileId(value) {
  const fileId = asString(value);
  return fileId && /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(fileId) ? fileId : null;
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
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const requestError = new Error(payload.message ?? `Request failed with status ${response.status}`);
    requestError.statusCode = response.status;
    requestError.type = payload.type ?? null;
    throw requestError;
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

export function appwriteIdentifier(value) {
  const identifier = asString(value);
  return identifier && APPWRITE_IDENTIFIER_PATTERN.test(identifier) ? identifier : null;
}

export function pathSegment(value) {
  return encodeURIComponent(String(value));
}

function isAlreadyExistsError(err) {
  const message = String(err?.message ?? err ?? "").toLowerCase();
  return message.includes("already exists");
}

function isNotFoundError(err) {
  if (err?.statusCode === 404) {
    return true;
  }

  const message = String(err?.message ?? err ?? "").toLowerCase();
  return message.includes("not found") || message.includes("could not be found");
}

export function stableThreadRowId(userIds) {
  return stableRowId("th", userIds.join(":"));
}

export function stableParticipantRowId(threadId, userId) {
  return stableRowId("tp", `${threadId}:${userId}`);
}

export function stableRelationshipRowId(userIds) {
  return stableRowId("rl", userIds.join(":"));
}

function stableRowId(prefix, seed) {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}
