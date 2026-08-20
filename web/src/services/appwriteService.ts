import {
  ChatAttachment,
  ChatMessage,
  ChatThread,
  DiscoverProfile,
  EventAdminDraftInput,
  EventAdminMutableStatus,
  EventAdminParticipant,
  EventAdminState,
  EventHistoryItem,
  EventHistoryStatus,
  EventPublicationStatus,
  MainEventInfo,
  MainEventSnapshot,
  RelationshipState,
  User,
  UserGender,
  UserOrientation,
  normalizeEmail,
  normalizeUser
} from '../types/models';
import { formatTime } from '../utils/formatTime';
import { AppwriteConfiguration } from './appwriteConfiguration';
import { Client } from 'appwrite';
import {
  parseChatMessageContract,
  parseDiscoverProfilesPayload
} from '../../../shared/contracts/index.js';

const RESPONSE_FORMAT = '1.8.0';
const ACTIVE_EVENT_STATUSES = new Set<EventHistoryStatus>(['confirmed', 'promoted', 'waitlisted']);
const EVENT_PUBLICATION_STATUSES = new Set<EventPublicationStatus>([
  'active',
  'draft',
  'cancelled',
  'completed',
  'archived'
]);
const APPWRITE_ROWS_PAGE_SIZE = 100;
const EVENT_ADMIN_PARTICIPANT_PAGE_SIZE = 100;
const MAX_EVENT_ADMIN_PARTICIPANTS = 1_000;
const MAX_DISCOVERY_WINDOWS = 4;

export interface EventRemoteState {
  eventId: string;
  snapshot: MainEventSnapshot;
  info: Pick<
    MainEventInfo,
    'venue' | 'description' | 'rules' | 'registrationClosesAt' | 'cancellationClosesAt'
  >;
  currentStatus: EventHistoryStatus | null;
  history: EventHistoryItem[];
}

interface AppwriteAccount {
  $id?: string;
  email?: string;
}

interface AppwriteExecutionResponse {
  $id?: string;
  status?: string;
  responseStatusCode?: number;
  statusCode?: number;
  responseBody?: unknown;
  response?: unknown;
  logs?: unknown;
}

interface ChatPeerProjection {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  presenceUpdatedAt: string | null;
  lastSeenAt: string | null;
}

export class AppwriteServiceError extends Error {
  readonly statusCode: number | null;
  readonly type: string | null;
  readonly payload: unknown;

  constructor(message: string, statusCode: number | null = null, type: string | null = null, payload: unknown = null) {
    super(message);
    this.name = 'AppwriteServiceError';
    this.statusCode = statusCode;
    this.type = type;
    this.payload = payload;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }
}

export class AppwriteService {
  private readonly endpoint: string;
  private readonly projectId: string;
  private readonly configuration: AppwriteConfiguration;
  private realtimeClient: Client | null = null;
  private cachedFunctionJwt: { value: string; expiresAt: number } | null = null;

  constructor(configuration: AppwriteConfiguration) {
    this.configuration = configuration;
    this.projectId = configuration.projectId;
    this.endpoint = configuration.endpoint.endsWith('/')
      ? configuration.endpoint.slice(0, -1)
      : configuration.endpoint;
  }

  async signUp(email: string, password: string): Promise<User> {
    const normalizedEmail = normalizeEmail(email);

    try {
      await this.createAccount(normalizedEmail, password);
    } catch (error) {
      if (!(error instanceof AppwriteServiceError) || error.statusCode !== 409) {
        throw error;
      }
    }

    return this.logIn(normalizedEmail, password);
  }

  async logIn(email: string, password: string): Promise<User> {
    await this.createEmailSession(email, password);
    const user = await this.restoreCurrentUser();

    if (!user) {
      throw new AppwriteServiceError('Missing account after login', 500);
    }

    return user;
  }

  async restoreCurrentUser(): Promise<User | null> {
    const account = await this.fetchCurrentAccount(false);
    if (!account) {
      return null;
    }

    return this.hydrateUser(account);
  }

  async logOut(): Promise<void> {
    this.cachedFunctionJwt = null;
    try {
      await this.sendJsonRequest('DELETE', '/account/sessions/current', {
        // An expired/missing session is already logged out and must not leave
        // the client permanently blocked behind its logout tombstone.
        expectedStatusCodes: [204, 401]
      });
    } finally {
      this.cachedFunctionJwt = null;
    }
  }

  async updateProfile(user: User): Promise<User> {
    const accountId = await this.resolveRequiredAccountId(user);

    let nextAvatarFileId = user.avatarFileId ?? null;
    if (user.profileImageData && user.profileImageData.trim().length > 0 && !nextAvatarFileId) {
      nextAvatarFileId = this.makeRandomIdentifier();
      await this.uploadAvatarDataUrl(user.profileImageData, nextAvatarFileId, accountId);
    }

    let nextPhotoFileIds = user.photoFileIds ?? [];
    if (Array.isArray(user.profilePhotoDataItems)) {
      const preservedFileIds = user.photoFileIds ?? [];
      const usedPreservedFileIds = new Set<string>();
      nextPhotoFileIds = [];

      for (const photoItem of user.profilePhotoDataItems.slice(0, 6)) {
        if (photoItem.startsWith('data:')) {
          const [uploadedFileId] = await this.uploadProfilePhotoDataUrls([photoItem], accountId);
          if (uploadedFileId) {
            nextPhotoFileIds.push(uploadedFileId);
          }
          continue;
        }

        const preservedFileId = preservedFileIds.find(
          (fileId) => !usedPreservedFileIds.has(fileId) && photoItem.includes(fileId)
        );
        if (preservedFileId) {
          usedPreservedFileIds.add(preservedFileId);
          nextPhotoFileIds.push(preservedFileId);
        }
      }
    }

    const payload = this.makeProfilePayload({
      ...user,
      appwriteUserId: accountId,
      avatarFileId: nextAvatarFileId ?? undefined,
      photoFileIds: nextPhotoFileIds
    });

    await this.executeUserFunction(this.configuration.manageProfileFunctionId, {
      action: 'upsert',
      ...payload
    });

    const refreshed = await this.restoreCurrentUser();
    if (!refreshed) {
      throw new AppwriteServiceError('Missing account after profile update', 500);
    }

    return refreshed;
  }

  async updateProfileImage(user: User, profileImageData: string): Promise<User> {
    const accountId = await this.resolveRequiredAccountId(user);
    const previousAvatarFileId = user.avatarFileId ?? null;
    const trimmedImageData = profileImageData.trim();

    if (trimmedImageData.length === 0) {
      const updated = await this.updateProfile({
        ...user,
        appwriteUserId: accountId,
        avatarFileId: undefined,
        profileImageData: undefined
      });

      if (previousAvatarFileId) {
        await this.deleteAvatarFile(previousAvatarFileId).catch(() => undefined);
      }

      return updated;
    }

    const nextAvatarFileId = this.makeRandomIdentifier();

    await this.uploadAvatarDataUrl(trimmedImageData, nextAvatarFileId, accountId);

    try {
      const updated = await this.updateProfile({
        ...user,
        appwriteUserId: accountId,
        avatarFileId: nextAvatarFileId,
        profileImageData: trimmedImageData
      });

      if (previousAvatarFileId && previousAvatarFileId !== nextAvatarFileId) {
        await this.deleteAvatarFile(previousAvatarFileId).catch(() => undefined);
      }

      return updated;
    } catch (error) {
      await this.deleteAvatarFile(nextAvatarFileId).catch(() => undefined);
      throw error;
    }
  }

  async fetchDiscoverProfiles(): Promise<DiscoverProfile[]> {
    const usedCursors = new Set<string>();
    let profileCursor: string | null = null;

    for (let window = 0; window < MAX_DISCOVERY_WINDOWS; window += 1) {
      const payload = await this.executeUserFunction(
        this.configuration.discoverProfilesFunctionId,
        profileCursor ? { profileCursor } : {}
      );
      if (!Array.isArray(payload.profiles)) {
        throw new AppwriteServiceError('Invalid discover profiles response', 500, null, payload);
      }

      const profiles = parseDiscoverProfilesPayload(payload.profiles)
        .map((profile) => this.mapContractDiscoverProfile(profile));
      if (payload.profiles.length > 0) {
        return profiles;
      }

      if (payload.nextCursor == null) {
        return [];
      }
      const nextCursor = this.stringValue(payload.nextCursor);
      if (!nextCursor) {
        throw new AppwriteServiceError('Invalid discover profiles cursor', 500, null, payload);
      }
      if (usedCursors.has(nextCursor)) {
        return [];
      }

      usedCursors.add(nextCursor);
      profileCursor = nextCursor;
    }

    return [];
  }

