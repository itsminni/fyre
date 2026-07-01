import { createHash } from "node:crypto";

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);
    const threadId = asString(body.threadId);
    const action = asAction(body.action);

    if (!threadId || !action) {
      return res.json({ message: "Invalid relationship payload" }, 400);
    }

    const participantRows = await listRows(config, config.threadParticipantsTableId, [
      equal("threadId", [threadId]),
      limit(10)
    ]);
    const participantIds = participantRows
      .map((row) => asString(row.userId))
      .filter(Boolean);

    if (!participantIds.includes(currentUserId)) {
      return res.json({ message: "Forbidden" }, 403);
    }

    const otherUserId = participantIds.find((userId) => userId !== currentUserId);
    if (!otherUserId) {
      return res.json({ message: "Relationship not found" }, 404);
    }

    const now = new Date().toISOString();
    const existingRelationship = await findRelationshipRow(config, currentUserId, otherUserId);
    const permissions = participantPermissions([currentUserId, otherUserId].sort());

    if (action === "unmatch") {
      await clearMatchState(config, currentUserId, otherUserId, existingRelationship?.$id);
      return res.json({ ok: true, relationshipState: "none" }, 200);
    }

    const payload = nextRelationshipPayload(
      existingRelationship,
      currentUserId,
      otherUserId,
      threadId,
      action,
      now
    );
    await upsertRelationshipRow(config, existingRelationship, payload, permissions);

    if (action === "block") {
      await clearMatchState(config, currentUserId, otherUserId, null);
    }

    return res.json({ ok: true, relationshipState: action === "archive" ? "archived" : "blocked" }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return res.json({ message: err?.statusCode === 403 ? "Forbidden" : "Unable to update relationship" }, err?.statusCode ?? 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    threadParticipantsTableId: requiredEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    relationshipsTableId: requiredEnv("APPWRITE_RELATIONSHIPS_TABLE_ID"),
    matchesTableId: optionalEnv("APPWRITE_MATCHES_TABLE_ID"),
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
    threadId: existingRelationship?.threadId ?? threadId,
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

async function clearMatchState(config, currentUserId, otherUserId, relationshipRowId) {
  const userIds = [currentUserId, otherUserId].sort();
  const matchKey = userIds.join(":");

  if (relationshipRowId) {
    await deleteRow(config, config.relationshipsTableId, relationshipRowId);
  }

  if (!config.matchesTableId) {
    return;
  }

  const existingMatch = await findSingleRow(config, config.matchesTableId, [
    equal("matchKey", [matchKey]),
    limit(1)
  ]);
  if (existingMatch?.$id) {
    await deleteRow(config, config.matchesTableId, existingMatch.$id);
  }
}

async function findRelationshipRow(config, currentUserId, otherUserId) {
  const pairKey = [currentUserId, otherUserId].sort().join(":");
  return findSingleRow(config, config.relationshipsTableId, [
    equal("pairKey", [pairKey]),
    limit(1)
  ]);
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

async function findSingleRow(config, tableId, queries) {
  const rows = await listRows(config, tableId, queries);
  return rows[0] ?? null;
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

async function deleteRow(config, tableId, rowId) {
  return request(config, "DELETE", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`);
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

function stableRelationshipRowId(userIds) {
  return stableRowId("rl", userIds.join(":"));
}

function stableRowId(prefix, seed) {
  return `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

function isAlreadyExistsError(err) {
  const message = String(err?.message ?? err ?? "").toLowerCase();
  return message.includes("already exists");
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asAction(value) {
  return value === "archive" || value === "unmatch" || value === "block" ? value : null;
}
