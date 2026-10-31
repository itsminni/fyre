import type { AppwriteService, EventRemoteState } from '../services/appwriteService';
import type { ChatMessage, ChatThread, DiscoverProfile, EventAdminState, EventHistoryStatus, User } from '../types/models';
import { messageOperationId } from '../services/uploads';
import { formatTime } from '../utils/formatTime';

export type ApplicationService = Pick<AppwriteService,
  'restoreCurrentUser' | 'signUp' | 'logIn' | 'logOut' | 'updateProfile' | 'updateProfileImage' |
  'fetchDiscoverPage' | 'fetchThreads' | 'fetchThread' | 'fetchMessagePage' | 'sendMessage' |
  'markThreadRead' | 'updateThreadNotifications' | 'markCurrentUserPresence' | 'subscribeToChatRealtime' |
  'submitSwipe' | 'updateRelationship' | 'fetchMainEventState' | 'registerForMainEvent' |
  'cancelMainEventRegistration' | 'fetchEventAdminState' | 'updateMainEventAsAdmin' |
  'addMainEventParticipantAsAdmin' | 'removeMainEventParticipantAsAdmin'>;

const clone = <T>(value: T): T => structuredClone(value);
const initialUser = (): User => ({ email: 'demo@example.invalid', appwriteUserId: 'offline-demo-user',
  firstName: 'Alex', lastName: 'Demo', city: 'Modena', latitude: 44.6471, longitude: 10.9252,
  birthDate: '2000-01-01', gender: 'male', orientation: 'straight', preferredGenders: ['female', 'male', 'nonBinary', 'other'],
  bio: 'Profilo dimostrativo: cinema, musica e nuove amicizie.', intent: 'friendship', interests: 'Cinema, Musica, Viaggi' });

/** Process-local fictional backend. It has no transport or fallback to Appwrite. */
export class OfflineDemoService implements ApplicationService {
  private user: User | null = initialUser();
  private profiles: DiscoverProfile[] = ['Sam', 'Jules', 'Robin'].map((name, index) => ({
    id: `demo-${name.toLowerCase()}`, name, age: 25 + index, city: 'Modena', distanceKm: index + 3,
    bio: 'Profilo fittizio della demo offline.', intent: 'friendship', commonInterests: ['Cinema', 'Musica']
  }));
  private threads: ChatThread[] = [{ id: 'demo-chat', name: 'Taylor', avatar: 'T', isOnline: false,
    unreadCount: 1, createdAt: new Date().toISOString(), notificationsEnabled: true, relationshipState: 'matched',
    messages: Array.from({ length: 120 }, (_, index) => ({ id: `demo-history-${index + 1}`,
      text: index === 119 ? 'Benvenuto! Puoi scrivere senza configurare Appwrite.' : `Messaggio dimostrativo ${index + 1}`,
      isMe: index % 3 === 0, time: formatTime(new Date(Date.now() - (120 - index) * 60_000)),
      createdAt: new Date(Date.now() - (120 - index) * 60_000).toISOString(), deliveryState: 'read' })) }];
  private listeners = new Set<() => void>();
  private status: EventHistoryStatus | null = null;
  private event: EventAdminState & { maleCount: number; femaleCount: number; waitingListCount: number } = {
    eventId: 'demo-event', status: 'active', title: 'Aperitivo Fyre · Demo', place: 'Modena · luogo dimostrativo',
    description: 'Evento fittizio. Iscrizioni e amministrazione modificano soltanto i dati della demo.',
    rules: ['Rispetta gli altri partecipanti', 'Dati dimostrativi'], startsAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
    maxParticipants: 24, maleLimit: 12, femaleLimit: 12, maleCount: 1, femaleCount: 0, waitingListCount: 0,
    registrationClosesAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
    cancellationClosesAt: new Date(Date.now() + 2 * 86400_000).toISOString(), participants: [
      { registrationId: 'demo-registration', userId: 'demo-sam', email: 'sam@example.invalid', displayName: 'Sam', gender: 'male', status: 'confirmed' }
    ]
  };