  async fetchThreads(): Promise<ChatThread[]> {
    const currentAccountId = await this.fetchCurrentAccountId(false);
    if (!currentAccountId) {
      return [];
    }

    const participantRows = await this.listRows(this.configuration.threadParticipantsTableId, [
      appwriteQueryEqual('userId', [currentAccountId])
    ]);

    const threads: Array<{ thread: ChatThread; lastActivity: number }> = [];
    for (const participantRow of participantRows) {
      const threadId = this.stringValue(participantRow.threadId);
      if (!threadId) {
        continue;
      }

      const threadRow = await this.fetchRowIfAccessible(this.configuration.threadsTableId, threadId);
      let thread = await this.fetchThread(threadId, currentAccountId);
      if (!thread) {
        thread = await this.recoverThreadFromReference(currentAccountId, threadId);
      }
      if (!thread) {
        continue;
      }

      const lastMessage = thread.messages[thread.messages.length - 1];
      const lastMessageAt = lastMessage ? Date.parse(lastMessage.createdAt) : Number.NaN;
      const lastActivity =
        (Number.isNaN(lastMessageAt) ? null : lastMessageAt) ??
        this.dateValue(threadRow?.lastMessageAt)?.getTime() ??
        this.dateValue(threadRow?.$updatedAt)?.getTime() ??
        this.dateValue(participantRow.lastReadAt)?.getTime() ??
        this.dateValue(participantRow.$updatedAt)?.getTime() ??
        this.dateValue(participantRow.$createdAt)?.getTime() ??
        0;
      threads.push({ thread, lastActivity });
    }

    return threads
      .sort((left, right) => right.lastActivity - left.lastActivity)
      .map(({ thread }) => thread);
  }

  async sendMessage(input: {
    threadId: string;
    text: string;
    replyToMessageId?: string;
    attachment?: ChatAttachment;
  }): Promise<ChatMessage> {
    const trimmedText = input.text.trim();
    if (!trimmedText && !input.attachment) {
      throw new AppwriteServiceError('Message cannot be empty', 400);
    }

    const uploadedAttachment = input.attachment
      ? await this.uploadChatAttachment(input.attachment)
      : null;

    const attemptedAt = new Date(Date.now() - 12_000);
    let response: Record<string, unknown>;
    try {
      response = await this.executeUserFunction(this.configuration.sendMessageFunctionId, {
        threadId: input.threadId,
        text: trimmedText,
        replyToMessageId: input.replyToMessageId,
        messageType: uploadedAttachment?.type ?? undefined,
        attachmentFileId: uploadedAttachment?.fileId ?? undefined,
        attachmentName: uploadedAttachment?.name ?? undefined,
        attachmentMimeType: uploadedAttachment?.mimeType ?? undefined,
        attachmentSize: uploadedAttachment?.sizeBytes ?? undefined,
        attachmentWidth: uploadedAttachment?.width ?? undefined,
        attachmentHeight: uploadedAttachment?.height ?? undefined,
        attachmentDuration: uploadedAttachment?.duration ?? undefined
      });
    } catch (error) {
      if (error instanceof AppwriteServiceError && error.statusCode === 500) {
        const recovered = await this.recoverRecentlySentMessage(
          input.threadId,
          trimmedText,
          input.replyToMessageId,
          uploadedAttachment?.fileId ?? null,
          attemptedAt
        );
        if (recovered) {
          return recovered;
        }
      }
      throw error;
    }
    const payload = parseChatMessageContract(response);
    const messageId = payload?.messageId ?? this.stringValue(response.messageId) ?? crypto.randomUUID();
    const createdAt = this.dateValue(payload?.createdAt) ?? this.dateValue(response.createdAt) ?? new Date();

    return {
      id: messageId,
      text: payload?.text ?? this.stringValue(response.text) ?? trimmedText,
      isMe: true,
      time: formatTime(createdAt),
      createdAt: createdAt.toISOString(),
      replyToMessageId: payload?.replyToMessageId ?? input.replyToMessageId,
      attachments: uploadedAttachment
        ? [
            {
              id: uploadedAttachment.fileId,
              type: uploadedAttachment.type,
              name: uploadedAttachment.name,
              mimeType: uploadedAttachment.mimeType,
              sizeBytes: uploadedAttachment.sizeBytes,
              dataUrl: this.attachmentUrl(uploadedAttachment.fileId) ?? input.attachment?.dataUrl ?? '',
              width: uploadedAttachment.width,
              height: uploadedAttachment.height,
              duration: uploadedAttachment.duration
            }
          ]
        : undefined,
      deliveryState: 'sent'
    };
  }

  async markThreadRead(threadId: string): Promise<void> {
    if (!(await this.fetchCurrentAccountId(false))) {
      return;
    }
    await this.executeUserFunction(this.configuration.sendMessageFunctionId, {
      action: 'updateParticipant',
      threadId,
      markRead: true
    });
  }

  async updateThreadNotifications(threadId: string, enabled: boolean): Promise<void> {
    const currentAccountId = await this.fetchCurrentAccountId(true);
    if (!currentAccountId) {
      throw new AppwriteServiceError('Missing current Appwrite account id', 401);
    }

    await this.executeUserFunction(this.configuration.sendMessageFunctionId, {
      action: 'updateParticipant',
      threadId,
      notificationsEnabled: enabled
    });
  }

  async markCurrentUserPresence(isOnline: boolean): Promise<void> {
    if (!(await this.fetchCurrentAccountId(false))) {
      return;
    }
    await this.executeUserFunction(this.configuration.manageProfileFunctionId, {
      action: 'presence',
      online: isOnline
    });
  }

  subscribeToChatRealtime(handler: () => void): () => void {
    const channels = this.chatRealtimeChannels();
    const client = this.getRealtimeClient();
    const subscription: unknown = client.subscribe(channels, (event: unknown) => {
      void event;
      handler();
    });

    return () => {
      if (typeof subscription === 'function') {
        (subscription as () => void)();
        return;
      }

      const close = typeof subscription === 'object' && subscription !== null
        ? (subscription as { close?: unknown }).close
        : null;

      if (typeof close === 'function') {
        close.call(subscription);
      }
    };
  }

  async createOrGetThread(otherUserId: string, _otherUserName: string | null): Promise<ChatThread> {
    const response = await this.executeUserFunction(this.configuration.createOrGetThreadFunctionId, { otherUserId });
    const threadId = this.stringValue(response.threadId);
    if (!threadId) {
      throw new AppwriteServiceError('Invalid create/get thread response', 500);
    }

    const peer = this.chatPeerProjection(response.peer, otherUserId);
    return this.fetchThreadAfterWrite(threadId, otherUserId, 'matched', peer ?? undefined);
  }

  async submitSwipe(otherUserId: string, otherUserName: string | null, decision: 'liked' | 'passed'): Promise<ChatThread | null> {
    const functionId = this.configuration.recordSwipeFunctionId;
    if (!functionId) {
      throw new AppwriteServiceError('Missing record swipe function configuration', 500);
    }

    const response = await this.executeUserFunction(functionId, {
      otherUserId,
      otherUserName,
      decision
    });

    const matched = this.booleanValue(response.matched) ?? false;
    const threadId = this.stringValue(response.threadId);
    if (threadId) {
      return this.fetchThreadAfterWrite(threadId, otherUserId, 'matched');
    }

    if (!matched) {
      return null;
    }

    // Ensure the dedicated create/get-thread function is used in the web swipe flow too.
    return this.createOrGetThread(otherUserId, otherUserName);
  }

  async updateRelationship(threadId: string, action: 'archive' | 'unmatch' | 'block'): Promise<void> {
    const functionId = this.configuration.manageRelationshipFunctionId;
    if (!functionId) {
      throw new AppwriteServiceError('Missing manage relationship function configuration', 500);
    }

    await this.executeUserFunction(functionId, {
      threadId,
      action
    });
  }

  async fetchEventAdminState(eventId?: string): Promise<EventAdminState> {
    const functionId = this.eventAdminFunctionId();
    let resolvedEventId = eventId?.trim() || null;
    let participantCursor: string | null = null;
    let rawParticipantCount = 0;
    let firstState: EventAdminState | null = null;
    const participants: EventAdminParticipant[] = [];
    const seenCursors = new Set<string>();
    const maximumPages = Math.ceil(MAX_EVENT_ADMIN_PARTICIPANTS / EVENT_ADMIN_PARTICIPANT_PAGE_SIZE);

    for (let page = 0; page < maximumPages; page += 1) {
      const payload: Record<string, unknown> = {
        action: 'fetch',
        participantLimit: EVENT_ADMIN_PARTICIPANT_PAGE_SIZE
      };
      if (resolvedEventId) {
        payload.eventId = resolvedEventId;
      }
      if (participantCursor) {
        payload.participantCursor = participantCursor;
      }

      const response = await this.executeUserFunction(functionId, payload);
      const state = this.makeEventAdminState(response);
      if (!state || (resolvedEventId && state.eventId !== resolvedEventId)) {
        throw new AppwriteServiceError('Invalid event admin response', 500);
      }

      firstState ??= state;
      resolvedEventId = state.eventId;
      rawParticipantCount += this.arrayOfDictionaries(response.participants).length;
      if (rawParticipantCount > MAX_EVENT_ADMIN_PARTICIPANTS) {
        throw new AppwriteServiceError('Event admin participant limit exceeded', 500);
      }
      participants.push(...state.participants);

      const nextCursor = this.eventAdminNextCursor(response);
      if (!nextCursor) {
        return {
          ...firstState,
          participants: this.sortEventAdminParticipants(participants)
        };
      }
      if (
        rawParticipantCount >= MAX_EVENT_ADMIN_PARTICIPANTS
        || page + 1 >= maximumPages
        || seenCursors.has(nextCursor)
      ) {
        throw new AppwriteServiceError('Invalid event admin pagination', 500);
      }

      seenCursors.add(nextCursor);
      participantCursor = nextCursor;
    }

    throw new AppwriteServiceError('Invalid event admin pagination', 500);
  }

