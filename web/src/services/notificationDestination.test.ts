import { describe, expect, it } from 'vitest';
import { notificationDestination } from './notificationDestination';

describe('notification destinations', () => {
  const base = { id: 'notification', title: '', body: '', createdAt: '2030-01-01T00:00:00.000Z' };
  it('opens the intended chat using an encoded identifier', () => {
    expect(notificationDestination({ ...base, type: 'chat', threadId: '../events?next=outside' })).toBe('/app/messages/..%2Fevents%3Fnext%3Doutside');
    expect(notificationDestination({ ...base, type: 'match', threadId: 'chat' })).toBe('/app/messages/chat');
  });
  it('distinguishes event notifications from generic notices', () => {
    expect(notificationDestination({ ...base, type: 'event' })).toBe('/app/events/main');
    expect(notificationDestination({ ...base, type: 'system' })).toBeNull();
    expect(notificationDestination({ ...base, type: 'chat' })).toBeNull();
  });
});
