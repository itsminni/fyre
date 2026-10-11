import type { ChatMessage, ChatThread } from '../types/models';

function isClientGeneratedMessageId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function canDedupeChatMessagePair(left: ChatMessage, right: ChatMessage): boolean {
  return left.id === right.id;
}

function messageCompletenessScore(message: ChatMessage): number {
  return [
    message.readAt,
    message.deliveryState,
    message.senderName,
    message.attachments?.length ? 'attachments' : ''
  ].filter(Boolean).length;
}

function preferChatMessage(existing: ChatMessage, candidate: ChatMessage): ChatMessage {
  const rank = (message: ChatMessage) => message.readAt ? 4
    : ({ read: 4, delivered: 3, sent: 2, sending: 1, failed: 0, cancelled: 0 }[message.deliveryState ?? 'sent']);
  if (rank(existing) >= 2 || rank(candidate) >= 2) {
    if (rank(existing) > rank(candidate)) return existing;
    if (rank(candidate) > rank(existing)) return candidate;
  }
  return messageCompletenessScore(candidate) >= messageCompletenessScore(existing)
    ? { ...existing, ...candidate }
    : { ...candidate, ...existing };
}

function dedupeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const deduped: ChatMessage[] = [];

  for (const message of messages) {
    const duplicateIndex = deduped.findIndex((existing) => canDedupeChatMessagePair(existing, message));
    if (duplicateIndex >= 0) {
      deduped[duplicateIndex] = preferChatMessage(deduped[duplicateIndex], message);
    } else {
      deduped.push(message);
    }
  }

  return deduped.sort((left, right) => {
    const leftTimestamp = Date.parse(left.createdAt);
    const rightTimestamp = Date.parse(right.createdAt);
    return (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp)
      - (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp)
      || left.id.localeCompare(right.id);
  });
}

export function mergeChatMessages(existingMessages: ChatMessage[], incomingMessages: ChatMessage[]): ChatMessage[] {
  return dedupeChatMessages([...existingMessages, ...incomingMessages]);
}

export function mergeChatThreads(fetchedThreads: ChatThread[], cachedThreads: ChatThread[]): ChatThread[] {
  const merged = fetchedThreads.map((thread) => ({
    ...thread,
    messages: dedupeChatMessages(thread.messages)
  }));
  const fetchedThreadIds = new Set(fetchedThreads.map((thread) => thread.id));

  for (const cachedThread of cachedThreads) {
    const normalizedCachedThread = {
      ...cachedThread,
      messages: dedupeChatMessages(cachedThread.messages)
    };
    const existingIndex = merged.findIndex((thread) => thread.id === cachedThread.id);
    if (existingIndex >= 0) {
      const mergedMessages = mergeChatMessages(merged[existingIndex].messages, normalizedCachedThread.messages);
      merged[existingIndex] = {
        ...merged[existingIndex],
        historyLoaded: merged[existingIndex].historyLoaded || normalizedCachedThread.historyLoaded,
        historyCursor: normalizedCachedThread.historyLoaded
          ? normalizedCachedThread.historyCursor : merged[existingIndex].historyCursor,
        messages: mergedMessages
      };
    } else if (
      !fetchedThreadIds.has(normalizedCachedThread.id) &&
      normalizedCachedThread.messages.some((message) => (
        (isClientGeneratedMessageId(message.id) || Boolean(message.operationId)) && message.deliveryState === 'sending'
      ))
    ) {
      // Preserve only an explicit optimistic send. A successful authoritative
      // fetch must remove conversations whose ACL was revoked by block/unmatch.
      merged.unshift(normalizedCachedThread);
    }
  }

  return merged.sort((left, right) => {
    const leftLastMessage = left.messages[left.messages.length - 1];
    const rightLastMessage = right.messages[right.messages.length - 1];
    const leftTimestamp = Date.parse(leftLastMessage?.createdAt ?? left.createdAt);
    const rightTimestamp = Date.parse(rightLastMessage?.createdAt ?? right.createdAt);
    return (Number.isNaN(rightTimestamp) ? 0 : rightTimestamp)
      - (Number.isNaN(leftTimestamp) ? 0 : leftTimestamp);
  });
}
