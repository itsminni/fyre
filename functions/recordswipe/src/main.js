import { createHash, randomUUID } from "node:crypto";

const DEFAULT_MATCH_SUBJECT = "Fyre match";
const PLACEHOLDER_MATCH_SUBJECTS = new Set(["Match", DEFAULT_MATCH_SUBJECT]);

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = resolveCurrentUserId(req, body);
    const otherUserId = asString(body.otherUserId);
    const otherUserName = asString(body.otherUserName);
    const decision = asDecision(body.decision);

    if (!otherUserId || otherUserId === currentUserId || !decision) {
      return res.json({ message: "Invalid swipe payload" }, 400);
    }

    const now = new Date().toISOString();
    const existingRelationship = config.relationshipsTableId
      ? await findRelationshipRow(config, currentUserId, otherUserId)
      : null;

    if (relationshipBlocksInteraction(existingRelationship, currentUserId, otherUserId)) {
      return res.json({ message: "Interaction unavailable" }, 403);
    }

    const swipeKey = `${currentUserId}:${otherUserId}`;
    const existingSwipe = await findSingleRow(config, config.swipesTableId, [
      equal("swipeKey", [swipeKey]),
      limit(1)
    ]);

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
      await createRow(config, config.swipesTableId, uniqueId(), swipePayload, swipePermissions(currentUserId));
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
      return res.json({ matched: false, relationshipState: "none" }, 200);
    }

    // A match exists only when the opposite swipe was already a like.
    const reverseSwipe = await findSingleRow(config, config.swipesTableId, [
      equal("swipeKey", [`${otherUserId}:${currentUserId}`]),
      equal("decision", ["liked"]),
      limit(1)
    ]);

    if (!reverseSwipe?.$id) {
      return res.json({ matched: false, relationshipState: "liked" }, 200);
    }

    const userIds = [currentUserId, otherUserId].sort();
    const matchKey = userIds.join(":");
    const permissions = participantPermissions(userIds);
    const existingMatch = await findSingleRow(config, config.matchesTableId, [
      equal("matchKey", [matchKey]),
      limit(1)
    ]);

    if (existingMatch?.threadId) {
      if (config.relationshipsTableId) {
        await upsertMatchedRelationship(config, currentUserId, otherUserId, existingMatch.threadId, now);
      }
      await maybeRefreshThreadSubject(config, existingMatch.threadId, currentUserId, otherUserName, permissions);
      return res.json({
        matched: true,
        matchId: existingMatch.$id,
        threadId: existingMatch.threadId,
        relationshipState: "matched"
      }, 200);
    }

    const threadId = await createThreadWithParticipants(config, currentUserId, otherUserId, otherUserName);
    if (config.relationshipsTableId) {
      await upsertMatchedRelationship(config, currentUserId, otherUserId, threadId, now);
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
      return res.json({ matched: true, matchId: existingMatch.$id, threadId, relationshipState: "matched" }, 200);
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

    return res.json({ matched: true, matchId, threadId, relationshipState: "matched" }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return res.json({ message: "Unable to record swipe" }, 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    swipesTableId: requiredEnv("APPWRITE_SWIPES_TABLE_ID"),
    matchesTableId: requiredEnv("APPWRITE_MATCHES_TABLE_ID"),
    threadsTableId: requiredEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    relationshipsTableId: optionalEnv("APPWRITE_RELATIONSHIPS_TABLE_ID")
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

function resolveCurrentUserId(req, body) {
  const headerValue = req.headers?.["x-appwrite-user-id"]
    ?? req.headers?.["X-Appwrite-User-Id"]
    ?? req.headers?.["X-APPWRITE-USER-ID"];
  if (headerValue) {
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }

  const bodyValue = asString(body.currentUserId);
  if (bodyValue) {
    return bodyValue;
  }

  throw new Error("Missing current user id");
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
  const existingThreadId = await findExistingThreadIdByParticipants(config, currentUserId, otherUserId);
  if (existingThreadId) {
    await maybeRefreshThreadSubject(
      config,
      existingThreadId,
      currentUserId,
      otherUserName,
      participantPermissions(participantIds)
    );
    return existingThreadId;
  }

  const permissions = participantPermissions(participantIds);
  const threadId = stableThreadRowId(participantIds);
  await createOrReuseThreadRow(config, threadId, currentUserId, otherUserName, permissions);

  await ensureThreadParticipant(config, threadId, currentUserId, permissions);
  await ensureThreadParticipant(config, threadId, otherUserId, permissions);
  await maybeRefreshThreadSubject(config, threadId, currentUserId, otherUserName, permissions);

  return threadId;
}

async function createOrReuseThreadRow(config, threadId, currentUserId, otherUserName, permissions) {
  const existingThread = await getRowIfExists(config, config.threadsTableId, threadId);
  if (existingThread?.$id) {
    return threadId;
  }

  try {
    await createRow(config, config.threadsTableId, threadId, {
      threadId,
      createdByUserId: currentUserId,
      subject: otherUserName ?? DEFAULT_MATCH_SUBJECT,
      status: "active",
      lastMessageText: null,
      lastMessageAt: null
    }, permissions);
  } catch (err) {
    if (!isAlreadyExistsError(err)) {
      throw new Error(`Failed creating row in ${config.threadsTableId}: ${err?.message ?? err}`);
    }
  }

  return threadId;
}

async function ensureThreadParticipant(config, threadId, userId, permissions) {
  const existingParticipant = await findSingleRow(config, config.threadParticipantsTableId, [
    equal("threadId", [threadId]),
    equal("userId", [userId]),
    limit(1)
  ]);

  if (existingParticipant?.$id) {
    return existingParticipant.$id;
  }

  const participantRowId = stableParticipantRowId(threadId, userId);

  try {
    const participantRow = await createRow(config, config.threadParticipantsTableId, participantRowId, {
      threadId,
      userId,
      role: "participant",
      lastReadAt: null,
      muted: false,
      pinned: false,
      notificationsEnabled: true
    }, permissions);
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

async function upsertMatchedRelationship(config, currentUserId, otherUserId, threadId, now) {
  if (!config.relationshipsTableId) {
    return null;
  }

  const existingRelationship = await findRelationshipRow(config, currentUserId, otherUserId);
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

async function maybeRefreshThreadSubject(config, threadId, currentUserId, otherUserName, permissions) {
  const subject = asString(otherUserName);
  if (!subject) {
    return;
  }

  try {
    const threadRow = await request(config, "GET", `/tablesdb/${config.databaseId}/tables/${config.threadsTableId}/rows/${threadId}`);
    const currentSubject = asString(threadRow.subject);

    if (currentSubject && !PLACEHOLDER_MATCH_SUBJECTS.has(currentSubject)) {
      return;
    }

    await updateRow(config, config.threadsTableId, threadId, {
      threadId,
      createdByUserId: threadRow.createdByUserId ?? currentUserId,
      subject,
      status: threadRow.status ?? "active",
      lastMessageText: threadRow.lastMessageText ?? null,
      lastMessageAt: threadRow.lastMessageAt ?? null
    }, permissions);
  } catch {
    // Best-effort subject repair only; do not fail a valid match because of a cosmetic label.
  }
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
  return findSingleRow(config, config.relationshipsTableId, [
    equal("pairKey", [pairKey]),
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

async function findExistingThreadIdByParticipants(config, firstUserId, secondUserId) {
  const firstRows = await listRows(config, config.threadParticipantsTableId, [
    equal("userId", [firstUserId]),
    limit(100)
  ]);

  if (!firstRows.length) {
    return null;
  }

  const firstThreadIds = new Set(
    firstRows
      .map((row) => asString(row.threadId))
      .filter(Boolean)
  );

  if (!firstThreadIds.size) {
    return null;
  }

  const secondRows = await listRows(config, config.threadParticipantsTableId, [
    equal("userId", [secondUserId]),
    limit(100)
  ]);

  for (const row of secondRows) {
    const threadId = asString(row.threadId);
    if (threadId && firstThreadIds.has(threadId)) {
      return threadId;
    }
  }

  return null;
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

function uniqueId() {
  return randomUUID().replaceAll("-", "");
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
