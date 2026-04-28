#!/usr/bin/env node

const config = {
  endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT", "APPWRITE_PUBLIC_ENDPOINT"),
  projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID", "APPWRITE_PROJECT_ID"),
  apiKey: requiredEnv("APPWRITE_FUNCTION_API_KEY", "APPWRITE_API_KEY"),
  databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
  threadsTableId: requiredEnv("APPWRITE_THREADS_TABLE_ID"),
  threadParticipantsTableId: requiredEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
  matchesTableId: optionalEnv("APPWRITE_MATCHES_TABLE_ID"),
  relationshipsTableId: optionalEnv("APPWRITE_RELATIONSHIPS_TABLE_ID")
};

const dryRun = process.argv.includes("--dry-run");

const participantRows = await listAllRows(config.threadParticipantsTableId);
const participantsByThread = new Map();

for (const row of participantRows) {
  const threadId = asString(row.threadId);
  const userId = asString(row.userId);
  if (!threadId || !userId) {
    continue;
  }

  const entry = participantsByThread.get(threadId) ?? { rows: [], userIds: new Set() };
  entry.rows.push(row);
  entry.userIds.add(userId);
  participantsByThread.set(threadId, entry);
}

let repairedThreads = 0;
let repairedParticipants = 0;
let repairedMatches = 0;
let repairedRelationships = 0;

for (const [threadId, entry] of participantsByThread) {
  const userIds = [...entry.userIds].sort();
  if (userIds.length < 2) {
    continue;
  }

  const permissions = participantPermissions(userIds);
  const threadRow = await getRowIfExists(config.threadsTableId, threadId);
  if (threadRow) {
    repairedThreads += 1;
    await patchRow(config.threadsTableId, threadId, {
      threadId,
      createdByUserId: asString(threadRow.createdByUserId) ?? userIds[0],
      subject: threadRow.subject ?? null,
      status: asString(threadRow.status) ?? "active",
      lastMessageText: threadRow.lastMessageText ?? null,
      lastMessageAt: threadRow.lastMessageAt ?? null
    }, permissions);
  }

  for (const row of entry.rows) {
    const rowId = asString(row.$id);
    const userId = asString(row.userId);
    if (!rowId || !userId) {
      continue;
    }

    repairedParticipants += 1;
    await patchRow(config.threadParticipantsTableId, rowId, {
      threadId,
      userId,
      role: asString(row.role) ?? "participant",
      lastReadAt: row.lastReadAt ?? null,
      muted: typeof row.muted === "boolean" ? row.muted : false,
      pinned: typeof row.pinned === "boolean" ? row.pinned : false,
      notificationsEnabled: typeof row.notificationsEnabled === "boolean" ? row.notificationsEnabled : true
    }, permissions);
  }
}

if (config.matchesTableId) {
  const matches = await listAllRows(config.matchesTableId);
  for (const row of matches) {
    const rowId = asString(row.$id);
    const userAId = asString(row.userAId);
    const userBId = asString(row.userBId);
    if (!rowId || !userAId || !userBId) {
      continue;
    }

    repairedMatches += 1;
    const userIds = [userAId, userBId];
    await patchRow(config.matchesTableId, rowId, {
      matchKey: asString(row.matchKey) ?? userIds.join(":"),
      userAId,
      userBId,
      threadId: row.threadId ?? null,
      createdAt: row.createdAt ?? row.$createdAt ?? new Date().toISOString(),
      matchedAt: row.matchedAt ?? row.createdAt ?? row.$createdAt ?? new Date().toISOString()
    }, participantPermissions(userIds));
  }
}

if (config.relationshipsTableId) {
  const relationships = await listAllRows(config.relationshipsTableId);
  for (const row of relationships) {
    const rowId = asString(row.$id);
    const userAId = asString(row.userAId);
    const userBId = asString(row.userBId);
    if (!rowId || !userAId || !userBId) {
      continue;
    }

    repairedRelationships += 1;
    const userIds = [userAId, userBId];
    await patchRow(config.relationshipsTableId, rowId, {
      pairKey: asString(row.pairKey) ?? userIds.join(":"),
      userAId,
      userBId,
      userAState: asString(row.userAState) ?? "none",
      userBState: asString(row.userBState) ?? "none",
      threadId: row.threadId ?? null,
      matchedAt: row.matchedAt ?? null,
      createdAt: row.createdAt ?? row.$createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, participantPermissions(userIds));
  }
}

console.log(JSON.stringify({
  dryRun,
  repairedThreads,
  repairedParticipants,
  repairedMatches,
  repairedRelationships
}, null, 2));

function requiredEnv(...names) {
  for (const name of names) {
    const value = optionalEnv(name);
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing environment variable: one of ${names.join(", ")}`);
}

function optionalEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function participantPermissions(userIds) {
  return [...new Set(userIds.flatMap((userId) => [
    `read("user:${userId}")`,
    `update("user:${userId}")`,
    `delete("user:${userId}")`
  ]))];
}

async function listAllRows(tableId, pageSize = 100) {
  const rows = [];
  let page = 0;

  while (true) {
    const batch = await listRows(tableId, [
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

async function listRows(tableId, queries) {
  const payload = await request("GET", `/tablesdb/${config.databaseId}/tables/${tableId}/rows`, undefined, queries);
  return Array.isArray(payload.rows) ? payload.rows : [];
}

async function getRowIfExists(tableId, rowId) {
  try {
    return await request("GET", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`);
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function patchRow(tableId, rowId, data, permissions) {
  if (dryRun) {
    return;
  }
  await request("PATCH", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`, {
    data,
    permissions
  });
}

async function request(method, path, body, queries = []) {
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
    const error = new Error(payload.message ?? `Request failed with status ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

function limit(value) {
  return JSON.stringify({ method: "limit", values: [value] });
}

function offset(value) {
  return JSON.stringify({ method: "offset", values: [value] });
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
