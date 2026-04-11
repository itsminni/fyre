export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = resolveCurrentUserId(req, body);
    const threadId = asString(body.threadId);
    const text = asOptionalString(body.text);
    const replyToMessageId = asString(body.replyToMessageId);
    const messageType = asString(body.messageType) ?? "text";
    const attachmentFileId = asString(body.attachmentFileId);
    const attachmentName = asOptionalString(body.attachmentName);
    const attachmentMimeType = asOptionalString(body.attachmentMimeType);
    const attachmentSize = asOptionalNumber(body.attachmentSize);
    const attachmentWidth = asOptionalNumber(body.attachmentWidth);
    const attachmentHeight = asOptionalNumber(body.attachmentHeight);
    const attachmentDuration = asOptionalNumber(body.attachmentDuration);

    if (!threadId || (!text && !attachmentFileId)) {
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

    if (attachmentFileId) {
      if (!config.chatAttachmentsBucketId) {
        throw new Error("Missing environment variable APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID");
      }

      try {
        const file = await getFile(config, attachmentFileId);
        const permissions = participantIds.map((userId) => `read("user:${userId}")`);
        permissions.push(`update("user:${currentUserId}")`);
        permissions.push(`delete("user:${currentUserId}")`);

        await updateFile(config, attachmentFileId, {
          name: file.name,
          permissions
        });
      } catch (err) {
        throw new Error(`Failed updating attachment permissions: ${err?.message ?? err}`);
      }
    }

    const now = new Date().toISOString();
    const messageId = uniqueId();
    try {
      await createRow(config, config.messagesTableId, messageId, {
        threadId,
        senderUserId: currentUserId,
        text,
        messageType,
        attachmentFileId,
        attachmentName,
        attachmentMimeType,
        attachmentSize,
        attachmentWidth,
        attachmentHeight,
        attachmentDuration,
        replyToMessageId,
        createdAt: now
      }, participantIds.map((userId) => `read("user:${userId}")`));
    } catch (err) {
      throw new Error(`Failed creating row in ${config.messagesTableId}: ${err?.message ?? err}`);
    }

    // Update the thread preview immediately so inbox ordering stays in sync with the latest message.
    try {
      const previewText = text ?? attachmentName ?? defaultAttachmentPreview(messageType);
      const threadRow = await getRow(config, config.threadsTableId, threadId);
      await updateRow(config, config.threadsTableId, threadId, {
        threadId,
        createdByUserId: threadRow?.createdByUserId ?? currentUserId,
        subject: threadRow?.subject ?? null,
        status: threadRow?.status ?? "active",
        lastMessageText: previewText,
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

    return res.json({
      messageId,
      text,
      messageType,
      attachmentFileId,
      attachmentName,
      attachmentMimeType,
      attachmentSize,
      attachmentWidth,
      attachmentHeight,
      attachmentDuration,
      replyToMessageId,
      createdAt: now
    }, 200);
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
    messagesTableId: requiredEnv("APPWRITE_MESSAGES_TABLE_ID"),
    chatAttachmentsBucketId: optionalEnv("APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID")
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

async function getFile(config, fileId) {
  return request(config, "GET", `/storage/buckets/${config.chatAttachmentsBucketId}/files/${fileId}`);
}

async function updateFile(config, fileId, data) {
  return request(config, "PUT", `/storage/buckets/${config.chatAttachmentsBucketId}/files/${fileId}`, data);
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

function asOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function defaultAttachmentPreview(messageType) {
  switch (messageType) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "file":
      return "File";
    default:
      return "Attachment";
  }
}
