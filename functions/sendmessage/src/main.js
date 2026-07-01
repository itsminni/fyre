import { makeChatMessageContract } from "./contracts.js";

const DEFAULT_MATCH_SUBJECT = "Fyre match";

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);
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
    const participantPermissions = conversationRowPermissions(participantIds);

    // Only participants of the thread are allowed to append new messages to it.
    if (!participantIds.includes(currentUserId)) {
      return res.json({ message: "Forbidden" }, 403);
    }

    if (config.relationshipsTableId) {
      const otherUserId = participantIds.find((userId) => userId !== currentUserId);
      const relationship = otherUserId
        ? await findRelationshipRow(config, currentUserId, otherUserId)
        : null;

      if (!relationship) {
        const hasLegacyMatch = otherUserId
          ? await findLegacyMatch(config, currentUserId, otherUserId)
          : false;
        if (!hasLegacyMatch) {
          return res.json({ message: "Conversation unavailable" }, 403);
        }
      } else if (!relationshipAllowsMessaging(relationship, currentUserId, otherUserId)) {
        return res.json({ message: "Conversation unavailable" }, 403);
      }
    }

    await repairConversationAccess(config, threadId, currentUserId, participantRows, participantPermissions);

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
    const messagePermissions = messageRowPermissions(participantIds, currentUserId);
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
      }, messagePermissions);
    } catch (err) {
      throw new Error(`Failed creating row in ${config.messagesTableId}: ${err?.message ?? err}`);
    }

    // Update the thread preview immediately so inbox ordering stays in sync with the latest message.
    try {
      const previewText = text ?? attachmentName ?? defaultAttachmentPreview(messageType);
      await upsertThreadPreview(config, threadId, currentUserId, previewText, now, participantPermissions);
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
        }, participantPermissions);
      } catch (err) {
        error(`Non-fatal participant update failure in ${config.threadParticipantsTableId}: ${err?.message ?? err}`);
      }
    }

    const payload = makeChatMessageContract({
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
    });

    const responsePayload = payload ?? {
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
    };
    console.log(`RESULT_JSON:${JSON.stringify(responsePayload)}`);
    return res.json(responsePayload, 200);
  } catch (err) {
    error(String(err?.stack ?? err));
    return res.json({ message: err?.statusCode === 403 ? "Forbidden" : "Unable to send message" }, err?.statusCode ?? 500);
  }
};

