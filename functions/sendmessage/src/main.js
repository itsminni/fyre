import { createHash } from "node:crypto";
import { makeChatMessageContract } from "./contracts.js";

const DEFAULT_MATCH_SUBJECT = "Match";
const APPWRITE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;
const MAX_MESSAGE_TEXT_LENGTH = 4_000;
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const MAX_MEDIA_DIMENSION = 32_768;
const MAX_MEDIA_DURATION_SECONDS = 24 * 60 * 60;
const ATTACHMENT_MIME_TYPES = new Map([
  ["jpg", new Set(["image/jpeg"])],
  ["jpeg", new Set(["image/jpeg"])],
  ["png", new Set(["image/png"])],
  ["webp", new Set(["image/webp"])],
  ["heic", new Set(["image/heic", "image/heif"])],
  ["pdf", new Set(["application/pdf"])],
  ["m4a", new Set(["audio/mp4", "audio/x-m4a"])],
  ["mp3", new Set(["audio/mpeg"])],
  ["wav", new Set(["audio/wav", "audio/x-wav", "audio/wave"])],
  ["mp4", new Set(["video/mp4"])],
  ["mov", new Set(["video/quicktime"])]
]);

export default async ({ req, res, error }) => {
  try {
    const config = getConfig(req);
    const body = parseBody(req);
    const currentUserId = await resolveCurrentUserId(config, req, body);
    const action = asString(body.action) ?? "sendMessage";
    const threadId = appwriteIdentifier(body.threadId);
    const text = boundedOptionalString(body.text, MAX_MESSAGE_TEXT_LENGTH);
    const rawReplyToMessageId = asString(body.replyToMessageId);
    const replyToMessageId = appwriteIdentifier(rawReplyToMessageId);
    const requestedMessageType = asString(body.messageType) ?? "text";
    const rawAttachmentFileId = asString(body.attachmentFileId);
    const attachmentFileId = appwriteIdentifier(rawAttachmentFileId);
    let messageType = "text";
    let attachmentName = null;
    let attachmentMimeType = null;
    let attachmentSize = null;
    let attachmentWidth = null;
    let attachmentHeight = null;
    let attachmentDuration = null;

    if (
      !threadId
      || (typeof body.text === "string" && body.text.trim().length > MAX_MESSAGE_TEXT_LENGTH)
      || (body.replyToMessageId != null && body.replyToMessageId !== "" && !replyToMessageId)
      || (body.attachmentFileId != null && body.attachmentFileId !== "" && !attachmentFileId)
      || !["text", "image", "video", "audio", "file"].includes(requestedMessageType)
      || (action !== "sendMessage" && action !== "updateParticipant")
    ) {
      return res.json({ message: "Missing payload" }, 400);
    }

    const participantRows = await listRows(config, config.threadParticipantsTableId, [
      equal("threadId", [threadId]),
      limit(10)
    ]);
    const participantContext = validateParticipantRows(threadId, participantRows);
    if (!participantContext) {
      return res.json({ message: "Conversation unavailable" }, 403);
    }
    const participantIds = participantContext.userIds;
    const sharedPermissions = conversationRowPermissions(participantIds);
    const currentParticipant = participantContext.rowsByUserId.get(currentUserId);

    // Only participants of the thread are allowed to append new messages to it.
    if (!currentParticipant) {
      return res.json({ message: "Forbidden" }, 403);
    }

    if (action === "updateParticipant") {
      const update = parseParticipantUpdate(body);
      if (!update) {
        return res.json({ message: "Invalid participant update" }, 400);
      }
      const now = new Date().toISOString();
      const lastReadAt = update.markRead ? now : (asString(currentParticipant.lastReadAt) ?? null);
      const notificationsEnabled = update.notificationsEnabled ?? (currentParticipant.notificationsEnabled !== false);
      const pinned = update.pinned ?? (currentParticipant.pinned === true);
      await updateRow(config, config.threadParticipantsTableId, currentParticipant.$id, {
        threadId,
        userId: currentUserId,
        role: "participant",
        lastReadAt,
        muted: currentParticipant.muted === true,
        pinned,
        notificationsEnabled
      }, sharedPermissions);
      return res.json({
        ok: true,
        threadId,
        lastReadAt,
        notificationsEnabled,
        pinned
      }, 200);
    }

    if (!text && !attachmentFileId) {
      return res.json({ message: "Missing payload" }, 400);
    }

    const otherUserId = participantIds.find((userId) => userId !== currentUserId);
    const relationship = otherUserId
      ? await findRelationshipRow(config, currentUserId, otherUserId)
      : null;
    if (!relationship || !relationshipAllowsMessaging(relationship, currentUserId, otherUserId, threadId)) {
      return res.json({ message: "Conversation unavailable" }, 403);
    }

    if (replyToMessageId) {
      const reply = await getRowIfExists(config, config.messagesTableId, replyToMessageId);
      if (!isReplyInThread(reply, replyToMessageId, threadId)) {
        return res.json({ message: "Invalid reply reference" }, 400);
      }
    }

    await repairConversationAccess(config, threadId, currentUserId, participantRows, sharedPermissions);

    if (attachmentFileId) {
      if (!config.chatAttachmentsBucketId) {
        throw new Error("Missing environment variable APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID");
      }

      try {
        const file = await getFile(config, attachmentFileId);
        if (!hasFileOwnership(file, currentUserId)) {
          throw authError("Attachment ownership required");
        }
        const metadata = canonicalAttachmentMetadata(file, body);
        if (!metadata) {
          return res.json({ message: "Invalid attachment" }, 400);
        }
        ({
          messageType,
          attachmentName,
          attachmentMimeType,
          attachmentSize,
          attachmentWidth,
          attachmentHeight,
          attachmentDuration
        } = metadata);
        const permissions = participantIds.map((userId) => `read("user:${userId}")`);
        permissions.push(`update("user:${currentUserId}")`);
        permissions.push(`delete("user:${currentUserId}")`);

        await updateFile(config, attachmentFileId, {
          name: file.name,
          permissions
        });
      } catch (err) {
        if (err?.statusCode === 403) {
          throw err;
        }
        throw new Error("Failed updating attachment permissions");
      }
    } else if (requestedMessageType !== "text" || hasAttachmentMetadata(body)) {
      return res.json({ message: "Invalid attachment metadata" }, 400);
    }

    const now = new Date().toISOString();
    const messageId = uniqueId();
    const messagePermissions = messageRowPermissions(participantIds);
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
      await upsertThreadPreview(config, threadId, currentUserId, previewText, now, sharedPermissions);
    } catch (err) {
      error(`sendmessage thread preview update failed (${err?.statusCode ?? 500})`);
    }

    if (currentParticipant?.$id) {
      try {
        await updateRow(config, config.threadParticipantsTableId, currentParticipant.$id, {
          threadId,
          userId: currentUserId,
          role: "participant",
          lastReadAt: now,
          muted: currentParticipant.muted ?? false,
          pinned: currentParticipant.pinned ?? false,
          notificationsEnabled: currentParticipant.notificationsEnabled ?? true
        }, sharedPermissions);
      } catch (err) {
        error(`sendmessage participant update failed (${err?.statusCode ?? 500})`);
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
    console.log(JSON.stringify({
      event: "sendmessage.complete",
      messageType,
      hasAttachment: Boolean(attachmentFileId)
    }));
    return res.json(responsePayload, 200);
  } catch (err) {
    error(`sendmessage failed (${err?.statusCode ?? 500})`);
    const message = err?.statusCode === 401
      ? "Unauthorized"
      : err?.statusCode === 403
        ? "Forbidden"
        : "Unable to send message";
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
    threadsTableId: requiredIdentifierEnv("APPWRITE_THREADS_TABLE_ID"),
    threadParticipantsTableId: requiredIdentifierEnv("APPWRITE_THREAD_PARTICIPANTS_TABLE_ID"),
    messagesTableId: requiredIdentifierEnv("APPWRITE_MESSAGES_TABLE_ID"),
    chatAttachmentsBucketId: optionalIdentifierEnv("APPWRITE_CHAT_ATTACHMENTS_BUCKET_ID"),
    relationshipsTableId: requiredIdentifierEnv("APPWRITE_RELATIONSHIPS_TABLE_ID")
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

function optionalEnv(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function optionalIdentifierEnv(name) {
  const value = optionalEnv(name);
  if (value && !appwriteIdentifier(value)) {
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

export function validateParticipantRows(threadId, participantRows) {
  if (!Array.isArray(participantRows) || participantRows.length !== 2) {
    return null;
  }

  const rowsByUserId = new Map();
  const rowIds = new Set();
  for (const row of participantRows) {
    const userId = appwriteIdentifier(row?.userId);
    const rowId = asString(row?.$id);
    if (!userId
      || !rowId
      || asString(row?.threadId) !== threadId
      || rowId !== stableParticipantRowId(threadId, userId)
      || rowsByUserId.has(userId)
      || rowIds.has(rowId)) {
      return null;
    }
    rowsByUserId.set(userId, row);
    rowIds.add(rowId);
  }

  return {
    userIds: [...rowsByUserId.keys()].sort(),
    rowsByUserId
  };
}

function parseParticipantUpdate(body) {
  const allowedKeys = new Set([
    "action",
    "threadId",
    "currentUserId",
    "markRead",
    "notificationsEnabled",
    "pinned"
  ]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return null;
  }

  const hasMarkRead = Object.hasOwn(body, "markRead");
  const hasNotifications = Object.hasOwn(body, "notificationsEnabled");
  const hasPinned = Object.hasOwn(body, "pinned");
  if (!hasMarkRead && !hasNotifications && !hasPinned) {
    return null;
  }
  if ((hasMarkRead && body.markRead !== true)
    || (hasNotifications && typeof body.notificationsEnabled !== "boolean")
    || (hasPinned && typeof body.pinned !== "boolean")) {
    return null;
  }

  return {
    markRead: hasMarkRead,
    notificationsEnabled: hasNotifications ? body.notificationsEnabled : undefined,
    pinned: hasPinned ? body.pinned : undefined
  };
}

export function hasFileOwnership(file, userId) {
  if (!Array.isArray(file?.$permissions)) {
    return false;
  }
  const permissions = new Set(file.$permissions);
  return permissions.has(`update("user:${userId}")`)
    && permissions.has(`delete("user:${userId}")`);
}

function messageRowPermissions(participantIds) {
  return conversationRowPermissions(participantIds);
}

function conversationRowPermissions(participantIds) {
  return Array.from(new Set(participantIds.map((userId) => `read("user:${userId}")`)));
}

function stableParticipantRowId(threadId, userId) {
  return `tp_${createHash("sha256").update(`${threadId}:${userId}`).digest("hex").slice(0, 32)}`;
}

function stableRelationshipRowId(userIds) {
  return `rl_${createHash("sha256").update(userIds.join(":")).digest("hex").slice(0, 32)}`;
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
      role: "participant",
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
    `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`,
    undefined,
    queries
  );
  return Array.isArray(payload.rows) ? payload.rows : [];
}

async function createRow(config, tableId, rowId, data, permissions) {
  return request(config, "POST", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows`, {
    rowId,
    data,
    permissions
  });
}

async function findRelationshipRow(config, currentUserId, otherUserId) {
  if (!otherUserId) {
    return null;
  }

  const userIds = [currentUserId, otherUserId].sort();
  const relationship = await getRowIfExists(
    config,
    config.relationshipsTableId,
    stableRelationshipRowId(userIds)
  );
  return relationshipRowBelongsToPair(relationship, userIds) ? relationship : null;
}

function relationshipRowBelongsToPair(row, userIds) {
  return asString(row?.$id) === stableRelationshipRowId(userIds)
    && asString(row?.pairKey) === userIds.join(":")
    && asString(row?.userAId) === userIds[0]
    && asString(row?.userBId) === userIds[1];
}

export function relationshipAllowsMessaging(relationship, currentUserId, otherUserId, threadId) {
  const currentState = relationshipStateForUser(relationship, currentUserId);
  const otherState = relationshipStateForUser(relationship, otherUserId);

  return currentState === "matched"
    && otherState === "matched"
    && appwriteIdentifier(relationship.threadId) === threadId;
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
  return request(config, "GET", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`);
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
  return request(config, "GET", `/storage/buckets/${pathSegment(config.chatAttachmentsBucketId)}/files/${pathSegment(fileId)}`);
}

async function updateFile(config, fileId, data) {
  return request(config, "PUT", `/storage/buckets/${pathSegment(config.chatAttachmentsBucketId)}/files/${pathSegment(fileId)}`, data);
}

async function updateRow(config, tableId, rowId, data, permissions) {
  const body = { data };
  if (permissions) {
    body.permissions = permissions;
  }
  return request(config, "PATCH", `/tablesdb/${pathSegment(config.databaseId)}/tables/${pathSegment(tableId)}/rows/${pathSegment(rowId)}`, body);
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

export function appwriteIdentifier(value) {
  const identifier = asString(value);
  return identifier && APPWRITE_IDENTIFIER_PATTERN.test(identifier) ? identifier : null;
}

export function pathSegment(value) {
  return encodeURIComponent(String(value));
}

function boundedOptionalString(value, maximumLength) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximumLength ? trimmed : null;
}

function boundedOptionalNumber(value, minimum, maximum, integer = false) {
  if (value == null || value === "") {
    return null;
  }
  let parsed = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    parsed = value;
  } else if (typeof value === "string" && value.trim().length > 0) {
    const candidate = Number(value);
    parsed = Number.isFinite(candidate) ? candidate : null;
  }
  if (parsed == null || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    return undefined;
  }
  return parsed;
}

export function canonicalAttachmentMetadata(file, body) {
  const rawName = typeof file?.name === "string" ? file.name.trim() : "";
  const safeName = rawName.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  const mimeType = typeof file?.mimeType === "string" ? file.mimeType.trim().toLowerCase() : "";
  const size = boundedOptionalNumber(file?.sizeOriginal, 1, MAX_ATTACHMENT_SIZE, true);
  const extension = safeName.includes(".") ? safeName.split(".").at(-1).toLowerCase() : "";
  const allowedMimeTypes = ATTACHMENT_MIME_TYPES.get(extension);
  if (
    !safeName
    || safeName.length > 255
    || !allowedMimeTypes?.has(mimeType)
    || size == null
  ) {
    return null;
  }

  const messageType = mimeType.startsWith("image/")
    ? "image"
    : mimeType.startsWith("video/")
      ? "video"
      : mimeType.startsWith("audio/")
        ? "audio"
        : "file";
  const width = boundedOptionalNumber(body.attachmentWidth, 1, MAX_MEDIA_DIMENSION, true);
  const height = boundedOptionalNumber(body.attachmentHeight, 1, MAX_MEDIA_DIMENSION, true);
  const duration = boundedOptionalNumber(body.attachmentDuration, 0, MAX_MEDIA_DURATION_SECONDS);

  if (
    width === undefined
    || height === undefined
    || duration === undefined
    || ((width == null) !== (height == null))
    || ((messageType !== "image" && messageType !== "video") && (width != null || height != null))
    || ((messageType !== "audio" && messageType !== "video") && duration != null)
  ) {
    return null;
  }

  return {
    messageType,
    attachmentName: safeName,
    attachmentMimeType: mimeType,
    attachmentSize: size,
    attachmentWidth: width,
    attachmentHeight: height,
    attachmentDuration: duration
  };
}

export function isReplyInThread(reply, replyToMessageId, threadId) {
  return asString(reply?.$id) === replyToMessageId
    && asString(reply?.threadId) === threadId;
}

function hasAttachmentMetadata(body) {
  return [
    "attachmentName",
    "attachmentMimeType",
    "attachmentSize",
    "attachmentWidth",
    "attachmentHeight",
    "attachmentDuration"
  ].some((key) => body[key] != null && body[key] !== "");
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