  async restoreCurrentUser() { return clone(this.user); }
  async signUp(email: string, _password: string) { this.user = { ...initialUser(), email }; return clone(this.user); }
  async logIn(_email: string, _password: string) { this.user = initialUser(); return clone(this.user); }
  async logOut() { this.user = null; }
  async updateProfile(user: User) { this.user = clone(user); return clone(user); }
  async updateProfileImage(user: User, image: string) { return this.updateProfile({ ...user, profileImageData: image || undefined }); }
  async fetchDiscoverPage(_cursor: string | null = null) { return { profiles: clone(this.profiles), nextCursor: null }; }
  async fetchThreads() { return this.threads.map((thread) => ({ ...clone(thread), messages: clone(thread.messages.slice(-1)), historyLoaded: false })); }
  async fetchThread(threadId: string) {
    const thread = this.threads.find((item) => item.id === threadId);
    return thread ? { ...clone(thread), messages: clone(thread.messages.slice(-50)), historyLoaded: true,
      historyCursor: thread.messages.length > 50 ? thread.messages[thread.messages.length - 50].id : null } : null;
  }
  async fetchMessagePage(threadId: string, before?: string) {
    const thread = this.requireThread(threadId);
    const end = before ? thread.messages.findIndex((message) => message.id === before) : thread.messages.length;
    if (end < 0) throw new Error('Unknown demo cursor');
    const start = Math.max(0, end - 50);
    return { messages: clone(thread.messages.slice(start, end)), nextCursor: start > 0 ? thread.messages[start].id : null };
  }
  async sendMessage(input: Parameters<AppwriteService['sendMessage']>[0]): Promise<ChatMessage> {
    if (!this.user) throw new Error('Demo session unavailable');
    input.control?.checkCancellation();
    const thread = this.requireThread(input.threadId);
    const id = await messageOperationId(this.user.appwriteUserId!, input.threadId, input.operationId ?? crypto.randomUUID());
    const previous = thread.messages.find((message) => message.id === id);
    if (previous) return clone(previous);
    input.control?.checkCancellation();
    input.control?.beginCommit();
    const date = new Date();
    const message: ChatMessage = { id, text: input.text, isMe: true, createdAt: date.toISOString(), time: formatTime(date),
      replyToMessageId: input.replyToMessageId, attachments: input.attachment ? [clone(input.attachment)] : undefined, deliveryState: 'sent' };
    thread.messages.push(message); this.changed(); return clone(message);
  }
  async markThreadRead(id: string) { this.requireThread(id).unreadCount = 0; }
  async updateThreadNotifications(id: string, enabled: boolean) { this.requireThread(id).notificationsEnabled = enabled; }
  async markCurrentUserPresence(_online: boolean) { /* Local demo has no presence transport. */ }
  subscribeToChatRealtime(handler: () => void) { this.listeners.add(handler); return () => { this.listeners.delete(handler); }; }
  async submitSwipe(id: string, name: string | null, decision: 'liked' | 'passed') {
    this.profiles = this.profiles.filter((profile) => profile.id !== id);
    if (decision === 'passed') return null;
    const thread: ChatThread = { id: `chat-${id}`, name: name ?? 'Demo', avatar: name?.slice(0, 1) ?? 'D', isOnline: false,
      unreadCount: 0, createdAt: new Date().toISOString(), notificationsEnabled: true, relationshipState: 'matched', messages: [], historyLoaded: true };
    if (!this.threads.some((item) => item.id === thread.id)) this.threads.push(thread);
    this.changed(); return clone(thread);
  }
  async updateRelationship(id: string, _action: 'archive' | 'unmatch' | 'block') { this.threads = this.threads.filter((thread) => thread.id !== id); this.changed(); }
  async fetchMainEventState(user: User | null): Promise<EventRemoteState> {
    const event = await this.fetchEventAdminState();
    return { eventId: event.eventId, snapshot: { date: event.startsAt, title: event.title, maxParticipants: event.maxParticipants,
      maleLimit: event.maleLimit, femaleLimit: event.femaleLimit, maleCount: event.maleCount, femaleCount: event.femaleCount,
      waitingListCount: event.waitingListCount, totalCount: event.maleCount + event.femaleCount,
      remainingMaleSlots: Math.max(0, event.maleLimit - event.maleCount), remainingFemaleSlots: Math.max(0, event.femaleLimit - event.femaleCount) },
      info: { venue: event.place, description: event.description, rules: event.rules,
        registrationClosesAt: event.registrationClosesAt, cancellationClosesAt: event.cancellationClosesAt },
      currentStatus: this.status, history: this.status && user ? [{ id: 'demo-history', email: user.email, eventTitle: event.title,
        eventDate: event.startsAt, status: this.status, timestamp: new Date().toISOString() }] : [] };
  }
  async registerForMainEvent(user: User, _eventId?: string): Promise<EventHistoryStatus> {
    this.status = 'confirmed';
    await this.addMainEventParticipantAsAdmin(this.event.eventId, user.email, 'confirmed');
    return this.status;
  }
  async cancelMainEventRegistration(user: User, _eventId?: string) {
    this.status = 'cancelled'; this.event.participants = this.event.participants.filter((participant) => participant.email !== user.email);
  }
  async fetchEventAdminState(_id?: string) {
    const active = this.event.participants.filter((participant) => ['confirmed', 'promoted'].includes(participant.status));
    this.event.maleCount = active.filter((participant) => participant.gender === 'male').length;
    this.event.femaleCount = active.filter((participant) => participant.gender === 'female').length;
    this.event.waitingListCount = this.event.participants.filter((participant) => participant.status === 'waitlisted').length;
    return clone(this.event);
  }
  async updateMainEventAsAdmin(_id: string, draft: Parameters<AppwriteService['updateMainEventAsAdmin']>[1]) {
    Object.assign(this.event, clone(draft)); return this.fetchEventAdminState();
  }
  async addMainEventParticipantAsAdmin(_id: string, lookup: string, status: Parameters<AppwriteService['addMainEventParticipantAsAdmin']>[2]) {
    this.event.participants = this.event.participants.filter((participant) => participant.email !== lookup);
    this.event.participants.push({ registrationId: `demo-${lookup}`, userId: `demo-${lookup}`, email: lookup,
      displayName: lookup === this.user?.email ? 'Alex Demo' : lookup.split('@')[0], gender: 'male', status });
    return this.fetchEventAdminState();
  }
  async removeMainEventParticipantAsAdmin(_id: string, registrationId: string) {
    const removed = this.event.participants.find((participant) => participant.registrationId === registrationId);
    if (removed?.email === this.user?.email) this.status = 'cancelled';
    this.event.participants = this.event.participants.filter((participant) => participant.registrationId !== registrationId);
    return this.fetchEventAdminState();
  }
  private requireThread(id: string) { const thread = this.threads.find((item) => item.id === id); if (!thread) throw new Error('Unknown demo chat'); return thread; }
  private changed() { queueMicrotask(() => this.listeners.forEach((handler) => handler())); }
}