function getConfig(req) {
  return {
    endpoint: requiredEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
    projectId: requiredEnv("APPWRITE_FUNCTION_PROJECT_ID"),
    apiKey: resolveApiKey(req),
    userJwt: optionalHeader(req, "x-appwrite-user-jwt"),
    databaseId: requiredEnv("APPWRITE_DATABASE_ID"),
    threadsTableId: requiredEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    messagesTableId: requiredEnv("APPWRITE_MESSAGES_TABLE_ID"),
    chatAttachmentsBucketId: optionalEnv("APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID"),
    relationshipsTableId: optionalEnv("APPWRITE_RELATIONSHIPS_TABLE_ID"),
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

function messageRowPermissions(participantIds, currentUserId) {
  const permissions = participantIds.map((userId) => `read("user:${userId}")`);
  permissions.push(`update("user:${currentUserId}")`);
  permissions.push(`delete("user:${currentUserId}")`);
  return Array.from(new Set(permissions));
}

function conversationRowPermissions(participantIds) {
  return Array.from(new Set(participantIds.flatMap((userId) => [
    `read("user:${userId}")`,
    `update("user:${userId}")`,
    `delete("user:${userId}")`
  ])));
}

async function repairConversationAccess(config, threadId, currentUserId, participantRows, permissions) {
  const threadRow = await getRowIfExists(config, config.threadsTableId, threadId);
  if (threadRow?.$id) {
    await updateRow(config, config.threadsTableId, threadId, {
      threadId,
      createdByUserId: threadRow.createdByUserId ?? currentUserId,
      subject: threadRow.subject ?? DEFAULT_MATCH_SUBJECT,
      status: threadRow.status ?? "active",
      lastMessageText: threadRow.lastMessageText ?? null,
      lastMessageAt: threadRow.lastMessageAt ?? null
    }, permissions);
  } else {
    try {
      await createRow(config, config.threadsTableId, threadId, {
        threadId,
        createdByUserId: currentUserId,
        subject: DEFAULT_MATCH_SUBJECT,
        status: "active",
        lastMessageText: null,
        lastMessageAt: null
      }, permissions);
    } catch (err) {
      if (!isAlreadyExistsError(err)) {
        throw new Error(`Failed creating row in ${config.threadsTableId}: ${err?.message ?? err}`);
      }
    }
  }

  for (const participantRow of participantRows) {
    const participantRowId = asString(participantRow.$id);
    const userId = asString(participantRow.userId);
    if (!participantRowId || !userId) {
      continue;
    }

    await updateRow(config, config.threadParticipantsTableId, participantRowId, {
      threadId,
      userId,
      role: participantRow.role ?? "member",
      lastReadAt: participantRow.lastReadAt ?? null,
      muted: participantRow.muted ?? false,
      pinned: participantRow.pinned ?? false,
      notificationsEnabled: participantRow.notificationsEnabled ?? true
    }, permissions);
  }
}

async function upsertThreadPreview(config, threadId, currentUserId, previewText, lastMessageAt, permissions) {
  const threadRow = await getRowIfExists(config, config.threadsTableId, threadId);
  if (threadRow?.$id) {
    await updateRow(config, config.threadsTableId, threadId, {
      threadId,
      createdByUserId: threadRow.createdByUserId ?? currentUserId,
      subject: threadRow.subject ?? DEFAULT_MATCH_SUBJECT,
      status: threadRow.status ?? "active",
      lastMessageText: previewText,
      lastMessageAt
    }, permissions);
    return;
  }

  try {
    await createRow(config, config.threadsTableId, threadId, {
      threadId,
      createdByUserId: currentUserId,
      subject: DEFAULT_MATCH_SUBJECT,
      status: "active",
      lastMessageText: previewText,
      lastMessageAt
    }, permissions);
  } catch (err) {
    if (!isAlreadyExistsError(err)) {
      throw new Error(`Failed creating row in ${config.threadsTableId}: ${err?.message ?? err}`);
    }

    const existingThread = await getRowIfExists(config, config.threadsTableId, threadId);
    await updateRow(config, config.threadsTableId, threadId, {
      threadId,
      createdByUserId: existingThread?.createdByUserId ?? currentUserId,
      subject: existingThread?.subject ?? DEFAULT_MATCH_SUBJECT,
      status: existingThread?.status ?? "active",
      lastMessageText: previewText,
      lastMessageAt
    }, permissions);
  }
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

async function findRelationshipRow(config, currentUserId, otherUserId) {
  if (!config.relationshipsTableId || !otherUserId) {
    return null;
  }

  const pairKey = [currentUserId, otherUserId].sort().join(":");
  const rows = await listRows(config, config.relationshipsTableId, [
    equal("pairKey", [pairKey]),
    limit(1)
  ]);
  return rows[0] ?? null;
}

async function findLegacyMatch(config, currentUserId, otherUserId) {
  if (!config.matchesTableId || !otherUserId) {
    return null;
  }

  const rows = await listRows(config, config.matchesTableId, [
    equal("matchKey", [[currentUserId, otherUserId].sort().join(":")]),
    limit(1)
  ]);
  return rows[0] ?? null;
}

function relationshipAllowsMessaging(relationship, currentUserId, otherUserId) {
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

async function getRow(config, tableId, rowId) {
  return request(config, "GET", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`);
}

async function getRowIfExists(config, tableId, rowId) {
  try {
    return await getRow(config, tableId, rowId);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

async function getFile(config, fileId) {
  return request(config, "GET", `/storage/buckets/${config.chatAttachmentsBucketId}/files/${fileId}`);
}

async function updateFile(config, fileId, data) {
  return request(config, "PUT", `/storage/buckets/${config.chatAttachmentsBucketId}/files/${fileId}`, data);
}

async function updateRow(config, tableId, rowId, data, permissions) {
  const body = { data };
  if (permissions) {
    body.permissions = permissions;
  }
  return request(config, "PATCH", `/tablesdb/${config.databaseId}/tables/${tableId}/rows/${rowId}`, body);
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
  return crypto.randomUUID().replaceAll("-", "");
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
