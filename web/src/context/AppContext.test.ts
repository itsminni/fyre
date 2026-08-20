import { describe, expect, it, vi } from 'vitest';
import type { ChatThread } from '../types/models';

vi.mock('../services/appwriteConfiguration', () => ({
  loadAppwriteConfiguration: () => ({
    endpoint: 'https://appwrite.example.test/v1',
    projectId: 'project',
    eventAdminFunctionId: ''
  })
}));

import { mergeChatThreads } from './AppContext';

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
