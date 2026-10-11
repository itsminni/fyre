import { describe, expect, it } from 'vitest';
import type { ChatThread } from '../types/models';

import { mergeChatThreads } from '../services/chatState';

function thread(id: string, messageId: string, deliveryState: 'sending' | 'sent'): ChatThread {
  return {
    id,
    name: id,
    avatar: '',
    isOnline: false,
    unreadCount: 0,
    createdAt: '2030-01-01T00:00:00.000Z',
    notificationsEnabled: true,
    messages: [{
      id: messageId,
      text: 'message',
      isMe: true,
      time: '12:00',
      createdAt: '2030-01-01T00:00:00.000Z',
      deliveryState
    }]
  };
}

describe('authoritative thread refresh', () => {
  it('does not resurrect a cached thread removed by backend ACLs', () => {
    const cached = thread('revoked', 'server-message', 'sent');

    expect(mergeChatThreads([], [cached])).toEqual([]);
  });

  it('temporarily keeps an explicit optimistic send', () => {
    const optimistic = thread(
      'new-thread',
      '00000000-0000-4000-8000-000000000001',
      'sending'
    );

    expect(mergeChatThreads([], [optimistic])).toEqual([optimistic]);
  });
});


describe('message reconciliation', () => {
  it('retains two identical intentional sends with different operation identities', () => {
    const first = thread('chat', '00000000-0000-4000-8000-000000000001', 'sent');
    const second = thread('chat', 'm_another', 'sent');
    expect(mergeChatThreads([second], [first])[0].messages).toHaveLength(2);
  });

  it('uses fresh unread counts while preserving loaded history and its cursor', () => {
    const cached = thread('chat', 'old', 'sent');
    cached.historyLoaded = true; cached.historyCursor = 'older'; cached.unreadCount = 9;
    const summary = thread('chat', 'new', 'sent'); summary.unreadCount = 2; summary.historyLoaded = false;
    const merged = mergeChatThreads([summary], [cached])[0];
    expect(merged.unreadCount).toBe(2); expect(merged.historyCursor).toBe('older');
    expect(merged.messages).toHaveLength(2);
  });

  it('does not replace a server-confirmed send with an optimistic failure', () => {
    const sent = thread('chat', 'm_id', 'sent');
    const failed = thread('chat', 'm_id', 'sending'); failed.messages[0].deliveryState = 'failed';
    expect(mergeChatThreads([sent], [failed])[0].messages[0].deliveryState).toBe('sent');
  });
});


describe('history ordering and receipts', () => {
  it('uses identity to order simultaneous messages across page boundaries', () => {
    const newest = thread('chat', 'm_b', 'sent');
    const older = thread('chat', 'm_a', 'sent');
    expect(mergeChatThreads([newest], [older])[0].messages.map((message) => message.id)).toEqual(['m_a', 'm_b']);
  });
  it('does not downgrade a read receipt after a late send response', () => {
    const read = thread('chat', 'm_id', 'sent'); read.messages[0].deliveryState = 'read';
    const late = thread('chat', 'm_id', 'sent'); late.messages[0].senderName = 'Alex';
    expect(mergeChatThreads([late], [read])[0].messages[0].deliveryState).toBe('read');
  });
});


it('transitions an optimistic send to failure and back to sending on retry', () => {
  const pending = thread('chat', 'm_id', 'sending');
  const failed = thread('chat', 'm_id', 'sending'); failed.messages[0].deliveryState = 'failed';
  expect(mergeChatThreads([pending], [failed])[0].messages[0].deliveryState).toBe('failed');
  expect(mergeChatThreads([failed], [pending])[0].messages[0].deliveryState).toBe('sending');
});
