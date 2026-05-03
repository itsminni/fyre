import { createHash } from "node:crypto";

const DEFAULT_MATCH_SUBJECT = "Fyre match";
const PLACEHOLDER_MATCH_SUBJECTS = new Set(["Match", DEFAULT_MATCH_SUBJECT]);

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = resolveCurrentUserId(req, body);
    const otherUserId = asString(body.otherUserId);
    const otherUserName = asString(body.otherUserName);

    if (!otherUserId || otherUserId === currentUserId) {
      return json(res, { message: "Invalid participant" }, 400);
    }

    let knownThreadId = null;
    if (config.relationshipsTableId) {
      const relationship = await findRelationshipRow(config, currentUserId, otherUserId);
      if (!relationship) {
        const hasLegacyMatch = await findLegacyMatch(config, currentUserId, otherUserId);
        if (!hasLegacyMatch) {
          return json(res, { message: "Relationship unavailable" }, 403);
        }
        knownThreadId = asString(hasLegacyMatch.threadId);
      } else if (!relationshipAllowsThread(relationship, currentUserId, otherUserId)) {
        return json(res, { message: "Relationship unavailable" }, 403);
      } else {
        knownThreadId = asString(relationship.threadId);
      }
    }

    const participantIds = [currentUserId, otherUserId].sort();
    const threadId = knownThreadId ?? stableThreadRowId(participantIds);
    await ensureThreadAccess(config, threadId, currentUserId, otherUserId, otherUserName);

    return json(res, { threadId }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return json(res, { message: "Unable to create thread" }, 500);
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
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    threadsTableId: requiredEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    relationshipsTableId: optionalEnv("APPWRITE_RELATIONSHIPS_TABLE_ID"),
    matchesTableId: optionalEnv("APPWRITE_MATCHES_TABLE_ID")
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
  // Mirror permissions on the thread and participant rows so both users can read the conversation metadata.
  return userIds.flatMap((userId) => [
    `read("user:${userId}")`,
    `update("user:${userId}")`,
    `delete("user:${userId}")`
  ]);
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

async function findSingleRow(config, tableId, queries) {
  const rows = await listRows(config, tableId, queries);
  return rows[0] ?? null;
}

async function findRelationshipRow(config, currentUserId, otherUserId) {
  if (!config.relationshipsTableId) {
    return null;
  }

  const userIds = [currentUserId, otherUserId].sort();
  const stableRelationship = await getRowIfExists(
    config,
    config.relationshipsTableId,
    stableRelationshipRowId(userIds)
  );
  if (stableRelationship?.$id) {
    return stableRelationship;
  }

  return findSingleRow(config, config.relationshipsTableId, [
    equal("pairKey", [userIds.join(":")]),
    limit(1)
  ]);
}

async function findLegacyMatch(config, currentUserId, otherUserId) {
  if (!config.matchesTableId) {
    return null;
  }

  const userIds = [currentUserId, otherUserId].sort();
  const stableMatch = await getRowIfExists(config, config.matchesTableId, stableMatchRowId(userIds));
  if (stableMatch?.$id) {
    return stableMatch;
  }

  return findSingleRow(config, config.matchesTableId, [
    equal("matchKey", [userIds.join(":")]),
    limit(1)
  ]);
}

function relationshipAllowsThread(relationship, currentUserId, otherUserId) {
  const currentState = relationshipStateForUser(relationship, currentUserId);
  const otherState = relationshipStateForUser(relationship, otherUserId);

  if (currentState === "blocked" || otherState === "blocked") {
    return false;
  }

  return currentState === "matched" || otherState === "matched" || Boolean(relationship.matchedAt);
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
    return await request(config, "GET", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
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

export function sharedThreadIdFromParticipantRows(firstRows, secondRows) {
  const firstThreadIds = new Set(
    firstRows
      .map((row) => asString(row.threadId))
      .filter(Boolean)
  );

  for (const row of secondRows) {
    const threadId = asString(row.threadId);
    if (threadId && firstThreadIds.has(threadId)) {
      return threadId;
    }
  }

  return null;
}