  async updateMainEventAsAdmin(eventId: string, draft: EventAdminDraftInput): Promise<EventAdminState> {
    const functionId = this.eventAdminFunctionId();
    const payload: Record<string, unknown> = {
      action: 'updateEvent',
      eventId,
      status: draft.status,
      title: draft.title.trim(),
      place: draft.place.trim(),
      description: draft.description.trim(),
      rules: draft.rules.map((rule) => rule.trim()).filter(Boolean),
      startsAt: draft.startsAt,
      maxParticipants: Math.max(2, Math.trunc(draft.maxParticipants)),
      maleLimit: Math.max(0, Math.trunc(draft.maleLimit)),
      femaleLimit: Math.max(0, Math.trunc(draft.femaleLimit)),
      registrationClosesAt: draft.registrationClosesAt,
      cancellationClosesAt: draft.cancellationClosesAt,
      participantLimit: EVENT_ADMIN_PARTICIPANT_PAGE_SIZE
    };

    const response = await this.executeUserFunction(functionId, payload);
    return this.completeEventAdminStateAfterMutation(response, eventId);
  }

  async addMainEventParticipantAsAdmin(
    eventId: string,
    userLookup: string,
    status: EventAdminMutableStatus
  ): Promise<EventAdminState> {
    const functionId = this.eventAdminFunctionId();
    const response = await this.executeUserFunction(functionId, {
      action: 'addParticipant',
      eventId,
      userLookup: userLookup.trim(),
      status,
      participantLimit: EVENT_ADMIN_PARTICIPANT_PAGE_SIZE
    });

    return this.completeEventAdminStateAfterMutation(response, eventId);
  }

  async removeMainEventParticipantAsAdmin(eventId: string, registrationId: string): Promise<EventAdminState> {
    const functionId = this.eventAdminFunctionId();
    const response = await this.executeUserFunction(functionId, {
      action: 'removeParticipant',
      eventId,
      registrationId,
      participantLimit: EVENT_ADMIN_PARTICIPANT_PAGE_SIZE
    });

    return this.completeEventAdminStateAfterMutation(response, eventId);
  }

  private async completeEventAdminStateAfterMutation(
    response: Record<string, unknown>,
    eventId: string
  ): Promise<EventAdminState> {
    const state = this.makeEventAdminState(response);
    if (!state || state.eventId !== eventId) {
      throw new AppwriteServiceError('Invalid event admin response', 500);
    }

    // Never repeat a mutation to collect subsequent roster pages. If its single
    // response is incomplete, reload only through the read-only fetch action.
    return this.eventAdminNextCursor(response)
      ? this.fetchEventAdminState(eventId)
      : state;
  }

  async fetchMainEventState(user: User | null): Promise<EventRemoteState | null> {
    const allEvents = await this.fetchAllEventRows();
    const upcomingEvents = this.upcomingEventRows(allEvents);
    const mainEvent = upcomingEvents[0] ?? null;
    if (!mainEvent) {
      return null;
    }

    const eventId = this.stringValue(mainEvent.$id) ?? '';
    const eventRegistrations = await this.listRows(this.configuration.eventRegistrationsTableId, [
      appwriteQueryEqual('eventId', [eventId])
    ]);

    const snapshot = this.makeMainEventSnapshot(mainEvent);
    const accountId = await this.resolveAccountId(user);

    let currentStatus: EventHistoryStatus | null = null;
    if (accountId) {
      const userRegistrations = eventRegistrations
        .filter((row) => this.stringValue(row.userId) === accountId)
        .sort((left, right) => this.rowTimestamp(right) - this.rowTimestamp(left));

      const preferredRegistration =
        userRegistrations.find((row) => {
          const status = this.eventHistoryStatus(this.stringValue(row.status));
          return status ? ACTIVE_EVENT_STATUSES.has(status) : false;
        }) ?? userRegistrations[0];

      currentStatus = this.eventHistoryStatus(this.stringValue(preferredRegistration?.status));
    }

    const history = await this.makeEventHistory(accountId, user, allEvents);

    return {
      eventId,
      snapshot,
      info: {
        venue: this.stringValue(mainEvent.place) ?? '',
        description: this.stringValue(mainEvent.description) ?? '',
        rules: this.stringArrayValue(mainEvent.rules),
        registrationClosesAt: this.dateValue(mainEvent.registrationClosesAt)?.toISOString() ?? null,
        cancellationClosesAt: this.dateValue(mainEvent.cancellationClosesAt)?.toISOString() ?? null
      },
      currentStatus,
      history
    };
  }

  async registerForMainEvent(user: User, eventId?: string): Promise<EventHistoryStatus> {
    const accountId = await this.resolveRequiredAccountId(user);
    if (!accountId) {
      throw new AppwriteServiceError('Missing account id', 500);
    }

    const payload: Record<string, unknown> = {};
    if (eventId && eventId.trim().length > 0) {
      payload.eventId = eventId;
    }

    const response = await this.executeFunction(this.configuration.registerForEventFunctionId, payload);
    const status = this.eventHistoryStatus(this.stringValue(response.status));
    if (!status) {
      throw new AppwriteServiceError('Invalid event registration response', 500);
    }

    return status;
  }

  async cancelMainEventRegistration(user: User, eventId?: string): Promise<void> {
    const accountId = await this.resolveRequiredAccountId(user);
    if (!accountId) {
      throw new AppwriteServiceError('Missing account id', 500);
    }

    const payload: Record<string, unknown> = {};
    if (eventId && eventId.trim().length > 0) {
      payload.eventId = eventId;
    }

    await this.executeFunction(this.configuration.cancelEventRegistrationFunctionId, payload);
  }

  private async fetchThread(
    threadId: string,
    currentAccountId?: string,
    knownPeer?: ChatPeerProjection | null
  ): Promise<ChatThread | null> {
    const resolvedCurrentAccountId = currentAccountId ?? (await this.fetchCurrentAccountId(false));
    if (!resolvedCurrentAccountId) {
      return null;
    }

    const threadRow = await this.fetchRowIfAccessible(this.configuration.threadsTableId, threadId);

    const participantRows = await this.listRows(this.configuration.threadParticipantsTableId, [
      appwriteQueryEqual('threadId', [threadId])
    ]);

    const participantUserIds = participantRows
      .map((row) => this.stringValue(row.userId))
      .filter((value): value is string => Boolean(value));
    const uniqueParticipantUserIds = [...new Set(participantUserIds)];
    if (
      participantRows.length !== 2
      || uniqueParticipantUserIds.length !== 2
      || !uniqueParticipantUserIds.includes(resolvedCurrentAccountId)
    ) {
      return null;
    }

    const currentParticipantRow =
      participantRows.find((row) => this.stringValue(row.userId) === resolvedCurrentAccountId) ?? null;
    const currentUserReadAt = this.dateValue(currentParticipantRow?.lastReadAt);

    const otherUserId = uniqueParticipantUserIds.find((userId) => userId !== resolvedCurrentAccountId) ?? null;
    if (!otherUserId) {
      return null;
    }
    const relationshipState = await this.fetchRelationshipState(resolvedCurrentAccountId, otherUserId);
    if (!this.isRelationshipVisibleInInbox(relationshipState)) {
      return null;
    }
    const otherParticipantReadAt = this.dateValue(
      participantRows.find((row) => this.stringValue(row.userId) === otherUserId)?.lastReadAt
    );
    let peer = knownPeer;
    if (peer === undefined) {
      try {
        peer = await this.fetchThreadPeerProjection(threadId, otherUserId);
      } catch {
        return null;
      }
      if (!peer) {
        return null;
      }
    }

    const messageRows = await this.listRows(this.configuration.messagesTableId, [
      appwriteQueryEqual('threadId', [threadId]),
      appwriteQueryOrderAsc('createdAt')
    ]);

    const messages = messageRows
      .map((row) => this.makeChatMessage(row, resolvedCurrentAccountId, otherParticipantReadAt))
      .filter((message): message is ChatMessage => message !== null);
    const unreadCount = messages.filter((message) => {
      if (message.isMe) {
        return false;
      }

      if (!currentUserReadAt) {
        return true;
      }

      return Date.parse(message.createdAt) > currentUserReadAt.getTime();
    }).length;

    const threadName = peer?.displayName ?? 'Match';

    const presenceUpdatedAt = this.dateValue(peer?.presenceUpdatedAt);
    const isOnline = presenceUpdatedAt ? Date.now() - presenceUpdatedAt.getTime() <= 70_000 : false;
    const lastSeenAt = this.dateValue(peer?.lastSeenAt);
    const threadCreatedAt =
      this.dateValue(threadRow?.createdAt) ?? this.dateValue(threadRow?.$createdAt) ?? new Date();

    return {
      id: threadId,
      name: threadName,
      avatar: peer?.avatarUrl ?? threadName.slice(0, 1).toUpperCase(),
      isOnline,
      unreadCount,
      createdAt: threadCreatedAt.toISOString(),
      lastSeenAt: lastSeenAt?.toISOString() ?? presenceUpdatedAt?.toISOString() ?? undefined,
      notificationsEnabled: currentParticipantRow
        ? this.threadNotificationsEnabled(currentParticipantRow)
        : true,
      relationshipState,
      messages
    };
  }

