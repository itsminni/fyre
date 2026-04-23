export function makeChatMessageContract(input) {
  if (!isRecord(input)) {
    return null;
  }

  const messageId = asString(input.messageId ?? input.id);
  if (!messageId) {
    return null;
  }

  const createdAt = normalizeIsoDate(input.createdAt);
  if (!createdAt) {
    return null;
  }

  return {
    messageId,
    text: asString(input.text) ?? "",
    messageType: normalizeChatMessageType(input.messageType),
    attachmentFileId: asString(input.attachmentFileId) ?? undefined,
    attachmentName: asString(input.attachmentName) ?? undefined,
    attachmentMimeType: asString(input.attachmentMimeType) ?? undefined,
    attachmentSize: normalizeNullableInteger(input.attachmentSize) ?? undefined,
    attachmentWidth: normalizeNullableInteger(input.attachmentWidth) ?? undefined,
    attachmentHeight: normalizeNullableInteger(input.attachmentHeight) ?? undefined,
    attachmentDuration: normalizeNullableInteger(input.attachmentDuration) ?? undefined,
    replyToMessageId: asString(input.replyToMessageId) ?? undefined,
    createdAt
  };
}

const CHAT_MESSAGE_TYPES = ["text", "image", "video", "audio", "file"];

function normalizeChatMessageType(value) {
  const normalized = asString(value);
  return CHAT_MESSAGE_TYPES.includes(normalized) ? normalized : "text";
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function asString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNullableInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function normalizeIsoDate(value) {
  const normalized = asString(value);
  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}
