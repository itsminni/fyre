import { describe, expect, it } from 'vitest';
import { OfflineDemoService } from './OfflineDemoService';

describe('offline demo', () => {
  it('starts with a complete fictional account, logs out and resets independently', async () => {
    const demo = new OfflineDemoService();
    expect((await demo.restoreCurrentUser())?.firstName).toBe('Alex');
    await demo.logOut();
    expect(await demo.restoreCurrentUser()).toBeNull();
    expect(await new OfflineDemoService().restoreCurrentUser()).not.toBeNull();
  });
  it('creates matches, preserves send identities and keeps attachments local', async () => {
    const demo = new OfflineDemoService();
    const thread = await demo.submitSwipe('demo-sam', 'Sam', 'liked');
    expect(thread).not.toBeNull();
    const input = { threadId: thread!.id, text: 'Hello offline', operationId: crypto.randomUUID(),
      attachment: { id: 'local', type: 'file' as const, name: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 5, dataUrl: 'data:application/pdf;base64,aGVsbG8=' } };
    expect(await demo.sendMessage(input)).toEqual(await demo.sendMessage(input));
    expect((await demo.fetchThread(thread!.id))?.messages).toHaveLength(1);
    expect((await demo.fetchDiscoverPage()).profiles.some((profile) => profile.id === 'demo-sam')).toBe(false);
  });
  it('paginates all 120 messages', async () => {
    const demo = new OfflineDemoService();
    const first = (await demo.fetchThread('demo-chat'))!;
    const second = await demo.fetchMessagePage('demo-chat', first.historyCursor!);
    const third = await demo.fetchMessagePage('demo-chat', second.nextCursor!);
    expect([...third.messages, ...second.messages, ...first.messages]).toHaveLength(120);
    expect(third.messages[0].id).toBe('demo-history-1');
    expect(third.nextCursor).toBeNull();
  });
  it('registers, cancels and manages a fictional roster', async () => {
    const demo = new OfflineDemoService();
    const user = (await demo.restoreCurrentUser())!;
    await demo.registerForMainEvent(user);
    await demo.registerForMainEvent(user);
    expect((await demo.fetchEventAdminState()).participants).toHaveLength(2);
    expect((await demo.fetchMainEventState(user)).currentStatus).toBe('confirmed');
    await demo.cancelMainEventRegistration(user);
    expect((await demo.fetchMainEventState(user)).currentStatus).toBe('cancelled');
    const current = await demo.fetchEventAdminState();
    const updated = await demo.updateMainEventAsAdmin(current.eventId, { ...current, title: 'Changed locally' });
    expect(updated.title).toBe('Changed locally');
    await demo.removeMainEventParticipantAsAdmin(current.eventId, 'demo-registration');
    expect((await demo.fetchEventAdminState()).participants).toHaveLength(0);
  });
});