  private async fetchRelationshipState(
    currentAccountId: string,
    otherUserId: string | null
  ): Promise<RelationshipState> {
    if (!otherUserId) {
      return 'none';
    }

    const relationshipRow = await this.fetchRelationshipRow(currentAccountId, otherUserId);
    if (!relationshipRow) {
      return 'none';
    }

    const isCurrentUserA = this.stringValue(relationshipRow.userAId) === currentAccountId;
    const currentState = this.stringValue(
      relationshipRow[isCurrentUserA ? 'userAState' : 'userBState']
    );
    const otherState = this.stringValue(
      relationshipRow[isCurrentUserA ? 'userBState' : 'userAState']
    );

    if (currentState === 'blocked' || otherState === 'blocked') {
      return 'blocked';
    }

    if (currentState === 'archived') {
      return 'archived';
    }

    if (
      this.dateValue(relationshipRow.matchedAt) ||
      currentState === 'matched' ||
      otherState === 'matched'
    ) {
      return 'matched';
    }

    if (currentState === 'liked') {
      return 'liked';
    }

    return 'none';
  }

  private async fetchRelationshipRow(
    currentAccountId: string,
    otherUserId: string
  ): Promise<Record<string, unknown> | null> {
    const pairKey = [currentAccountId, otherUserId].sort().join(':');
    const rows = await this.listRows(this.configuration.relationshipsTableId, [
      appwriteQueryEqual('pairKey', [pairKey])
    ], 1);

    return rows[0] ?? null;
  }

  private async recoverThreadFromReference(
    currentAccountId: string,
    threadId: string
  ): Promise<ChatThread | null> {
    const otherUserId = await this.resolveOtherUserIdForThread(currentAccountId, threadId);
    if (!otherUserId) {
      return null;
    }

    try {
      return await this.createOrGetThread(otherUserId, null);
    } catch {
      return null;
    }
  }

  private async resolveOtherUserIdForThread(
    currentAccountId: string,
    threadId: string
  ): Promise<string | null> {
    try {
      const participantRows = await this.listRows(this.configuration.threadParticipantsTableId, [
        appwriteQueryEqual('threadId', [threadId])
      ]);
      const otherParticipant = participantRows
        .map((row) => this.stringValue(row.userId))
        .find((userId): userId is string => Boolean(userId && userId !== currentAccountId));
      if (otherParticipant) {
        return otherParticipant;
      }
    } catch {
      return null;
    }
    return null;
  }

  private isRelationshipVisibleInInbox(state: RelationshipState): boolean {
    return state === 'liked' || state === 'matched';
  }

  private async fetchThreadAfterWrite(
    threadId: string,
    otherUserId: string,
    fallbackRelationshipState: RelationshipState,
    knownPeer?: ChatPeerProjection
  ): Promise<ChatThread> {
    let lastError: unknown = null;
    const peer = knownPeer
      ?? await this.fetchThreadPeerProjection(threadId, otherUserId).catch(() => null);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const thread = await this.fetchThread(threadId, undefined, peer);
        if (thread) {
          return thread;
        }
      } catch (error) {
        lastError = error;
      }

