export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = requiredHeader(req, "x-appwrite-user-id");
    const otherUserId = asString(body.otherUserId);

    if (!otherUserId || otherUserId === currentUserId) {
      return res.json({ message: "Invalid participant" }, 400);
    }

    const existingThreadId = await findExistingThreadIdByParticipants(config, currentUserId, otherUserId);
    if (existingThreadId) {
      return res.json({ threadId: existingThreadId }, 200);
    }

    const threadId = uniqueId();
    const threadPermissions = participantPermissions([currentUserId, otherUserId]);

    await createRow(config, config.threadsTableId, threadId, {
      lastMessageText: null,
      lastMessageAt: null
    }, threadPermissions);

    await createRow(config, config.threadParticipantsTableId, uniqueId(), {
      threadId,
      userId: currentUserId,
      lastReadAt: null
    }, threadPermissions);

    await createRow(config, config.threadParticipantsTableId, uniqueId(), {
      threadId,
      userId: otherUserId,
      lastReadAt: null
    }, threadPermissions);

    return res.json({ threadId }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return res.json({ message: "Unable to create thread" }, 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    threadsTableId: requiredEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID")
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

function requiredHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()] ?? req.headers?.[name.toUpperCase()];
  if (!value) {
    throw new Error(`Missing header ${name}`);
  }
  return Array.isArray(value) ? value[0] : value;
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

async function createRow(config, tableId, rowId, data, permissions) {
  return request(config, "POST", `/tablesdb/${config.databaseId}/tables/${tableId}/rows`, {
    rowId,
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

function uniqueId() {
  return crypto.randomUUID().replaceAll("-", "");
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
