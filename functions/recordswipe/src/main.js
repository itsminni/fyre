import { createHash } from "node:crypto";

const DEFAULT_MATCH_SUBJECT = "Fyre match";
const PLACEHOLDER_MATCH_SUBJECTS = new Set(["Match", DEFAULT_MATCH_SUBJECT]);

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);
    const otherUserId = asString(body.otherUserId);
    const otherUserName = asString(body.otherUserName);
    const decision = asDecision(body.decision);

    if (!otherUserId || otherUserId === currentUserId || !decision) {
      return json(res, { message: "Invalid swipe payload" }, 400);
    }

    const now = new Date().toISOString();
    const existingRelationship = config.relationshipsTableId
      ? await findRelationshipRow(config, currentUserId, otherUserId)
      : null;

    if (relationshipBlocksInteraction(existingRelationship, currentUserId, otherUserId)) {
      return json(res, { message: "Interaction unavailable" }, 403);
    }

    const swipeKey = `${currentUserId}:${otherUserId}`;
    const existingSwipe = await findSwipeRow(config, currentUserId, otherUserId);

    const swipePayload = {
      swipeKey,
      fromUserId: currentUserId,
      toUserId: otherUserId,
      decision,
      createdAt: existingSwipe?.createdAt ?? now
    };

    if (existingSwipe?.$id) {
      await updateRow(config, config.swipesTableId, existingSwipe.$id, swipePayload, swipePermissions(currentUserId));
    } else {
      await createOrUpdateRow(
        config,
        config.swipesTableId,
        stableSwipeRowId(swipeKey),
        swipePayload,
        swipePermissions(currentUserId)
      );
    }

    if (config.relationshipsTableId) {
      await upsertRelationshipForSwipe(
        config,
        existingRelationship,
        currentUserId,
        otherUserId,
        decision,
        now
      );
    }

    if (decision !== "liked") {
      return json(res, { matched: false, relationshipState: "none" }, 200);
    }

    // A match exists only when the opposite swipe was already a like.
    const reverseSwipe = await findSwipeRow(config, otherUserId, currentUserId, "liked");

    if (!reverseSwipe?.$id) {
      return json(res, { matched: false, relationshipState: "liked" }, 200);
    }

    const userIds = [currentUserId, otherUserId].sort();
    const matchKey = userIds.join(":");
    const permissions = participantPermissions(userIds);
    const existingMatch = await findMatchRow(config, userIds);

    if (existingMatch?.threadId) {
      await ensureThreadAccess(config, existingMatch.threadId, currentUserId, otherUserId, otherUserName);
      if (config.relationshipsTableId) {
        await upsertMatchedRelationship(
          config,
          existingRelationship,
          currentUserId,
          otherUserId,
          existingMatch.threadId,
          now
        );
      }
      await updateRow(config, config.matchesTableId, existingMatch.$id, {
        matchKey,
        userAId: userIds[0],
        userBId: userIds[1],
        threadId: existingMatch.threadId,
        createdAt: existingMatch.createdAt ?? now,
        matchedAt: now
      }, permissions);
      return json(res, {
        matched: true,
        matchId: existingMatch.$id,
        threadId: existingMatch.threadId,
        relationshipState: "matched"
      }, 200);
    }

    const threadId = await createThreadWithParticipants(config, currentUserId, otherUserId, otherUserName);
    if (config.relationshipsTableId) {
      await upsertMatchedRelationship(config, existingRelationship, currentUserId, otherUserId, threadId, now);
    }

    if (existingMatch?.$id) {
      await updateRow(config, config.matchesTableId, existingMatch.$id, {
        matchKey,
        userAId: userIds[0],
        userBId: userIds[1],
        threadId,
        createdAt: existingMatch.createdAt ?? now,
        matchedAt: now
      }, permissions);
      return json(res, { matched: true, matchId: existingMatch.$id, threadId, relationshipState: "matched" }, 200);
    }

    const matchId = stableMatchRowId(userIds);
    await createOrReuseMatchRow(config, matchId, {
      matchKey,
      userAId: userIds[0],
      userBId: userIds[1],
      threadId,
      createdAt: now,
      matchedAt: now
    }, permissions);

    return json(res, { matched: true, matchId, threadId, relationshipState: "matched" }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return json(res, { message: err?.statusCode === 403 ? "Forbidden" : "Unable to record swipe" }, err?.statusCode ?? 500);
  }
};