      if (attempt < 5) {
        await wait(attempt < 2 ? 250 : 500);
      }
    }

    const currentAccountId = await this.fetchCurrentAccountId(false);
    if (currentAccountId) {
      const fallbackName = peer?.displayName ?? 'Match';
      const presenceUpdatedAt = this.dateValue(peer?.presenceUpdatedAt);

      return {
        id: threadId,
        name: fallbackName,
        avatar: peer?.avatarUrl ?? fallbackName.slice(0, 1).toUpperCase(),
        isOnline: presenceUpdatedAt ? Date.now() - presenceUpdatedAt.getTime() <= 70_000 : false,
        unreadCount: 0,
        createdAt: new Date().toISOString(),
        lastSeenAt: this.dateValue(peer?.lastSeenAt)?.toISOString() ?? presenceUpdatedAt?.toISOString() ?? undefined,
        notificationsEnabled: true,
        relationshipState: fallbackRelationshipState,
        messages: []
      };
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new AppwriteServiceError('Invalid thread response', 500);
  }

  private async fetchThreadPeerProjection(
    threadId: string,
    otherUserId: string
  ): Promise<ChatPeerProjection | null> {
    const response = await this.executeUserFunction(
      this.configuration.createOrGetThreadFunctionId,
      { action: 'peerProjection', otherUserId }
    );
    if (this.stringValue(response.threadId) !== threadId) {
      throw new AppwriteServiceError('Invalid create/get thread response', 500);
    }

    return this.chatPeerProjection(response.peer, otherUserId);
  }

  private chatPeerProjection(value: unknown, expectedUserId: string): ChatPeerProjection | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const row = value as Record<string, unknown>;
    const userId = this.stringValue(row.userId);
    const displayName = this.stringValue(row.displayName);
    if (userId !== expectedUserId || !displayName) {
      return null;
    }

    return {
      userId,
      displayName,
      avatarUrl: this.tokenizedRemoteFileUrl(row.avatarUrl),
      presenceUpdatedAt: this.dateValue(row.presenceUpdatedAt)?.toISOString() ?? null,
      lastSeenAt: this.dateValue(row.lastSeenAt)?.toISOString() ?? null
    };
  }

  private tokenizedRemoteFileUrl(value: unknown): string | null {
    const text = this.stringValue(value);
    if (!text) {
      return null;
    }

    try {
      const url = new URL(text);
      const normalizedHost = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const octets = normalizedHost.split('.');
      const loopback = normalizedHost === 'localhost'
        || normalizedHost === '::1'
        || (octets.length === 4
          && octets[0] === '127'
          && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255));
      const secureTransport = url.protocol === 'https:' || (url.protocol === 'http:' && loopback);
      const token = url.searchParams.get('token');
      if (!secureTransport || url.username || url.password || url.hash || !token) {
        return null;
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  private makeChatMessage(
    row: Record<string, unknown>,
    currentAccountId: string,
    otherParticipantReadAt: Date | null = null
  ): ChatMessage | null {
    const id = this.stringValue(row.$id);
    if (!id) {
      return null;
    }

    const createdAt = this.dateValue(row.createdAt) ?? this.dateValue(row.$createdAt) ?? new Date();

    const isMe = this.stringValue(row.senderUserId) === currentAccountId;
    const isReadByOther = Boolean(isMe && otherParticipantReadAt && otherParticipantReadAt >= createdAt);

    return {
      id,
      text: this.stringValue(row.text) ?? '',
      isMe,
      time: formatTime(createdAt),
      createdAt: createdAt.toISOString(),
      replyToMessageId: this.stringValue(row.replyToMessageId) ?? undefined,
      attachments: this.makeMessageAttachments(row),
      readAt: isReadByOther ? otherParticipantReadAt?.toISOString() : undefined,
      deliveryState: isReadByOther ? 'read' : isMe ? 'sent' : 'delivered'
    };
  }

  private async recoverRecentlySentMessage(
    threadId: string,
    text: string,
    replyToMessageId: string | undefined,
    attachmentFileId: string | null,
    notBefore: Date
  ): Promise<ChatMessage | null> {
    const currentAccountId = await this.fetchCurrentAccountId(false);
    if (!currentAccountId) {
      return null;
    }

    const rows = await this.listRows(this.configuration.messagesTableId, [
      appwriteQueryEqual('threadId', [threadId]),
      appwriteQueryOrderAsc('createdAt')
    ]);

    for (const row of rows.slice().reverse()) {
      if (this.stringValue(row.senderUserId) !== currentAccountId) {
        continue;
      }

      const rowText = this.stringValue(row.text) ?? '';
      const rowAttachmentFileId = this.stringValue(row.attachmentFileId);
      if (rowText !== text || rowAttachmentFileId !== attachmentFileId) {
        continue;
      }

      const createdAt = this.dateValue(row.createdAt) ?? this.dateValue(row.$createdAt);
      if (!createdAt || createdAt < notBefore) {
        continue;
      }

      const message = this.makeChatMessage(row, currentAccountId);
      if (message) {
        return {
          ...message,
          isMe: true,
          replyToMessageId: message.replyToMessageId ?? replyToMessageId,
          deliveryState: message.deliveryState ?? 'sent'
        };
      }
    }

    return null;
  }

  private async createAccount(email: string, password: string): Promise<void> {
    await this.sendJsonRequest('POST', '/account', {
      body: {
        userId: this.makeRandomIdentifier(),
        email,
        password
      },
      expectedStatusCodes: [201]
    });
  }

  private async createEmailSession(email: string, password: string): Promise<void> {
    await this.sendJsonRequest('POST', '/account/sessions/email', {
      body: {
        email,
        password
      },
      expectedStatusCodes: [201]
    });
  }

  private async fetchCurrentAccount(required: boolean): Promise<AppwriteAccount | null> {
    try {
      return (await this.sendJsonRequest('GET', '/account')) as AppwriteAccount;
    } catch (error) {
      if (error instanceof AppwriteServiceError && error.isUnauthorized && !required) {
        return null;
      }

      throw error;
    }
  }

  private async hydrateUser(account: AppwriteAccount): Promise<User> {
    const accountId = this.stringValue(account.$id) ?? '';
    const profileRow = await this.fetchProfileRow(accountId);
    const avatarFileId = this.stringValue(profileRow?.avatarFileId);
    const avatarDataUrl = await this.fetchAvatarDataUrl(avatarFileId);
    const photoFileIds = this.stringArrayValue(profileRow?.photoFileIds);
    const profilePhotoDataItems = photoFileIds
      .map((fileId) => this.storageFileUrl(this.configuration.avatarsBucketId, fileId))
      .filter((value): value is string => Boolean(value));

    const gender = this.userGenderValue(this.stringValue(profileRow?.gender));
    const preferredGenders = this.genderListValue(profileRow?.preferredGenders);

    return normalizeUser({
      email: this.stringValue(account.email) ?? '',
      appwriteUserId: accountId,
      firstName: this.stringValue(profileRow?.firstName) ?? undefined,
      lastName: this.stringValue(profileRow?.lastName) ?? undefined,
      birthDate: this.toInputDate(this.dateValue(profileRow?.birthDate)),
      gender: gender ?? undefined,
      orientation: this.userOrientationValue(this.stringValue(profileRow?.orientation)) ?? undefined,
      smokes: this.booleanValue(profileRow?.smokes) ?? undefined,
      drinks: this.booleanValue(profileRow?.drinks) ?? undefined,
      excludeSmokers: this.booleanValue(profileRow?.excludeSmokers) ?? undefined,
      excludeDrinkers: this.booleanValue(profileRow?.excludeDrinkers) ?? undefined,
      profileImageData: avatarDataUrl ?? undefined,
      profilePhotoDataItems,
      avatarFileId: avatarFileId ?? undefined,
      photoFileIds,
      city: this.stringValue(profileRow?.city) ?? undefined,
      latitude: this.numberValue(profileRow?.latitude) ?? undefined,
      longitude: this.numberValue(profileRow?.longitude) ?? undefined,
      preferredGenders,
      minPreferredAge: this.integerValue(profileRow?.minPreferredAge) ?? undefined,
      maxPreferredAge: this.integerValue(profileRow?.maxPreferredAge) ?? undefined,
      maxDistanceKm: this.integerValue(profileRow?.maxDistanceKm) ?? undefined,
      bio: this.stringValue(profileRow?.bio) ?? undefined,
      intent: this.intentValue(this.stringValue(profileRow?.intent)) ?? undefined,
      interests: this.stringValue(profileRow?.interests) ?? undefined,
      instagramTag: this.stringValue(profileRow?.instagramTag) ?? undefined,
      spotifyTag: this.stringValue(profileRow?.spotifyTag) ?? undefined
    });
  }

  private makeProfilePayload(user: User): Record<string, unknown> {
    const normalizedUser = normalizeUser(user);
    const latitude =
      typeof normalizedUser.latitude === 'number' && Number.isFinite(normalizedUser.latitude)
        ? normalizedUser.latitude
        : null;
    const longitude =
      typeof normalizedUser.longitude === 'number' && Number.isFinite(normalizedUser.longitude)
        ? normalizedUser.longitude
        : null;

    return {
      firstName: this.nullOrString(normalizedUser.firstName),
      lastName: this.nullOrString(normalizedUser.lastName),
      city: this.nullOrString(normalizedUser.city),
      birthDate: this.nullOrDateString(normalizedUser.birthDate),
      gender: this.nullOrString(this.genderToBackendValue(normalizedUser.gender)),
      orientation: this.nullOrString(normalizedUser.orientation ?? null),
      preferredGenders: (normalizedUser.preferredGenders ?? [])
        .map((gender) => this.genderToBackendValue(gender))
        .filter((gender): gender is string => Boolean(gender)),
      minPreferredAge: normalizedUser.minPreferredAge ?? 18,
      maxPreferredAge: normalizedUser.maxPreferredAge ?? 35,
      maxDistanceKm: normalizedUser.maxDistanceKm ?? null,
      latitude,
      longitude,
      smokes: typeof normalizedUser.smokes === 'boolean' ? normalizedUser.smokes : null,
      drinks: typeof normalizedUser.drinks === 'boolean' ? normalizedUser.drinks : null,
      excludeSmokers: typeof normalizedUser.excludeSmokers === 'boolean' ? normalizedUser.excludeSmokers : null,
      excludeDrinkers: typeof normalizedUser.excludeDrinkers === 'boolean' ? normalizedUser.excludeDrinkers : null,
      bio: this.nullOrString(normalizedUser.bio),
      intent: this.nullOrString(normalizedUser.intent),
      interests: this.nullOrString(normalizedUser.interests),
      instagramTag: this.nullOrString(normalizedUser.instagramTag),
      spotifyTag: this.nullOrString(normalizedUser.spotifyTag),
      photoFileIds: normalizedUser.photoFileIds ?? [],
      avatarFileId: this.nullOrString(normalizedUser.avatarFileId)
    };
  }

  private async fetchAllEventRows(): Promise<Record<string, unknown>[]> {
    return this.listRows(this.configuration.eventsTableId, [appwriteQueryOrderAsc('startsAt')]);
  }

  private upcomingEventRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    const now = Date.now();

    return rows.filter((row) => {
      const status = this.stringValue(row.status)?.toLowerCase();
      if (status && status !== 'active') {
        return false;
      }

      const startsAt = this.dateValue(row.startsAt);
      return !startsAt || startsAt.getTime() >= now;
    });
  }

  private makeMainEventSnapshot(eventRow: Record<string, unknown>): MainEventSnapshot {
    const maleCount = Math.max(0, this.integerValue(eventRow.maleCount) ?? 0);
    const femaleCount = Math.max(0, this.integerValue(eventRow.femaleCount) ?? 0);
    const waitingListCount = Math.max(0, this.integerValue(eventRow.waitingListCount) ?? 0);

    const maxParticipants = this.integerValue(eventRow.maxParticipants) ?? 48;
    const maleLimit = this.integerValue(eventRow.maleLimit) ?? 24;
    const femaleLimit = this.integerValue(eventRow.femaleLimit) ?? 24;

    return {
      date: this.dateValue(eventRow.startsAt)?.toISOString() ?? new Date().toISOString(),
      title: this.stringValue(eventRow.title) ?? 'Evento principale',
      maxParticipants,
      maleLimit,
      femaleLimit,
      maleCount,
      femaleCount,
      waitingListCount,
      totalCount: maleCount + femaleCount,
      remainingMaleSlots: Math.max(0, maleLimit - maleCount),
      remainingFemaleSlots: Math.max(0, femaleLimit - femaleCount)
    };
  }

  private makeEventAdminState(payload: Record<string, unknown>): EventAdminState | null {
    const isAdmin = this.booleanValue(payload.isAdmin);
    if (isAdmin === false) {
      return null;
    }

    const eventRaw = payload.event;
    if (!eventRaw || typeof eventRaw !== 'object' || Array.isArray(eventRaw)) {
      return null;
    }

    const event = eventRaw as Record<string, unknown>;
    const eventId = this.stringValue(event.$id) ?? this.stringValue(event.eventId);
    const startsAt = this.dateValue(event.startsAt);
    const statusValue = this.stringValue(event.status)?.toLowerCase() as EventPublicationStatus | undefined;

    if (!eventId || !startsAt || !statusValue || !EVENT_PUBLICATION_STATUSES.has(statusValue)) {
      return null;
    }

    const participants = this.sortEventAdminParticipants(this.arrayOfDictionaries(payload.participants)
      .map((row) => this.makeEventAdminParticipant(row))
      .filter((participant): participant is EventAdminParticipant => participant !== null));

    return {
      eventId,
      status: statusValue,
      title: this.stringValue(event.title) ?? 'Evento principale',
      place: this.stringValue(event.place) ?? '',
      description: this.stringValue(event.description) ?? '',
      rules: this.stringArrayValue(event.rules),
      startsAt: startsAt.toISOString(),
      maxParticipants: this.integerValue(event.maxParticipants) ?? 48,
      maleLimit: this.integerValue(event.maleLimit) ?? 24,
      femaleLimit: this.integerValue(event.femaleLimit) ?? 24,
      registrationClosesAt: this.dateValue(event.registrationClosesAt)?.toISOString() ?? null,
      cancellationClosesAt: this.dateValue(event.cancellationClosesAt)?.toISOString() ?? null,
      participants
    };
  }

  private sortEventAdminParticipants(participants: EventAdminParticipant[]): EventAdminParticipant[] {
    return [...participants].sort((left, right) => {
        const leftOrder = this.eventHistorySortOrder(left.status);
        const rightOrder = this.eventHistorySortOrder(right.status);

        if (leftOrder === rightOrder) {
          const leftCreatedAt = this.dateValue(left.createdAt)?.getTime() ?? 0;
          const rightCreatedAt = this.dateValue(right.createdAt)?.getTime() ?? 0;
          return leftCreatedAt - rightCreatedAt;
        }

        return leftOrder - rightOrder;
      });
  }

  private eventAdminNextCursor(payload: Record<string, unknown>): string | null {
    const pageRaw = payload.participantPage;
    if (pageRaw == null) {
      return null;
    }
    if (typeof pageRaw !== 'object' || Array.isArray(pageRaw)) {
      throw new AppwriteServiceError('Invalid event admin pagination', 500);
    }

    const nextCursorRaw = (pageRaw as Record<string, unknown>).nextCursor;
    if (nextCursorRaw == null) {
      return null;
    }
    const nextCursor = this.stringValue(nextCursorRaw);
    if (!nextCursor) {
      throw new AppwriteServiceError('Invalid event admin pagination', 500);
    }
    return nextCursor;
  }

  private makeEventAdminParticipant(row: Record<string, unknown>): EventAdminParticipant | null {
    const registrationId = this.stringValue(row.registrationId) ?? this.stringValue(row.$id);
    const userId = this.stringValue(row.userId);
    const status = this.eventHistoryStatus(this.stringValue(row.status));

    if (!registrationId || !userId || !status) {
      return null;
    }

    return {
      registrationId,
      userId,
      email: this.stringValue(row.email) ?? userId,
      firstName: this.stringValue(row.firstName) ?? undefined,
      lastName: this.stringValue(row.lastName) ?? undefined,
      displayName: this.displayName(
        this.stringValue(row.firstName),
        this.stringValue(row.lastName),
        this.stringValue(row.email),
        this.stringValue(row.displayName) ?? userId
      ),
      gender: this.userGenderValue(this.stringValue(row.gender)) ?? undefined,
      status,
      createdAt: this.dateValue(row.createdAt)?.toISOString() ?? this.dateValue(row.$createdAt)?.toISOString() ?? undefined
    };
  }

  private async makeEventHistory(
    accountId: string | null,
    user: User | null,
    events: Record<string, unknown>[]
  ): Promise<EventHistoryItem[]> {
    if (!accountId) {
      return [];
    }

    const registrations = await this.listRows(this.configuration.eventRegistrationsTableId, [
      appwriteQueryEqual('userId', [accountId])
    ]);

    const eventsById = new Map<string, Record<string, unknown>>();
    for (const event of events) {
      const eventId = this.stringValue(event.$id);
      if (eventId) {
        eventsById.set(eventId, event);
      }
    }

    return registrations
      .map((registration): EventHistoryItem | null => {
        const eventId = this.stringValue(registration.eventId);
        if (!eventId) {
          return null;
        }

        const event = eventsById.get(eventId);
        if (!event) {
          return null;
        }

        const status = this.eventHistoryStatus(this.stringValue(registration.status));
        if (!status) {
          return null;
        }

        const eventDate = this.dateValue(event.startsAt);
        if (!eventDate) {
          return null;
        }

        const timestamp =
          this.dateValue(registration.$updatedAt) ??
          this.dateValue(registration.createdAt) ??
          this.dateValue(registration.$createdAt) ??
          eventDate;

        return {
          id: this.stringValue(registration.$id) ?? crypto.randomUUID(),
          email: user?.email ?? '',
          eventTitle: this.stringValue(event.title) ?? 'Evento principale',
          eventDate: eventDate.toISOString(),
          status,
          timestamp: timestamp.toISOString()
        };
      })
      .filter((item): item is EventHistoryItem => item !== null)
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  }

  private getRealtimeClient(): Client {
    if (!this.realtimeClient) {
      this.realtimeClient = new Client()
        .setEndpoint(this.endpoint)
        .setProject(this.projectId);
    }

    return this.realtimeClient;
  }

  private chatRealtimeChannels(): string[] {
    const channels = [
      this.tablesRealtimeChannel(this.configuration.messagesTableId),
      this.tablesRealtimeChannel(this.configuration.threadsTableId),
      this.tablesRealtimeChannel(this.configuration.threadParticipantsTableId),
      this.tablesRealtimeChannel(this.configuration.profilesTableId)
    ];
    if (this.configuration.matchesTableId) {
      channels.push(this.tablesRealtimeChannel(this.configuration.matchesTableId));
    }
    if (this.configuration.relationshipsTableId) {
      channels.push(this.tablesRealtimeChannel(this.configuration.relationshipsTableId));
    }

    return channels;
  }

  private tablesRealtimeChannel(tableId: string): string {
    return `tablesdb.${this.configuration.databaseId}.tables.${tableId}.rows`;
  }

  private async executeUserFunction(functionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { ...body };

    if (!payload.currentUserId) {
      const currentUserId = await this.fetchCurrentAccountId(true);
      payload.currentUserId = currentUserId;
    }

    if (this.shouldBypassDirectFunctionInvoke(functionId)) {
      return this.executeFunction(functionId, payload);
    }

    try {
      const directResponse = await this.executeFunctionDirectly(functionId, payload);
      if (directResponse && Object.keys(directResponse).length > 0) {
        return directResponse;
      }
    } catch (error) {
      if (!this.shouldFallbackToExecutionApi(error)) {
        throw error;
      }
    }

    return this.executeFunction(functionId, payload);
  }

  private shouldBypassDirectFunctionInvoke(functionId: string): boolean {
    return (
      this.configuration.discoverProfilesFunctionId === functionId ||
      this.configuration.recordSwipeFunctionId === functionId ||
      this.configuration.createOrGetThreadFunctionId === functionId ||
      this.configuration.sendMessageFunctionId === functionId ||
      this.configuration.eventAdminFunctionId === functionId ||
      this.configuration.manageProfileFunctionId === functionId ||
      this.configuration.manageRelationshipFunctionId === functionId
    );
  }

  private shouldFallbackToExecutionApi(error: unknown): boolean {
    if (error instanceof AppwriteServiceError) {
      return (
        error.statusCode === 401 ||
        error.statusCode === 403 ||
        error.type === 'router_unauthorized_execution'
      );
    }

    // Browsers may reject direct function domains through CORS/network policy; the execution API remains supported.
    return error instanceof TypeError;
  }

  private async executeFunctionDirectly(
    functionId: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    const directUrl = this.generatedFunctionUrl(functionId);
    if (!directUrl) {
      return null;
    }

    const jwt = await this.fetchFunctionJwt();
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    headers.set('x-appwrite-user-jwt', jwt);

    const currentUserId = this.stringValue(body.currentUserId);
    if (currentUserId) {
      headers.set('x-appwrite-user-id', currentUserId);
    }

    const response = await fetch(directUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const payload = await this.parseResponsePayload(response);
    if (!this.expectedStatus(response.status)) {
      throw this.makeServiceError(response.status, payload);
    }

    return payload;
  }

  private async fetchFunctionJwt(): Promise<string> {
    const now = Date.now();
    if (this.cachedFunctionJwt && this.cachedFunctionJwt.expiresAt > now) {
      return this.cachedFunctionJwt.value;
    }

    const response = await this.sendJsonRequest('POST', '/account/jwts', {
      body: {
        duration: 900
      },
      expectedStatusCodes: [201]
    });
    const jwt = this.stringValue(response.jwt);
    if (!jwt) {
      throw new AppwriteServiceError('Missing function JWT', 500);
    }

    this.cachedFunctionJwt = {
      value: jwt,
      expiresAt: now + 14 * 60 * 1000
    };
    return jwt;
  }

  private generatedFunctionUrl(functionId: string): string | null {
    const configuredUrl = this.configuredFunctionUrl(functionId);
    if (configuredUrl) {
      return configuredUrl;
    }

    const endpointUrl = new URL(this.endpoint);
    const segments = endpointUrl.hostname.split('.');
    if (
      segments.length < 4 ||
      segments[1] !== 'cloud' ||
      segments[2] !== 'appwrite' ||
      segments[3] !== 'io'
    ) {
      return null;
    }

    const url = new URL(`https://${functionId}.${segments[0]}.appwrite.run`);
    url.searchParams.set('type', 'json');
    return url.toString();
  }

  private configuredFunctionUrl(functionId: string): string | null {
    let value: string | null = null;
    if (this.configuration.discoverProfilesFunctionId === functionId) {
      value = this.configuration.discoverProfilesFunctionDomain;
    } else if (this.configuration.recordSwipeFunctionId === functionId) {
      value = this.configuration.recordSwipeFunctionDomain;
    } else if (this.configuration.createOrGetThreadFunctionId === functionId) {
      value = this.configuration.createOrGetThreadFunctionDomain;
    } else if (this.configuration.sendMessageFunctionId === functionId) {
      value = this.configuration.sendMessageFunctionDomain;
    } else if (this.configuration.eventAdminFunctionId === functionId) {
      value = this.configuration.eventAdminFunctionDomain;
    }

    if (!value) {
      return null;
    }

    const url = new URL(value);
    if (!url.searchParams.has('type')) {
      url.searchParams.set('type', 'json');
    }
    return url.toString();
  }

  private async executeFunction(functionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const execution = (await this.sendJsonRequest('POST', `/functions/${functionId}/executions`, {
      body: {
        body: JSON.stringify(body),
        async: false
      },
      expectedStatusCodes: [201]
    })) as AppwriteExecutionResponse;

    const executionId = this.stringValue(execution.$id);
    if (!executionId) {
      throw new AppwriteServiceError('Missing function execution id', 500);
    }

    const initialStatus = this.stringValue(execution.status)?.toLowerCase();
    if (initialStatus === 'completed' || initialStatus === 'failed' || initialStatus === 'crashed') {
      return this.decodeExecutionResponse(execution);
    }

    return this.waitForExecution(functionId, executionId);
  }

  private eventAdminFunctionId(): string {
    const functionId = this.configuration.eventAdminFunctionId;
    if (!functionId) {
      throw new AppwriteServiceError('Missing event admin function id', 400);
    }

    return functionId;
  }

  private async waitForExecution(functionId: string, executionId: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const execution = (await this.sendJsonRequest('GET', `/functions/${functionId}/executions/${executionId}`)) as AppwriteExecutionResponse;
      const status = this.stringValue(execution.status)?.toLowerCase() ?? '';

      if (status === 'completed' || status === 'failed' || status === 'crashed') {
        return this.decodeExecutionResponse(execution);
      }

      await wait(attempt < 10 ? 300 : 500);
    }

    throw new AppwriteServiceError('Function execution timed out', 504);
  }

  private decodeExecutionResponse(execution: AppwriteExecutionResponse): Record<string, unknown> {
    const statusCode = this.integerValue(execution.responseStatusCode) ?? this.integerValue(execution.statusCode) ?? 500;
    let body = this.executionPayload(execution.responseBody ?? execution.response);

    if (Object.keys(body).length === 0) {
      const loggedPayload = this.decodeLoggedJsonPayload(execution.logs);
      if (loggedPayload) {
        body = loggedPayload;
      }
    }

    if (statusCode < 200 || statusCode >= 300) {
      const message = this.stringValue(body.message) ?? this.stringValue(body.messageKey) ?? 'Function request failed';
      throw new AppwriteServiceError(message, statusCode, this.stringValue(body.type) ?? 'function', body);
    }

    return body;
  }

  private executionPayload(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return {};
    }

    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private decodeLoggedJsonPayload(rawLogs: unknown): Record<string, unknown> | null {
    let logs: string[] = [];

    if (Array.isArray(rawLogs)) {
      logs = rawLogs.filter((entry): entry is string => typeof entry === 'string');
    } else if (typeof rawLogs === 'string') {
      logs = rawLogs.split('\n').map((line) => line.trim()).filter(Boolean);
    }

    for (let index = logs.length - 1; index >= 0; index -= 1) {
      const line = logs[index];
      if (!line.startsWith('RESULT_JSON:')) {
        continue;
      }

      const text = line.slice('RESULT_JSON:'.length);
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  private async fetchCurrentAccountId(required: boolean): Promise<string | null> {
    const account = await this.fetchCurrentAccount(required);
    return this.stringValue(account?.$id);
  }

  private async resolveAccountId(user: User | null): Promise<string | null> {
    const fromUser = this.stringValue(user?.appwriteUserId);
    if (fromUser) {
      return fromUser;
    }

    return this.fetchCurrentAccountId(false);
  }

  private async resolveRequiredAccountId(user: User | null): Promise<string> {
    const accountId = await this.resolveAccountId(user);
    if (!accountId) {
      throw new AppwriteServiceError('Missing current Appwrite account id', 401);
    }

    return accountId;
  }

  private async fetchProfileRow(rowId: string): Promise<Record<string, unknown> | null> {
    if (!rowId) {
      return null;
    }

    const byId = await this.fetchRowIfAccessible(this.configuration.profilesTableId, rowId);
    if (byId) {
      return byId;
    }

    try {
      const rows = await this.listRows(this.configuration.profilesTableId, [appwriteQueryEqual('userId', [rowId])]);
      return rows[0] ?? null;
    } catch (error) {
      if (error instanceof AppwriteServiceError && [401, 403, 404].includes(error.statusCode ?? 0)) {
        return null;
      }
      throw error;
    }
  }

  private async fetchRowIfAccessible(tableId: string, rowId: string): Promise<Record<string, unknown> | null> {
    try {
      return await this.sendJsonRequest('GET', `${this.tableRowsPath(tableId)}/${rowId}`);
    } catch (error) {
      if (error instanceof AppwriteServiceError && [401, 403, 404].includes(error.statusCode ?? 0)) {
        return null;
      }
      throw error;
    }
  }

  private async listRows(
    tableId: string,
    queries: string[],
    maximumRows?: number
  ): Promise<Record<string, unknown>[]> {
    const rowLimit = maximumRows == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.trunc(maximumRows));
    if (rowLimit === 0) {
      return [];
    }

    const collectedRows: Record<string, unknown>[] = [];
    const usedCursors = new Set<string>();
    let cursorAfter: string | null = null;
    let offset = 0;

    while (collectedRows.length < rowLimit) {
      const remainingRows = rowLimit - collectedRows.length;
      const pageSize = Math.min(APPWRITE_ROWS_PAGE_SIZE, remainingRows);
      const paginationQuery = cursorAfter
        ? appwriteQueryCursorAfter(cursorAfter)
        : offset > 0
          ? appwriteQueryOffset(offset)
          : null;
      const pageQueries = [
        ...queries,
        appwriteQueryLimit(pageSize),
        ...(paginationQuery ? [paginationQuery] : [])
      ];
      const response = await this.sendJsonRequest('GET', this.tableRowsPath(tableId), {
        queryItems: pageQueries.map((query) => ({ name: 'queries[]', value: query }))
      });
      const pageRows = this.arrayOfDictionaries(response.rows);
      if (pageRows.length === 0) {
        break;
      }

      collectedRows.push(...pageRows.slice(0, remainingRows));

      const totalRows = this.integerValue(response.total);
      if (
        collectedRows.length >= rowLimit ||
        (totalRows !== null && collectedRows.length >= totalRows) ||
        pageRows.length < pageSize
      ) {
        break;
      }

      const nextCursor = this.stringValue(pageRows[pageRows.length - 1]?.$id);
      if (nextCursor && !usedCursors.has(nextCursor)) {
        usedCursors.add(nextCursor);
        cursorAfter = nextCursor;
        offset = 0;
      } else {
        cursorAfter = null;
        offset = collectedRows.length;
      }
    }

    return collectedRows;
  }

  private mapContractDiscoverProfile(
    profile: ReturnType<typeof parseDiscoverProfilesPayload>[number]
  ): DiscoverProfile {
    const photos = profile.photos
      .map((photo) => this.tokenizedRemoteFileUrl(photo))
      .filter((photo): photo is string => Boolean(photo));
    const imageUrl = this.tokenizedRemoteFileUrl(profile.imageUrl) ?? photos[0] ?? undefined;

    return {
      id: profile.id,
      name: profile.name,
      age: profile.age,
      gender: profile.gender ?? 'other',
      city: profile.city,
      distanceKm: profile.distanceKm,
      compatibilityScore: profile.compatibilityScore,
      intent: profile.intent,
      bio: profile.bio,
      imageUrl,
      photos: photos.length > 0 ? photos : imageUrl ? [imageUrl] : undefined,
      commonInterests: profile.commonInterests,
      instagramTag: profile.instagramTag,
      spotifyTag: profile.spotifyTag,
      relationshipState: profile.relationshipState
    };
  }

  private storageFileUrl(bucketId: string | null, fileId: string | null): string | null {
    if (!bucketId || !fileId) {
      return null;
    }

    const url = new URL(`${this.endpoint}/storage/buckets/${bucketId}/files/${fileId}/view`);

    url.searchParams.set('project', this.projectId);
    return url.toString();
  }

  private attachmentUrl(fileId: string | null): string | null {
    if (!fileId || !this.configuration.chatAttachmentsBucketId) {
      return null;
    }

    const url = new URL(`${this.endpoint}/storage/buckets/${this.configuration.chatAttachmentsBucketId}/files/${fileId}/view`);
    url.searchParams.set('project', this.projectId);
    return url.toString();
  }

  private async uploadChatAttachment(attachment: ChatAttachment): Promise<{
    fileId: string;
    type: ChatAttachment['type'];
    name: string;
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    duration?: number;
  }> {
    if (!this.configuration.chatAttachmentsBucketId) {
      throw new AppwriteServiceError('Chat attachments bucket not configured', 400);
    }

    const currentUserId = await this.fetchCurrentAccountId(true);
    if (!currentUserId) {
      throw new AppwriteServiceError('Missing current Appwrite account id', 401);
    }

    const fileId = this.makeRandomIdentifier();
    const file = dataUrlToFile(attachment.dataUrl, attachment.name, attachment.mimeType);
    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('file', file);
    for (const permission of this.ownerFilePermissions(currentUserId)) {
      formData.append('permissions[]', permission);
    }

    await this.sendRequest('POST', `/storage/buckets/${this.configuration.chatAttachmentsBucketId}/files`, {
      body: formData,
      expectedStatusCodes: [201],
      isFormData: true
    });

    return {
      fileId,
      type: attachment.type,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width,
      height: attachment.height,
      duration: attachment.duration
    };
  }

  private makeMessageAttachments(row: Record<string, unknown>): ChatAttachment[] | undefined {
    const attachmentFileId = this.stringValue(row.attachmentFileId);
    if (!attachmentFileId) {
      return undefined;
    }

    return [
      {
        id: attachmentFileId,
        type: this.chatAttachmentType(
          this.stringValue(row.messageType),
          this.stringValue(row.attachmentMimeType)
        ),
        name: this.stringValue(row.attachmentName) ?? 'attachment',
        mimeType: this.stringValue(row.attachmentMimeType) ?? 'application/octet-stream',
        sizeBytes: this.integerValue(row.attachmentSize) ?? 0,
        dataUrl: this.attachmentUrl(attachmentFileId) ?? '',
        width: this.integerValue(row.attachmentWidth) ?? undefined,
        height: this.integerValue(row.attachmentHeight) ?? undefined,
        duration: this.integerValue(row.attachmentDuration) ?? undefined
      }
    ];
  }

  private chatAttachmentType(
    messageType: string | null,
    mimeType: string | null
  ): ChatAttachment['type'] {
    if (messageType === 'image' || messageType === 'video' || messageType === 'audio' || messageType === 'file') {
      return messageType;
    }

    if (mimeType?.startsWith('image/')) {
      return 'image';
    }
    if (mimeType?.startsWith('video/')) {
      return 'video';
    }
    if (mimeType?.startsWith('audio/')) {
      return 'audio';
    }

    return 'file';
  }

  private async uploadAvatarDataUrl(dataUrl: string, fileId: string, ownerUserId: string): Promise<void> {
    const file = dataUrlToFile(dataUrl, `avatar-${fileId}.jpg`);
    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('file', file);
    for (const permission of this.avatarFilePermissions(ownerUserId)) {
      formData.append('permissions[]', permission);
    }

    await this.sendRequest('POST', `/storage/buckets/${this.configuration.avatarsBucketId}/files`, {
      body: formData,
      expectedStatusCodes: [201],
      isFormData: true
    });
  }

  private async uploadProfilePhotoDataUrls(dataUrls: string[], ownerUserId: string): Promise<string[]> {
    const uploadedFileIds: string[] = [];

    try {
      for (const dataUrl of dataUrls) {
        const fileId = this.makeRandomIdentifier();
        await this.uploadAvatarDataUrl(dataUrl, fileId, ownerUserId);
        uploadedFileIds.push(fileId);
      }

      return uploadedFileIds;
    } catch (error) {
      await Promise.all(uploadedFileIds.map((fileId) => this.deleteAvatarFile(fileId).catch(() => undefined)));
      throw error;
    }
  }

  private async deleteAvatarFile(fileId: string): Promise<void> {
    await this.sendJsonRequest('DELETE', `/storage/buckets/${this.configuration.avatarsBucketId}/files/${fileId}`, {
      expectedStatusCodes: [204]
    });
  }

  private async fetchAvatarDataUrl(fileId: string | null): Promise<string | null> {
    if (!fileId) {
      return null;
    }

    try {
      const response = await this.sendRequest('GET', `/storage/buckets/${this.configuration.avatarsBucketId}/files/${fileId}/view`, {
        expectedStatusCodes: [200],
        asBlob: true
      });

      const blob = response as Blob;
      return blobToDataUrl(blob);
    } catch (error) {
      if (error instanceof AppwriteServiceError && [401, 403, 404].includes(error.statusCode ?? 0)) {
        return null;
      }
      throw error;
    }
  }

  private intentValue(value: string | null): User['intent'] | null {
    switch (value) {
      case 'relationship':
      case 'casual':
      case 'friendship':
      case 'notSure':
        return value;
      default:
        return null;
    }
  }

  private userGenderValue(value: string | null): UserGender | null {
    switch (value?.replace(/[\s_-]/g, '').toLowerCase()) {
      case 'male':
        return 'male';
      case 'female':
        return 'female';
      case 'nonbinary':
        return 'nonBinary';
      case 'other':
        return 'other';
      default:
        return null;
    }
  }

  private userOrientationValue(value: string | null): UserOrientation | null {
    switch (value) {
      case 'straight':
      case 'gay':
      case 'lesbian':
      case 'bisexual':
      case 'pansexual':
      case 'other':
        return value;
      default:
        return null;
    }
  }

  private genderToBackendValue(gender: UserGender | undefined): string | null {
    if (!gender) {
      return null;
    }

    return gender;
  }

  private eventHistoryStatus(value: string | null): EventHistoryStatus | null {
    switch (value?.toLowerCase()) {
      case 'confirmed':
      case 'waitlisted':
      case 'cancelled':
      case 'promoted':
        return value.toLowerCase() as EventHistoryStatus;
      default:
        return null;
    }
  }

  private eventHistorySortOrder(status: EventHistoryStatus): number {
    switch (status) {
      case 'confirmed':
        return 0;
      case 'promoted':
        return 1;
      case 'waitlisted':
        return 2;
      case 'cancelled':
        return 3;
      default:
        return 99;
    }
  }

  private genderListValue(value: unknown): UserGender[] {
    const candidates: string[] = [];

    if (Array.isArray(value)) {
      for (const item of value) {
        const entry = this.stringValue(item);
        if (entry) {
          candidates.push(entry);
        }
      }
    } else {
      const text = this.stringValue(value);
      if (text) {
        candidates.push(...text.split(',').map((entry) => entry.trim()));
      }
    }

    const mapped = candidates
      .map((entry) => this.userGenderValue(entry))
      .filter((entry): entry is UserGender => Boolean(entry));

    return mapped.length > 0 ? Array.from(new Set(mapped)) : ['male', 'female', 'nonBinary', 'other'];
  }

  private rowTimestamp(row: Record<string, unknown>): number {
    const timestamp =
      this.dateValue(row.$updatedAt) ??
      this.dateValue(row.updatedAt) ??
      this.dateValue(row.createdAt) ??
      this.dateValue(row.$createdAt);

    return timestamp?.getTime() ?? 0;
  }

  private threadNotificationsEnabled(row: Record<string, unknown>): boolean {
    const notificationsEnabled = this.booleanValue(row.notificationsEnabled);
    if (notificationsEnabled !== null) {
      return notificationsEnabled;
    }

    const muted = this.booleanValue(row.muted);
    if (muted !== null) {
      return !muted;
    }

    return true;
  }

  private ownerFilePermissions(ownerUserId: string): string[] {
    return [
      `read("user:${ownerUserId}")`,
      `update("user:${ownerUserId}")`,
      `delete("user:${ownerUserId}")`
    ];
  }

  private avatarFilePermissions(ownerUserId: string): string[] {
    return this.ownerFilePermissions(ownerUserId);
  }

  private toInputDate(value: Date | null): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.toISOString().slice(0, 10);
  }

  private nullOrString(value: string | null | undefined): string | null {
    const normalized = this.stringValue(value);
    return normalized ?? null;
  }

  private nullOrDateString(value: string | Date | undefined): string | null {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      return date.toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return null;
  }

  private makeRandomIdentifier(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  private tableRowsPath(tableId: string): string {
    return `/tablesdb/${this.configuration.databaseId}/tables/${tableId}/rows`;
  }

  private async sendJsonRequest(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<Record<string, unknown>> {
    const payload = await this.sendRequest(method, path, options);
    if (payload instanceof Blob) {
      throw new AppwriteServiceError('Expected JSON payload but received blob', 500);
    }
    return payload;
  }

  private async sendRequest(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<Record<string, unknown> | Blob> {
    const url = new URL(`${this.endpoint}${path}`);
    for (const item of options.queryItems ?? []) {
      url.searchParams.append(item.name, item.value);
    }

    const headers = new Headers();
    headers.set('X-Appwrite-Project', this.projectId);
    headers.set('X-Appwrite-Response-Format', RESPONSE_FORMAT);

    if (!options.isFormData && !options.asBlob) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers,
      body: this.requestBody(options.body, options.isFormData ?? false)
    });

    if (options.asBlob) {
      if (!this.expectedStatus(response.status, options.expectedStatusCodes)) {
        const errorPayload = await this.parseResponsePayload(response);
        throw this.makeServiceError(response.status, errorPayload);
      }

      return response.blob();
    }

    const payload = await this.parseResponsePayload(response);

    if (!this.expectedStatus(response.status, options.expectedStatusCodes)) {
      throw this.makeServiceError(response.status, payload);
    }

    return payload;
  }

  private requestBody(body: unknown, isFormData: boolean): BodyInit | undefined {
    if (body == null) {
      return undefined;
    }

    if (isFormData) {
      return body as BodyInit;
    }

    return JSON.stringify(body);
  }

  private expectedStatus(status: number, expectedStatusCodes?: number[]): boolean {
    if (!expectedStatusCodes || expectedStatusCodes.length === 0) {
      return status >= 200 && status < 300;
    }

    return expectedStatusCodes.includes(status);
  }

  private async parseResponsePayload(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { message: text };
    }
  }

  private makeServiceError(statusCode: number, payload: Record<string, unknown>): AppwriteServiceError {
    const message =
      this.stringValue(payload.message) ??
      this.stringValue(payload.messageKey) ??
      `Request failed with status ${statusCode}`;
    const type = this.stringValue(payload.type);

    return new AppwriteServiceError(message, statusCode, type, payload);
  }

  private arrayOfDictionaries(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is Record<string, unknown> => {
      return Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);
    });
  }

  private stringArrayValue(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((entry) => this.stringValue(entry))
        .filter((entry): entry is string => Boolean(entry));
    }

    const text = this.stringValue(value);
    if (!text) {
      return [];
    }

    return text
      .split(/[,|\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private stringValue(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private numberValue(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private integerValue(value: unknown): number | null {
    const numeric = this.numberValue(value);
    return numeric == null ? null : Math.trunc(numeric);
  }

  private booleanValue(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return null;
  }

  private dateValue(value: unknown): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const text = this.stringValue(value);
    if (!text) {
      return null;
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private displayName(firstName: string | null, lastName: string | null, email: string | null, fallback: string): string {
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) {
      return fullName;
    }

    if (email && email.includes('@')) {
      return email.split('@')[0];
    }

    return fallback;
  }

}

interface RequestOptions {
  body?: unknown;
  expectedStatusCodes?: number[];
  queryItems?: Array<{ name: string; value: string }>;
  isFormData?: boolean;
  asBlob?: boolean;
}

function appwriteQueryEqual(field: string, values: string[]): string {
  return JSON.stringify({ method: 'equal', attribute: field, values });
}

function appwriteQueryOrderAsc(field: string): string {
  return JSON.stringify({ method: 'orderAsc', attribute: field });
}

function appwriteQueryLimit(value: number): string {
  return JSON.stringify({ method: 'limit', values: [Math.max(1, Math.trunc(value))] });
}

function appwriteQueryCursorAfter(rowId: string): string {
  return JSON.stringify({ method: 'cursorAfter', values: [rowId] });
}

function appwriteQueryOffset(value: number): string {
  return JSON.stringify({ method: 'offset', values: [Math.max(0, Math.trunc(value))] });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string, fallbackMimeType?: string): File {
  const [metadata, encoded] = dataUrl.split(',');
  if (!metadata || !encoded) {
    throw new AppwriteServiceError('Invalid image payload', 400);
  }

  const mimeMatch = metadata.match(/data:([^;]+);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : fallbackMimeType ?? 'application/octet-stream';
  const bytes = atob(encoded);
  const buffer = new Uint8Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 1) {
    buffer[index] = bytes.charCodeAt(index);
  }

  return new File([buffer], fileName, { type: mimeType });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Unable to read blob as data URL'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}
