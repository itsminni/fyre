import { createHash } from "node:crypto";

const MAX_TRANSACTION_ATTEMPTS = 4;
const TRANSACTION_TTL_SECONDS = 30;
const APPWRITE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);
    const threadId = appwriteIdentifier(body.threadId);
    const action = asAction(body.action);

    if (!threadId || !action) {
      return res.json({ message: "Invalid relationship payload" }, 400);
    }

    const relationshipState = await mutateRelationshipWithTransaction(
      config,
      currentUserId,
      threadId,
      action
    );
    return res.json({ ok: true, relationshipState }, 200);
  } catch (err) {
    error(`managerelationship failed (${err?.statusCode ?? 500})`);
    const message = err?.statusCode === 401
      ? "Unauthorized"
      : err?.statusCode === 403
        ? "Forbidden"
        : "Unable to update relationship";
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
    threadParticipantsTableId: requiredIdentifierEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    relationshipsTableId: requiredIdentifierEnv("APPWRITE_RELATIONSHIPS_TABLE_ID"),
    matchesTableId: requiredIdentifierEnv("APPWRITE_MATCHES_TABLE_ID")
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

export function sharedRelationshipPermissions(userIds) {
  return userIds.map((userId) => `read("user:${userId}")`);
}

export function canonicalParticipantUserIds(rows, threadId, currentUserId) {
  if (!Array.isArray(rows) || rows.length !== 2) {
    return null;
  }

  const userIds = [];
  for (const row of rows) {
    const userId = appwriteIdentifier(row?.userId);
    if (
      !userId
      || asString(row?.threadId) !== threadId
      || asString(row?.$id) !== stableParticipantRowId(threadId, userId)
      || userIds.includes(userId)
    ) {
      return null;
    }
    userIds.push(userId);
  }

  if (!userIds.includes(currentUserId)) {
    return null;
  }

  return userIds.sort();
}

function nextRelationshipPayload(existingRelationship, currentUserId, otherUserId, threadId, action, now) {
  const userIds = [currentUserId, otherUserId].sort();
  const isCurrentUserA = userIds[0] === currentUserId;
  const currentStateKey = isCurrentUserA ? "userAState" : "userBState";
  const otherStateKey = isCurrentUserA ? "userBState" : "userAState";
  const nextCurrentState = action === "archive" ? "archived" : "blocked";

  const payload = {
    pairKey: userIds.join(":"),
    userAId: userIds[0],
    userBId: userIds[1],
    userAState: isCurrentUserA ? nextCurrentState : (asString(existingRelationship?.userAState) ?? fallbackState(existingRelationship)),
    userBState: isCurrentUserA ? (asString(existingRelationship?.userBState) ?? fallbackState(existingRelationship)) : nextCurrentState,
    threadId,
    matchedAt: existingRelationship?.matchedAt ?? null,
    createdAt: existingRelationship?.createdAt ?? now,
    updatedAt: now
  };

  payload[currentStateKey] = nextCurrentState;
  payload[otherStateKey] = asString(existingRelationship?.[otherStateKey]) ?? fallbackState(existingRelationship);

  return payload;
}

function fallbackState(existingRelationship) {
  return existingRelationship?.matchedAt ? "matched" : "none";
}

function relationshipStateForUser(relationship, userId) {
  if (asString(relationship?.userAId) === userId) {
    return asString(relationship.userAState) ?? "none";
  }
  if (asString(relationship?.userBId) === userId) {
    return asString(relationship.userBState) ?? "none";
  }
  return "none";
}

async function mutateRelationshipWithTransaction(config, currentUserId, threadId, action) {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let transactionId = null;
    try {
      transactionId = await createTransaction(config);

      // Authorization and all mutable preconditions are read again inside every
      // transaction attempt. Appwrite will reject the commit if any row read or
      // staged here changes concurrently.
      const participantRows = await listRows(config, config.threadParticipantsTableId, [
        equal("threadId", [threadId]),
        limit(3)
      ], transactionId);
      const participantIds = canonicalParticipantUserIds(participantRows, threadId, currentUserId);
      if (!participantIds) {
        throw authError("Thread participants do not match", 403);
      }

      const otherUserId = participantIds.find((userId) => userId !== currentUserId);
      const relationshipId = stableRelationshipRowId(participantIds);
      const matchId = stableMatchRowId(participantIds);
      const existingRelationship = await getRowIfExists(
        config,
        config.relationshipsTableId,
        relationshipId,
        transactionId
      );
      if (existingRelationship && !relationshipRowBelongsToThread(existingRelationship, participantIds, threadId)) {
        throw authError("Relationship does not match thread", 403);
      }

      const existingMatch = await getRowIfExists(
        config,
        config.matchesTableId,
        matchId,
        transactionId
      );
      if (existingMatch && !matchRowBelongsToThread(existingMatch, participantIds, threadId)) {
        throw authError("Match does not match thread", 403);
      }

      if (action === "unmatch") {
        if (relationshipStateForUser(existingRelationship, otherUserId) === "blocked") {
          throw authError("Blocked relationship cannot be removed", 403);
        }
        if (existingRelationship) {
          await deleteRow(config, config.relationshipsTableId, relationshipId, transactionId);
        }
        if (existingMatch) {
          await deleteRow(config, config.matchesTableId, matchId, transactionId);
        }
        await commitTransaction(config, transactionId);
        return "none";
      }

      const now = new Date().toISOString();
      const payload = nextRelationshipPayload(
        existingRelationship,
        currentUserId,
        otherUserId,
        threadId,
        action,
        now
      );
      const currentStateKey = participantIds[0] === currentUserId ? "userAState" : "userBState";
      await upsertRelationshipRow(
        config,
        existingRelationship,
        payload,
        sharedRelationshipPermissions(participantIds),
        [currentStateKey, "threadId", "updatedAt"],
        transactionId
      );

      if (action === "block" && existingMatch) {
        await deleteRow(config, config.matchesTableId, matchId, transactionId);
      }

      await commitTransaction(config, transactionId);
      return action === "archive" ? "archived" : "blocked";
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

  throw new Error("Relationship transaction attempts exhausted");
}

export function relationshipRowBelongsToThread(row, userIds, threadId) {
  if (!row || typeof row !== "object" || !Array.isArray(userIds) || userIds.length !== 2) {
    return false;
  }
  return asString(row.pairKey) === userIds.join(":")
    && asString(row.userAId) === userIds[0]
    && asString(row.userBId) === userIds[1]
    && (!asString(row.threadId) || asString(row.threadId) === threadId);
}

export function matchRowBelongsToThread(row, userIds, threadId) {
  if (!row || typeof row !== "object" || !Array.isArray(userIds) || userIds.length !== 2) {
    return false;
  }
  return asString(row.matchKey) === userIds.join(":")
    && asString(row.userAId) === userIds[0]
    && asString(row.userBId) === userIds[1]
    && asString(row.threadId) === threadId
    && Boolean(asString(row.$id));
}

async function upsertRelationshipRow(
  config,
  existingRelationship,
  payload,
  permissions,
  partialFields = [],
  transactionId = null
) {
  const relationshipId = existingRelationship?.$id ?? stableRelationshipRowId([payload.userAId, payload.userBId]);

  if (existingRelationship?.$id) {
    await updateRow(
      config,
      config.relationshipsTableId,
      relationshipId,
      selectFields(payload, partialFields),
      permissions,
      transactionId
    );
    return relationshipId;
  }

  await createRow(
    config,
    config.relationshipsTableId,
    relationshipId,
    payload,
    permissions,
    transactionId
  );

  return relationshipId;
}

function selectFields(payload, fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return payload;
  }
  return Object.fromEntries(fields.map((field) => [field, payload[field]]));
}

async function getRowIfExists(config, tableId, rowId, transactionId = null) {
  try {
    return await request(
      config,
      "GET",
      `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`,
      undefined,
      [],
      transactionId ? { transactionId } : {}
    );
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
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

async function createRow(config, tableId, rowId, data, permissions, transactionId = null) {
  return request(config, "POST", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`, {
    rowId,
    data,
    permissions,
    ...(transactionId ? { transactionId } : {})
  });
}

async function updateRow(config, tableId, rowId, data, permissions, transactionId = null) {
  const payload = { data, permissions };
  if (transactionId) {
    payload.transactionId = transactionId;
  }
  return request(
    config,
    "PATCH",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`,
    payload
  );
}

async function deleteRow(config, tableId, rowId, transactionId = null) {
  return request(
    config,
    "DELETE",
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`,
    transactionId ? { transactionId } : undefined
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
  await request(config, "PATCH", `/tablesdb/transactions/${pathSegment(transactionId)}`, { commit: true });
}

async function rollbackTransaction(config, transactionId) {
  try {
    await request(config, "PATCH", `/tablesdb/transactions/${pathSegment(transactionId)}`, { rollback: true });
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

function stableRelationshipRowId(userIds) {
  return stableRowId("rl", userIds.join(":"));
}

function stableMatchRowId(userIds) {
  return stableRowId("mt", userIds.join(":"));
}

export function stableParticipantRowId(threadId, userId) {
  return stableRowId("tp", `${threadId}:${userId}`);
}

function stableRowId(prefix, seed) {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

function isConflictError(err) {
  const message = String(err?.message ?? err ?? "").toLowerCase();
  const type = String(err?.type ?? "").toLowerCase();
  return err?.statusCode === 409 || type.includes("conflict") || message.includes("already exists");
}

function isNotFoundError(err) {
  if (err?.statusCode === 404) {
    return true;
  }
  const message = String(err?.message ?? err ?? "").toLowerCase();
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

function asAction(value) {
  return value === "archive" || value === "unmatch" || value === "block" ? value : null;
}