function json(res, payload, status) {
  console.log(`RESULT_JSON:${JSON.stringify(payload)}`);
  return res.json(payload, status);
}

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    swipesTableId: requiredEnv("APPWRITE_SWIPES_TABLE_ID"),
    matchesTableId: requiredEnv("APPWRITE_MATCHES_TABLE_ID"),
    threadsTableId: requiredEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    relationshipsTableId: optionalEnv("APPWRITE_RELATIONSHIPS_TABLE_ID"),
    allowBodyUserIdFallback: optionalEnv("APPWRITE_ALLOW_BODY_USER_ID_FALLBACK") === "true"
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

function optionalHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

async function resolveCurrentUserId(config, req, body) {
  const headerValue = optionalHeader(req, "x-appwrite-user-id");
  const bodyValue = asString(body.currentUserId);
  const jwtUserId = await fetchUserIdFromJwt(config);
  const authenticatedUserId = jwtUserId ?? asString(headerValue);

  if (jwtUserId && headerValue && asString(headerValue) !== jwtUserId) {
    throw authError("Authenticated user mismatch");
  }

  if (authenticatedUserId) {
    if (bodyValue && bodyValue !== authenticatedUserId) {
      throw authError("Authenticated user mismatch");
    }
    return authenticatedUserId;
  }

  if (bodyValue && config.allowBodyUserIdFallback) {
    return bodyValue;
  }

  throw authError("Missing authenticated user id");
}

async function fetchUserIdFromJwt(config) {
  if (!config.userJwt) {
    return null;
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
    throw authError(payload.message ?? "Invalid user JWT");
  }
  return asString(payload.$id);
}

