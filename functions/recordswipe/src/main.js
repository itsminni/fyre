import { createHash } from "node:crypto";

const DEFAULT_MATCH_SUBJECT = "Match";
const MAX_TRANSACTION_ATTEMPTS = 4;
const TRANSACTION_TTL_SECONDS = 30;
const APPWRITE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);
    const otherUserId = appwriteIdentifier(body.otherUserId);
    const decision = asDecision(body.decision);

    if (!otherUserId || otherUserId === currentUserId || !decision) {
      return json(res, { message: "Invalid swipe payload" }, 400);
    }

    const result = await recordSwipeWithTransaction(
      config,
      currentUserId,
      otherUserId,
      decision
    );
    return json(res, result, 200);
  } catch (err) {
    error(`recordswipe failed (${err?.statusCode ?? 500})`);
    const message = err?.statusCode === 401
      ? "Unauthorized"
      : err?.statusCode === 403
        ? "Forbidden"
        : err?.statusCode === 404
          ? "Interaction unavailable"
          : "Unable to record swipe";
    return json(res, { message }, err?.statusCode ?? 500);
  }
};

function json(res, payload, status) {
  console.log(JSON.stringify({ event: "recordswipe.response", status }));
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
    swipesTableId: requiredIdentifierEnv("APPWRITE_SWIPES_TABLE_ID"),
    matchesTableId: requiredIdentifierEnv("APPWRITE_MATCHES_TABLE_ID"),
    threadsTableId: requiredIdentifierEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredIdentifierEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    relationshipsTableId: requiredIdentifierEnv("APPWRITE_RELATIONSHIPS_TABLE_ID")
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
    const parsed = JSON.parse(req.bodyText);
    return parsed && typeof parsed === "object" ? parsed : {};
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
    throw httpError("Authenticated user mismatch", 403);
  }

  if (bodyValue && bodyValue !== jwtUserId) {
    throw httpError("Authenticated user mismatch", 403);
  }

  return jwtUserId;
}

async function fetchUserIdFromJwt(config) {
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
  if (!response.ok) {
    throw httpError("Invalid user JWT", 401);
  }
  const userId = appwriteIdentifier(payload.$id);
  if (!userId) {
    throw httpError("Invalid user JWT", 401);
  }
  return userId;
}

function resolveApiKey(req) {
  const runtimeKey = optionalHeader(req, "x-appwrite-key");
  if (typeof runtimeKey === "string" && runtimeKey.trim().length > 0) {
    return runtimeKey.trim();
  }
  throw new Error("Missing Appwrite function runtime key");
}

