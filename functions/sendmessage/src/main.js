export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = resolveCurrentUserId(req, body);
    const threadId = asString(body.threadId);
    const text = asString(body.text);

    if (!threadId || !text) {
      return res.json({ message: "Missing payload" }, 400);
    }

    const participantRows = await listRows(config, config.threadParticipantsTableId, [
      equal("threadId", [threadId]),
      limit(10)
    ]);
    const participantIds = participantRows.map((row) => row.userId).filter(Boolean);

    // Only participants of the thread are allowed to append new messages to it.
    if (!participantIds.includes(currentUserId)) {
      return res.json({ message: "Forbidden" }, 403);
    }

    const now = new Date().toISOString();
    const messageId = uniqueId();
    try {
      await createRow(config, config.messagesTableId, messageId, {
        threadId,
        senderUserId: currentUserId,
        text,
        createdAt: now
      }, participantIds.map((userId) => `read("user:${userId}")`));
    } catch (err) {
      throw new Error(`Failed creating row in ${config.messagesTableId}: ${err?.message ?? err}`);
    }

    // Update the thread preview immediately so inbox ordering stays in sync with the latest message.
    try {
      const threadRow = await getRow(config, config.threadsTableId, threadId);
      await updateRow(config, config.threadsTableId, threadId, {
        threadId,
        createdByUserId: threadRow?.createdByUserId ?? currentUserId,
        subject: threadRow?.subject ?? null,
        status: threadRow?.status ?? "active",
        lastMessageText: text,
        lastMessageAt: now
      });
    } catch (err) {
      error(`Non-fatal thread preview update failure in ${config.threadsTableId}: ${err?.message ?? err}`);
    }

    const currentParticipant = participantRows.find((row) => row.userId === currentUserId);
    if (currentParticipant?.$id) {
      try {
        await updateRow(config, config.threadParticipantsTableId, currentParticipant.$id, {
          threadId,
          userId: currentUserId,
          role: currentParticipant.role ?? "member",
          lastReadAt: now,
          muted: currentParticipant.muted ?? false,
          pinned: currentParticipant.pinned ?? false,
          notificationsEnabled: currentParticipant.notificationsEnabled ?? true
        });
      } catch (err) {
        error(`Non-fatal participant update failure in ${config.threadParticipantsTableId}: ${err?.message ?? err}`);
      }
    }

    return res.json({ messageId, text, createdAt: now }, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return res.json({ message: "Unable to send message" }, 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    threadsTableId: requiredEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    messagesTableId: requiredEnv("APPWRITE_MESSAGES_TABLE_ID")
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

async function getRow(config, tableId, rowId) {
  return request(config, "GET", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`);
}

async function updateRow(config, tableId, rowId, data) {
  return request(config, "PATCH", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`, {
    data
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