function authError(message) {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

function resolveApiKey(req) {
  const runtimeKey = process.env.APPWRITE_FUNCTION_API_KEY ?? process.env.APPWRITE_API_KEY;
  if (typeof runtimeKey === "string" && runtimeKey.trim().length > 0) {
    return runtimeKey.trim();
  }
  return requiredHeader(req, "x-appwrite-key");
}

function participantPermissions(userIds) {
  return userIds.flatMap((userId) => [
    `read("user:${userId}")`,
    `update("user:${userId}")`,
    `delete("user:${userId}")`
  ]);
}

function swipePermissions(userId) {
  return [
    `read("user:${userId}")`,
    `update("user:${userId}")`,
    `delete("user:${userId}")`
  ];
}

async function createThreadWithParticipants(config, currentUserId, otherUserId, otherUserName) {
  const participantIds = [currentUserId, otherUserId].sort();
  const threadId = stableThreadRowId(participantIds);
  await ensureThreadAccess(config, threadId, currentUserId, otherUserId, otherUserName);

  return threadId;
}

async function ensureThreadAccess(config, threadId, currentUserId, otherUserId, otherUserName) {
  const participantIds = [currentUserId, otherUserId].sort();
  const permissions = participantPermissions(participantIds);

  await createOrReuseThreadRow(config, threadId, currentUserId, otherUserName, permissions);
  await Promise.all([
    ensureThreadParticipant(config, threadId, currentUserId, permissions),
    ensureThreadParticipant(config, threadId, otherUserId, permissions)
  ]);
}

async function createOrReuseThreadRow(config, threadId, currentUserId, otherUserName, permissions) {
  const existingThread = await getRowIfExists(config, config.threadsTableId, threadId);
  if (existingThread?.$id) {
    await updateRow(
      config,
      config.threadsTableId,
      threadId,
      threadPayloadFromExisting(existingThread, threadId, currentUserId, otherUserName),
      permissions
    );
    return threadId;
  }

  try {
    await createRow(
      config,
      config.threadsTableId,
      threadId,
      threadPayloadFromExisting(null, threadId, currentUserId, otherUserName),
      permissions
    );
  } catch (err) {
    if (!isAlreadyExistsError(err)) {
      throw new Error(`Failed creating row in ${config.threadsTableId}: ${err?.message ?? err}`);
    }
  }

  return threadId;
}

async function ensureThreadParticipant(config, threadId, userId, permissions) {
  const participantRowId = stableParticipantRowId(threadId, userId);
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

async function createOrReuseMatchRow(config, matchId, data, permissions) {
  const existingMatch = await getRowIfExists(config, config.matchesTableId, matchId);
  if (existingMatch?.$id) {
    await updateRow(config, config.matchesTableId, matchId, data, permissions);
    return matchId;
  }

  try {
    await createRow(config, config.matchesTableId, matchId, data, permissions);
  } catch (err) {
    if (!isAlreadyExistsError(err)) {
      throw new Error(`Failed creating row in ${config.matchesTableId}: ${err?.message ?? err}`);
    }

    await updateRow(config, config.matchesTableId, matchId, data, permissions);
  }

  return matchId;
}

async function createOrUpdateRow(config, tableId, rowId, data, permissions) {
  try {
    await createRow(config, tableId, rowId, data, permissions);
  } catch (err) {
    if (!isAlreadyExistsError(err)) {
      throw new Error(`Failed creating row in ${tableId}: ${err?.message ?? err}`);
    }

    await updateRow(config, tableId, rowId, data, permissions);
  }

  return rowId;
}

async function upsertRelationshipForSwipe(config, existingRelationship, currentUserId, otherUserId, decision, now) {
  if (!config.relationshipsTableId) {
    return null;
  }

  const userIds = [currentUserId, otherUserId].sort();
  const isCurrentUserA = userIds[0] === currentUserId;
  const currentStateKey = isCurrentUserA ? "userAState" : "userBState";
  const otherStateKey = isCurrentUserA ? "userBState" : "userAState";
  const nextCurrentState = decision === "liked" ? "liked" : "none";
  const payload = {
    pairKey: userIds.join(":"),
    userAId: userIds[0],
    userBId: userIds[1],
    userAState: isCurrentUserA ? nextCurrentState : (asString(existingRelationship?.userAState) ?? "none"),
    userBState: isCurrentUserA ? (asString(existingRelationship?.userBState) ?? "none") : nextCurrentState,
    threadId: existingRelationship?.threadId ?? null,
    matchedAt: existingRelationship?.matchedAt ?? null,
    createdAt: existingRelationship?.createdAt ?? now,
    updatedAt: now
  };

  // Respect an existing block from either side instead of silently downgrading it with new swipes.
  if (asString(existingRelationship?.[currentStateKey]) === "blocked" || asString(existingRelationship?.[otherStateKey]) === "blocked") {
    payload[currentStateKey] = asString(existingRelationship?.[currentStateKey]) ?? "none";
    payload[otherStateKey] = asString(existingRelationship?.[otherStateKey]) ?? "none";
  }

  return upsertRelationshipRow(config, existingRelationship, payload, participantPermissions(userIds));
}

async function upsertMatchedRelationship(config, existingRelationship, currentUserId, otherUserId, threadId, now) {
  if (!config.relationshipsTableId) {
    return null;
  }

  const userIds = [currentUserId, otherUserId].sort();
  const payload = {
    pairKey: userIds.join(":"),
    userAId: userIds[0],
    userBId: userIds[1],
    userAState: "matched",
    userBState: "matched",
    threadId,
    matchedAt: existingRelationship?.matchedAt ?? now,
    createdAt: existingRelationship?.createdAt ?? now,
    updatedAt: now
  };

  return upsertRelationshipRow(config, existingRelationship, payload, participantPermissions(userIds));
}

async function upsertRelationshipRow(config, existingRelationship, payload, permissions) {
  const relationshipId = existingRelationship?.$id ?? stableRelationshipRowId([payload.userAId, payload.userBId]);

  if (existingRelationship?.$id) {
    await updateRow(config, config.relationshipsTableId, relationshipId, payload, permissions);
    return relationshipId;
  }

  try {
    await createRow(config, config.relationshipsTableId, relationshipId, payload, permissions);
  } catch (err) {
    if (!isAlreadyExistsError(err)) {
      throw new Error(`Failed creating row in ${config.relationshipsTableId}: ${err?.message ?? err}`);
    }
    await updateRow(config, config.relationshipsTableId, relationshipId, payload, permissions);
  }

  return relationshipId;
}

function threadPayloadFromExisting(threadRow, threadId, currentUserId, otherUserName) {
  const currentSubject = asString(threadRow?.subject);
  const nextSubject = currentSubject && !PLACEHOLDER_MATCH_SUBJECTS.has(currentSubject)
    ? currentSubject
    : (asString(otherUserName) ?? currentSubject ?? DEFAULT_MATCH_SUBJECT);

  return {
    threadId,
    createdByUserId: asString(threadRow?.createdByUserId) ?? currentUserId,
    subject: nextSubject,
    status: asString(threadRow?.status) ?? "active",
    lastMessageText: threadRow?.lastMessageText ?? null,
    lastMessageAt: threadRow?.lastMessageAt ?? null
  };
}

function participantPayloadFromExisting(participantRow, threadId, userId) {
  return {
    threadId,
    userId,
    role: asString(participantRow?.role) ?? "participant",
    lastReadAt: participantRow?.lastReadAt ?? null,
    muted: typeof participantRow?.muted === "boolean" ? participantRow.muted : false,
    pinned: typeof participantRow?.pinned === "boolean" ? participantRow.pinned : false,
    notificationsEnabled: typeof participantRow?.notificationsEnabled === "boolean"
      ? participantRow.notificationsEnabled
      : true
  };
}

async function findSingleRow(config, tableId, queries) {
  const rows = await listRows(config, tableId, queries);
  return rows[0] ?? null;
}

async function getRowIfExists(config, tableId, rowId) {
  try {
    return await request(config, "GET", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

async function findRelationshipRow(config, currentUserId, otherUserId) {
  if (!config.relationshipsTableId) {
    return null;
  }

  const pairKey = [currentUserId, otherUserId].sort().join(":");
  const stableRelationship = await getRowIfExists(
    config,
    config.relationshipsTableId,
    stableRelationshipRowId([currentUserId, otherUserId].sort())
  );
  if (stableRelationship?.$id) {
    return stableRelationship;
  }

  return findSingleRow(config, config.relationshipsTableId, [
    equal("pairKey", [pairKey]),
    limit(1)
  ]);
}

async function findSwipeRow(config, fromUserId, toUserId, decision = null) {
  const swipeKey = `${fromUserId}:${toUserId}`;
  const stableSwipe = await getRowIfExists(config, config.swipesTableId, stableSwipeRowId(swipeKey));
  if (stableSwipe?.$id) {
    return !decision || asString(stableSwipe.decision) === decision ? stableSwipe : null;
  }

  const queries = [equal("swipeKey", [swipeKey])];
  if (decision) {
    queries.push(equal("decision", [decision]));
  }
  queries.push(limit(1));
  return findSingleRow(config, config.swipesTableId, queries);
}

async function findMatchRow(config, userIds) {
  const matchId = stableMatchRowId(userIds);
  const stableMatch = await getRowIfExists(config, config.matchesTableId, matchId);
  if (stableMatch?.$id) {
    return stableMatch;
  }

  return findSingleRow(config, config.matchesTableId, [
    equal("matchKey", [userIds.join(":")]),
    limit(1)
  ]);
}

function relationshipBlocksInteraction(relationship, currentUserId, otherUserId) {
  if (!relationship) {
    return false;
  }

  return relationshipStateForUser(relationship, currentUserId) === "blocked"
    || relationshipStateForUser(relationship, otherUserId) === "blocked";
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

async function createRow(config, tableId, rowId, data, permissions) {
  return request(config, "POST", `/tablesdb/${config.databaseId}/tables/${tableId}/rows`, {
    rowId,
    data,
    permissions
  });
}

async function updateRow(config, tableId, rowId, data, permissions) {
  return request(config, "PATCH", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`, {
    data,
    permissions
  });
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

function stableThreadRowId(userIds) {
  return stableRowId("th", userIds.join(":"));
}

function stableParticipantRowId(threadId, userId) {
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

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asDecision(value) {
  return value === "liked" || value === "passed" ? value : null;
}