async function recordSwipeWithTransaction(config, currentUserId, otherUserId, decision) {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let transactionId = null;

    try {
      transactionId = await createTransaction(config);

      const currentProfile = await getRowIfExists(
        config,
        config.profilesTableId,
        currentUserId,
        transactionId
      );
      if (!isCanonicalTargetProfile(currentProfile, currentUserId)) {
        throw httpError("Current profile unavailable", 403);
      }

      const targetProfile = await getRowIfExists(
        config,
        config.profilesTableId,
        otherUserId,
        transactionId
      );
      if (!isCanonicalTargetProfile(targetProfile, otherUserId)) {
        throw httpError("Target profile unavailable", 404);
      }

      const userIds = [currentUserId, otherUserId].sort();
      let relationship = await getCanonicalRelationship(config, userIds, transactionId);
      if (relationshipBlocksInteraction(relationship, currentUserId, otherUserId)) {
        throw httpError("Interaction unavailable", 403);
      }

      const now = new Date().toISOString();
      const existingSwipe = await findSwipeRow(
        config,
        currentUserId,
        otherUserId,
        null,
        false,
        transactionId
      );
      await upsertSwipeRow(config, existingSwipe, {
        swipeKey: `${currentUserId}:${otherUserId}`,
        fromUserId: currentUserId,
        toUserId: otherUserId,
        decision,
        createdAt: asIsoDate(existingSwipe?.createdAt) ?? now,
        serverRecordedAt: now
      }, currentUserId, transactionId);

      // Re-read both decisions in the same transaction. This is the source of
      // truth used to derive the relationship and match state at commit time.
      const currentSwipe = await findSwipeRow(
        config,
        currentUserId,
        otherUserId,
        decision,
        true,
        transactionId
      );
      const reverseSwipe = await findSwipeRow(
        config,
        otherUserId,
        currentUserId,
        null,
        true,
        transactionId
      );
      if (!currentSwipe) {
        throw httpError("Swipe transaction is inconsistent", 409);
      }

      relationship = await getCanonicalRelationship(config, userIds, transactionId);
      if (relationshipBlocksInteraction(relationship, currentUserId, otherUserId)) {
        throw httpError("Interaction unavailable", 403);
      }

      const result = await reconcilePairState(config, {
        currentUserId,
        otherUserId,
        currentSwipe,
        reverseSwipe,
        relationship,
        now,
        transactionId
      });

      await commitTransaction(config, transactionId);
      return result;
    } catch (err) {
      if (transactionId) {
        await rollbackTransaction(config, transactionId);
      }
      if (isConflictError(err) && attempt < MAX_TRANSACTION_ATTEMPTS) {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Unable to commit swipe transaction");
}

async function reconcilePairState(config, context) {
  const {
    currentUserId,
    otherUserId,
    currentSwipe,
    reverseSwipe,
    relationship,
    now,
    transactionId
  } = context;
  const userIds = [currentUserId, otherUserId].sort();
  const currentDecision = asDecision(currentSwipe.decision);
  const reverseDecision = asDecision(reverseSwipe?.decision);
  const otherExistingState = relationshipStateForUser(relationship, otherUserId);
  const otherArchived = otherExistingState === "archived";
  const shouldMatch = currentDecision === "liked"
    && reverseDecision === "liked"
    && !otherArchived;
  const existingMatch = await getCanonicalMatch(config, userIds, transactionId);

  if (shouldMatch) {
    const threadId = stableThreadRowId(userIds);
    const matchedAt = asIsoDate(relationship?.matchedAt)
      ?? asIsoDate(existingMatch?.matchedAt)
      ?? now;
    const permissions = sharedRelationshipPermissions(userIds);

    await upsertRelationshipRow(config, relationship, {
      pairKey: userIds.join(":"),
      userAId: userIds[0],
      userBId: userIds[1],
      userAState: "matched",
      userBState: "matched",
      threadId,
      matchedAt,
      createdAt: asIsoDate(relationship?.createdAt) ?? now,
      updatedAt: now
    }, permissions, transactionId);

    await ensureThreadAccess(
      config,
      threadId,
      currentUserId,
      otherUserId,
      transactionId
    );

    const matchId = stableMatchRowId(userIds);
    await upsertMatchRow(config, existingMatch, matchId, {
      matchKey: userIds.join(":"),
      userAId: userIds[0],
      userBId: userIds[1],
      threadId,
      createdAt: asIsoDate(existingMatch?.createdAt) ?? now,
      matchedAt
    }, permissions, transactionId);

    return {
      matched: true,
      matchId,
      threadId,
      relationshipState: "matched"
    };
  }

  const currentState = currentDecision === "liked" ? "liked" : "none";
  const otherState = otherArchived
    ? "archived"
    : reverseDecision === "liked" ? "liked" : "none";
  const permissions = sharedRelationshipPermissions(userIds);
  const relationshipPayload = {
    pairKey: userIds.join(":"),
    userAId: userIds[0],
    userBId: userIds[1],
    userAState: userIds[0] === currentUserId ? currentState : otherState,
    userBState: userIds[0] === currentUserId ? otherState : currentState,
    threadId: null,
    matchedAt: null,
    createdAt: asIsoDate(relationship?.createdAt) ?? now,
    updatedAt: now
  };

  if (relationship || currentState !== "none" || otherState !== "none") {
    await upsertRelationshipRow(
      config,
      relationship,
      relationshipPayload,
      permissions,
      transactionId
    );
  }

  if (existingMatch?.$id) {
    await deleteRow(
      config,
      config.matchesTableId,
      existingMatch.$id,
      transactionId
    );
  }

  return {
    matched: false,
    relationshipState: currentState
  };
}

export function isCanonicalTargetProfile(profile, userId) {
  return Boolean(
    profile
    && asString(profile.$id) === userId
    && asString(profile.userId) === userId
    && profile.profileReady === true
  );
}

export function sharedRelationshipPermissions(userIds) {
  return userIds.map((userId) => `read("user:${userId}")`);
}

export function participantRowPermissions(userIds) {
  return sharedRelationshipPermissions(userIds);
}

export function swipePermissions(userId) {
  return [`read("user:${userId}")`];
}

async function upsertSwipeRow(config, existingSwipe, data, userId, transactionId) {
  if (existingSwipe?.$id) {
    await updateRow(
      config,
      config.swipesTableId,
      existingSwipe.$id,
      data,
      swipePermissions(userId),
      transactionId
    );
    return existingSwipe.$id;
  }

  const rowId = stableSwipeRowId(data.swipeKey);
  await createRow(
    config,
    config.swipesTableId,
    rowId,
    data,
    swipePermissions(userId),
    transactionId
  );
  return rowId;
}

async function upsertRelationshipRow(config, existingRelationship, data, permissions, transactionId) {
  const relationshipId = stableRelationshipRowId([data.userAId, data.userBId]);
  if (existingRelationship?.$id) {
    await updateRow(
      config,
      config.relationshipsTableId,
      relationshipId,
      data,
      permissions,
      transactionId
    );
    return relationshipId;
  }

  await createRow(
    config,
    config.relationshipsTableId,
    relationshipId,
    data,
    permissions,
    transactionId
  );
  return relationshipId;
}

async function upsertMatchRow(config, existingMatch, matchId, data, permissions, transactionId) {
  if (existingMatch?.$id) {
    await updateRow(
      config,
      config.matchesTableId,
      matchId,
      data,
      permissions,
      transactionId
    );
    return matchId;
  }

  await createRow(
    config,
    config.matchesTableId,
    matchId,
    data,
    permissions,
    transactionId
  );
  return matchId;
}

async function ensureThreadAccess(config, threadId, currentUserId, otherUserId, transactionId) {
  const participantIds = [currentUserId, otherUserId].sort();
  const permissions = sharedRelationshipPermissions(participantIds);
  if (threadId !== stableThreadRowId(participantIds)) {
    throw httpError("Invalid thread id", 409);
  }
  const existingThread = await getRowIfExists(
    config,
    config.threadsTableId,
    threadId,
    transactionId
  );
  const existingParticipants = await listRows(config, config.threadParticipantsTableId, [
    equal("threadId", [threadId]),
    limit(3)
  ], transactionId);

  if (!participantRowsBelongToPair(existingParticipants, threadId, participantIds)) {
    throw httpError("Thread participants do not match", 403);
  }

  const threadData = threadPayloadFromExisting(
    existingThread,
    threadId,
    currentUserId,
    participantIds
  );
  if (existingThread?.$id) {
    await updateRow(
      config,
      config.threadsTableId,
      threadId,
      threadData,
      permissions,
      transactionId
    );
  } else {
    await createRow(
      config,
      config.threadsTableId,
      threadId,
      threadData,
      permissions,
      transactionId
    );
  }

  for (const userId of participantIds) {
    await ensureThreadParticipant(
      config,
      threadId,
      userId,
      participantIds,
      transactionId
    );
  }

  const finalParticipants = await listRows(config, config.threadParticipantsTableId, [
    equal("threadId", [threadId]),
    limit(3)
  ], transactionId);
  if (
    finalParticipants.length !== 2
    || !participantRowsBelongToPair(finalParticipants, threadId, participantIds)
  ) {
    throw httpError("Thread participants do not match", 403);
  }
}

async function ensureThreadParticipant(config, threadId, userId, participantIds, transactionId) {
  const participantRowId = stableParticipantRowId(threadId, userId);
  const existingParticipant = await getRowIfExists(
    config,
    config.threadParticipantsTableId,
    participantRowId,
    transactionId
  );
  if (existingParticipant && (
    asString(existingParticipant.$id) !== participantRowId
    || asString(existingParticipant.threadId) !== threadId
    || asString(existingParticipant.userId) !== userId
  )) {
    throw httpError("Invalid thread participant", 409);
  }

  const data = participantPayloadFromExisting(existingParticipant, threadId, userId);
  const permissions = participantRowPermissions(participantIds);
  if (existingParticipant?.$id) {
    await updateRow(
      config,
      config.threadParticipantsTableId,
      participantRowId,
      data,
      permissions,
      transactionId
    );
  } else {
    await createRow(
      config,
      config.threadParticipantsTableId,
      participantRowId,
      data,
      permissions,
      transactionId
    );
  }
}

function threadPayloadFromExisting(threadRow, threadId, currentUserId, participantIds) {
  const existingCreatedByUserId = asString(threadRow?.createdByUserId);
  return {
    threadId,
    createdByUserId: participantIds.includes(existingCreatedByUserId)
      ? existingCreatedByUserId
      : currentUserId,
    subject: DEFAULT_MATCH_SUBJECT,
    status: asString(threadRow?.status) ?? "active",
    lastMessageText: threadRow?.lastMessageText ?? null,
    lastMessageAt: asIsoDate(threadRow?.lastMessageAt)
  };
}

function participantPayloadFromExisting(participantRow, threadId, userId) {
  return {
    threadId,
    userId,
    role: asString(participantRow?.role) ?? "participant",
    lastReadAt: asIsoDate(participantRow?.lastReadAt),
    muted: typeof participantRow?.muted === "boolean" ? participantRow.muted : false,
    pinned: typeof participantRow?.pinned === "boolean" ? participantRow.pinned : false,
    notificationsEnabled: typeof participantRow?.notificationsEnabled === "boolean"
      ? participantRow.notificationsEnabled
      : true
  };
}

async function getCanonicalRelationship(config, userIds, transactionId) {
  const relationshipId = stableRelationshipRowId(userIds);
  const relationship = await getRowIfExists(
    config,
    config.relationshipsTableId,
    relationshipId,
    transactionId
  );
  if (!relationship) {
    return null;
  }
  if (
    asString(relationship.$id) !== relationshipId
    || !relationshipRowBelongsToPair(relationship, userIds)
  ) {
    throw httpError("Invalid relationship row", 409);
  }
  return relationship;
}

async function getCanonicalMatch(config, userIds, transactionId) {
  const matchId = stableMatchRowId(userIds);
  const match = await getRowIfExists(
    config,
    config.matchesTableId,
    matchId,
    transactionId
  );
  if (!match) {
    return null;
  }
  if (asString(match.$id) !== matchId || !isCanonicalMatchRow(match, userIds)) {
    throw httpError("Invalid match row", 409);
  }
  return match;
}

async function findSwipeRow(
  config,
  fromUserId,
  toUserId,
  decision = null,
  requireServerRecord = false,
  transactionId = null
) {
  const swipeKey = `${fromUserId}:${toUserId}`;
  const stableSwipe = await getRowIfExists(
    config,
    config.swipesTableId,
    stableSwipeRowId(swipeKey),
    transactionId
  );
  if (stableSwipe) {
    if (!isCanonicalSwipeRow(stableSwipe, fromUserId, toUserId, null, false)) {
      throw httpError("Invalid swipe row", 409);
    }
    return isCanonicalSwipeRow(
      stableSwipe,
      fromUserId,
      toUserId,
      decision,
      requireServerRecord
    ) ? stableSwipe : null;
  }

  const rows = await listRows(config, config.swipesTableId, [
    equal("swipeKey", [swipeKey]),
    limit(2)
  ], transactionId);
  if (rows.length === 0) {
    return null;
  }
  if (rows.length !== 1 || !isCanonicalSwipeRow(rows[0], fromUserId, toUserId, null, false)) {
    throw httpError("Invalid swipe rows", 409);
  }
  return isCanonicalSwipeRow(
    rows[0],
    fromUserId,
    toUserId,
    decision,
    requireServerRecord
  ) ? rows[0] : null;
}

export function relationshipRowBelongsToPair(row, userIds) {
  if (!row || typeof row !== "object" || !Array.isArray(userIds) || userIds.length !== 2) {
    return false;
  }
  const sortedUserIds = [...userIds].sort();
  return asString(row.pairKey) === sortedUserIds.join(":")
    && asString(row.userAId) === sortedUserIds[0]
    && asString(row.userBId) === sortedUserIds[1]
    && (row.threadId == null || asString(row.threadId) === stableThreadRowId(sortedUserIds));
}

export function isCanonicalSwipeRow(row, fromUserId, toUserId, decision = null, requireServerRecord = false) {
  if (!row || typeof row !== "object") {
    return false;
  }
  const expectedKey = `${fromUserId}:${toUserId}`;
  const storedDecision = asDecision(row.decision);
  return asString(row.swipeKey) === expectedKey
    && asString(row.fromUserId) === fromUserId
    && asString(row.toUserId) === toUserId
    && Boolean(storedDecision)
    && (!decision || storedDecision === decision)
    && (!requireServerRecord || Boolean(asIsoDate(row.serverRecordedAt)));
}

export function isCanonicalMatchRow(row, userIds) {
  if (!row || typeof row !== "object" || !Array.isArray(userIds) || userIds.length !== 2) {
    return false;
  }
  const sortedUserIds = [...userIds].sort();
  return asString(row.matchKey) === sortedUserIds.join(":")
    && asString(row.userAId) === sortedUserIds[0]
    && asString(row.userBId) === sortedUserIds[1]
    && asString(row.threadId) === stableThreadRowId(sortedUserIds);
}

export function participantRowsBelongToPair(rows, threadId, userIds) {
  if (!Array.isArray(rows) || rows.length > 2) {
    return false;
  }
  const expectedUserIds = new Set(userIds);
  const seenUserIds = new Set();
  for (const row of rows) {
    const userId = asString(row?.userId);
    if (!userId
      || !expectedUserIds.has(userId)
      || seenUserIds.has(userId)
      || asString(row?.threadId) !== threadId
      || asString(row?.$id) !== stableParticipantRowId(threadId, userId)) {
      return false;
    }
    seenUserIds.add(userId);
  }
  return true;
}

function relationshipBlocksInteraction(relationship, currentUserId, otherUserId) {
  if (!relationship) {
    return false;
  }
  return relationshipStateForUser(relationship, currentUserId) === "blocked"
    || relationshipStateForUser(relationship, otherUserId) === "blocked";
}

function relationshipStateForUser(relationship, userId) {
  if (relationship?.userAId === userId) {
    return asRelationshipState(relationship.userAState);
  }
  if (relationship?.userBId === userId) {
    return asRelationshipState(relationship.userBState);
  }
  return "none";
}

function asRelationshipState(value) {
  return ["none", "liked", "matched", "archived", "blocked"].includes(value)
    ? value
    : "none";
}

async function getRowIfExists(config, tableId, rowId, transactionId = null) {
  try {
    return await getRow(config, tableId, rowId, transactionId);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

async function getRow(config, tableId, rowId, transactionId = null) {
  return request(
    config,
    "GET",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`,
    undefined,
    [],
    transactionId ? { transactionId } : {}
  );
}

async function listRows(config, tableId, queries, transactionId = null) {
  const payload = await request(
    config,
    "GET",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`,
    undefined,
    queries,
    transactionId ? { transactionId, ttl: 0 } : { ttl: 0 }
  );
  return Array.isArray(payload.rows) ? payload.rows : [];
}

async function createRow(config, tableId, rowId, data, permissions, transactionId) {
  return request(
    config,
    "POST",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`,
    { rowId, data, permissions, transactionId }
  );
}

async function updateRow(config, tableId, rowId, data, permissions, transactionId) {
  return request(
    config,
    "PATCH",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`,
    { data, permissions, transactionId }
  );
}

async function deleteRow(config, tableId, rowId, transactionId) {
  return request(
    config,
    "DELETE",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`,
    { transactionId }
  );
}

async function createTransaction(config) {
  const transaction = await request(config, "POST", "/tablesdb/transactions", {
    ttl: TRANSACTION_TTL_SECONDS
  });
  const transactionId = appwriteIdentifier(transaction.$id);
  if (!transactionId) {
    throw new Error("Appwrite did not return a transaction id");
  }
  return transactionId;
}

async function commitTransaction(config, transactionId) {
  await request(
    config,
    "PATCH",
    `/tablesdb/transactions/${pathSegment(transactionId)}`,
    { commit: true }
  );
}

async function rollbackTransaction(config, transactionId) {
  try {
    await request(
      config,
      "PATCH",
      `/tablesdb/transactions/${pathSegment(transactionId)}`,
      { rollback: true }
    );
  } catch {
    // A committed, expired, or conflict-aborted transaction needs no cleanup.
  }
}

async function request(config, method, path, body, queries = [], queryParameters = {}) {
  const url = new URL(`${config.endpoint}${path}`);
  for (const query of queries) {
    url.searchParams.append("queries[]", query);
  }
  for (const [key, value] of Object.entries(queryParameters)) {
    url.searchParams.set(key, String(value));
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
  const payload = parseJSONSafely(text);
  if (!response.ok) {
    const requestError = httpError(
      payload.message ?? `Request failed with status ${response.status}`,
      response.status
    );
    requestError.type = asString(payload.type);
    throw requestError;
  }
  return payload;
}

function parseJSONSafely(text) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function equal(field, values) {
  return JSON.stringify({ method: "equal", attribute: field, values });
}

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}

function stableThreadRowId(userIds) {
  return stableRowId("th", userIds.join(":"));
}

export function stableParticipantRowId(threadId, userId) {
  return stableRowId("tp", `${threadId}:${userId}`);
}

function stableMatchRowId(userIds) {
  return stableRowId("mt", userIds.join(":"));
}

function stableSwipeRowId(swipeKey) {
  return stableRowId("sw", swipeKey);
}

function stableRelationshipRowId(userIds) {
  return stableRowId("rl", userIds.join(":"));
}

function stableRowId(prefix, seed) {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

function isConflictError(err) {
  const message = String(err?.message ?? "").toLowerCase();
  const type = String(err?.type ?? "").toLowerCase();
  return err?.statusCode === 409
    || type.includes("conflict")
    || message.includes("already exists");
}

function isNotFoundError(err) {
  if (err?.statusCode === 404) {
    return true;
  }
  const message = String(err?.message ?? "").toLowerCase();
  return message.includes("not found") || message.includes("could not be found");
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

function asIsoDate(value) {
  const text = asString(value);
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function asDecision(value) {
  return value === "liked" || value === "passed" ? value : null;
}

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
