import {
  ChatMessage,
  ChatThread,
  DiscoverProfile,
  EventAdminDraftInput,
  EventAdminMutableStatus,
  EventAdminParticipant,
  EventAdminState,
  EventHistoryItem,
  EventHistoryStatus,
  MainEventSnapshot,
  User,
  UserGender,
  UserOrientation,
  UserShowMe,
  calculateAge,
  isProfileComplete,
  normalizeEmail
} from '../types/models';
import { formatTime } from '../data/mockData';
import { AppwriteConfiguration } from './appwriteConfiguration';

const RESPONSE_FORMAT = '1.8.0';
const ACTIVE_EVENT_STATUSES = new Set<EventHistoryStatus>(['confirmed', 'promoted', 'waitlisted']);
const CONFIRMED_EVENT_STATUSES = new Set<EventHistoryStatus>(['confirmed', 'promoted']);
const DEFAULT_CITY = 'Reggio Emilia, Italy';
const DEFAULT_LATITUDE = 44.6979;
const DEFAULT_LONGITUDE = 10.6313;

export interface EventRemoteState {
  eventId: string;
  snapshot: MainEventSnapshot;
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
    await this.sendJsonRequest('DELETE', '/account/sessions/current', {
      expectedStatusCodes: [204]
    });
  }

  async updateProfile(user: User): Promise<User> {
    const accountId = await this.resolveRequiredAccountId(user);
    const existingProfileRow = await this.fetchProfileRow(accountId);

    let nextAvatarFileId = user.avatarFileId ?? null;
    if (user.profileImageData && user.profileImageData.trim().length > 0 && !nextAvatarFileId) {
      nextAvatarFileId = this.makeRandomIdentifier();
      await this.uploadAvatarDataUrl(user.profileImageData, nextAvatarFileId);
    }

    const payload = this.makeProfilePayload({
      ...user,
      appwriteUserId: accountId,
      avatarFileId: nextAvatarFileId ?? undefined
    });

    if (!existingProfileRow) {
      await this.sendJsonRequest('POST', this.tableRowsPath(this.configuration.profilesTableId), {
        body: {
          rowId: accountId,
          data: payload
        },
        expectedStatusCodes: [201]
      });
    } else {
      const existingRowId = this.stringValue(existingProfileRow.$id) ?? accountId;
      await this.sendJsonRequest('PATCH', `${this.tableRowsPath(this.configuration.profilesTableId)}/${existingRowId}`, {
        body: {
          data: payload
        },
        expectedStatusCodes: [200]
      });
    }

    const refreshed = await this.restoreCurrentUser();
    if (!refreshed) {
      throw new AppwriteServiceError('Missing account after profile update', 500);
    }

    return refreshed;
  }

  async updateProfileImage(user: User, profileImageData: string): Promise<User> {
    const accountId = await this.resolveRequiredAccountId(user);
    const previousAvatarFileId = user.avatarFileId ?? null;
    const nextAvatarFileId = this.makeRandomIdentifier();

    await this.uploadAvatarDataUrl(profileImageData, nextAvatarFileId);

    try {
      const updated = await this.updateProfile({
        ...user,
        appwriteUserId: accountId,
        avatarFileId: nextAvatarFileId,
        profileImageData
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
    if (this.configuration.discoverProfilesFunctionId) {
      const payload = await this.executeUserFunction(this.configuration.discoverProfilesFunctionId, {});
      const profiles = this.arrayOfDictionaries(payload.profiles);
      const mapped = profiles
        .map((row) => this.makeDiscoverProfile(row))
        .filter((profile): profile is DiscoverProfile => profile !== null);

      if (mapped.length > 0) {
        return mapped;
      }
    }

    const currentAccountId = await this.fetchCurrentAccountId(false);
    const excludedUserIds = await this.excludedDiscoverUserIds(currentAccountId);
    const rows = await this.listRows(this.configuration.profilesTableId, []);

    return rows
      .map((row) => this.makeDiscoverProfile(row))
      .filter((profile): profile is DiscoverProfile => {
        if (!profile) {
          return false;
        }

        if (profile.id === currentAccountId) {
          return false;
        }

        return !excludedUserIds.has(profile.id);
      });
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
      const thread = await this.fetchThread(threadId, currentAccountId);
      if (!thread) {
        continue;
      }

      const lastActivity =
        this.dateValue(threadRow?.lastMessageAt)?.getTime() ??
        this.dateValue(threadRow?.$updatedAt)?.getTime() ??
        0;
      threads.push({ thread, lastActivity });
    }

    return threads
      .sort((left, right) => right.lastActivity - left.lastActivity)
      .map(({ thread }) => thread);
  }

  async sendMessage(threadId: string, text: string): Promise<ChatMessage> {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new AppwriteServiceError('Message cannot be empty', 400);
    }

    const response = await this.executeUserFunction(this.configuration.sendMessageFunctionId, {
      threadId,
      text: trimmedText
    });

    const messageId = this.stringValue(response.messageId) ?? crypto.randomUUID();
    const createdAt = this.dateValue(response.createdAt) ?? new Date();

    return {
      id: messageId,
      text: this.stringValue(response.text) ?? trimmedText,
      isMe: true,
      time: formatTime(createdAt),
      createdAt: createdAt.toISOString(),
      deliveryState: 'sent'
    };
  }

  async createOrGetThread(otherUserId: string, otherUserName: string | null): Promise<ChatThread | null> {
    const payload: Record<string, unknown> = {
      otherUserId
    };

    if (otherUserName && otherUserName.trim().length > 0) {
      payload.otherUserName = otherUserName.trim();
    }

    const response = await this.executeUserFunction(this.configuration.createOrGetThreadFunctionId, payload);
    const threadId = this.stringValue(response.threadId);
    if (!threadId) {
      throw new AppwriteServiceError('Invalid create/get thread response', 500);
    }

    return this.fetchThread(threadId);
  }

  async submitSwipe(otherUserId: string, otherUserName: string | null, decision: 'liked' | 'passed'): Promise<ChatThread | null> {
    const functionId = this.configuration.recordSwipeFunctionId;
    if (!functionId) {
      return null;
    }

    const response = await this.executeUserFunction(functionId, {
      otherUserId,
      otherUserName,
      decision
    });

    const matched = this.booleanValue(response.matched) ?? false;
    if (!matched) {
      return null;
    }

    const threadId = this.stringValue(response.threadId);
    if (threadId) {
      const thread = await this.fetchThread(threadId);
      if (thread) {
        return thread;
      }
    }

    // Ensure the dedicated create/get-thread function is used in the web swipe flow too.
    return this.createOrGetThread(otherUserId, otherUserName);
  }

  async fetchEventAdminState(eventId?: string): Promise<EventAdminState> {
    const functionId = this.eventAdminFunctionId();
    const payload: Record<string, unknown> = { action: 'fetch' };

    if (eventId && eventId.trim().length > 0) {
      payload.eventId = eventId.trim();
    }

    const response = await this.executeUserFunction(functionId, payload);
    const state = this.makeEventAdminState(response);
    if (!state) {
      throw new AppwriteServiceError('Invalid event admin response', 500);
    }

    return state;
  }

  async updateMainEventAsAdmin(eventId: string, draft: EventAdminDraftInput): Promise<EventAdminState> {
    const functionId = this.eventAdminFunctionId();
    const payload: Record<string, unknown> = {
      action: 'updateEvent',
      eventId,
      title: draft.title.trim(),
      startsAt: draft.startsAt,
      maxParticipants: Math.max(2, Math.trunc(draft.maxParticipants)),
      maleLimit: Math.max(0, Math.trunc(draft.maleLimit)),
      femaleLimit: Math.max(0, Math.trunc(draft.femaleLimit)),
      adminUserIds: draft.adminUserIds.trim(),
      adminEmails: draft.adminEmails.trim(),
      registrationClosesAt: draft.registrationClosesAt,
      cancellationClosesAt: draft.cancellationClosesAt
    };

    const response = await this.executeUserFunction(functionId, payload);
    const state = this.makeEventAdminState(response);
    if (!state) {
      throw new AppwriteServiceError('Invalid event admin response', 500);
    }

    return state;
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
      status
    });

    const state = this.makeEventAdminState(response);
    if (!state) {
      throw new AppwriteServiceError('Invalid event admin response', 500);
    }

    return state;
  }

  async removeMainEventParticipantAsAdmin(eventId: string, registrationId: string): Promise<EventAdminState> {
    const functionId = this.eventAdminFunctionId();
    const response = await this.executeUserFunction(functionId, {
      action: 'removeParticipant',
      eventId,
      registrationId
    });

    const state = this.makeEventAdminState(response);
    if (!state) {
      throw new AppwriteServiceError('Invalid event admin response', 500);
    }

    return state;
  }

  async fetchMainEventState(user: User | null): Promise<EventRemoteState | null> {
    const upcomingEvents = await this.fetchUpcomingEventRows();
    const mainEvent = upcomingEvents[0] ?? null;
    if (!mainEvent) {
      return null;
    }

    const eventId = this.stringValue(mainEvent.$id) ?? '';
    const eventRegistrations = await this.listRows(this.configuration.eventRegistrationsTableId, [
      appwriteQueryEqual('eventId', [eventId])
    ]);

    const snapshot = this.makeMainEventSnapshot(mainEvent, eventRegistrations);
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

    const history = await this.makeEventHistory(accountId, user, upcomingEvents);

    return {
      eventId,
      snapshot,
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

  async cancelMainEventRegistration(user: User, eventId?: string, force = false): Promise<void> {
    const accountId = await this.resolveRequiredAccountId(user);
    if (!accountId) {
      throw new AppwriteServiceError('Missing account id', 500);
    }

    const payload: Record<string, unknown> = {
      force
    };
    if (eventId && eventId.trim().length > 0) {
      payload.eventId = eventId;
    }

    await this.executeFunction(this.configuration.cancelEventRegistrationFunctionId, payload);
  }

  private async fetchThread(threadId: string, currentAccountId?: string): Promise<ChatThread | null> {
    const resolvedCurrentAccountId = currentAccountId ?? (await this.fetchCurrentAccountId(false));
    if (!resolvedCurrentAccountId) {
      return null;
    }

    const threadRow = await this.fetchRowIfAccessible(this.configuration.threadsTableId, threadId);
    if (!threadRow) {
      return null;
    }

    const participantRows = await this.listRows(this.configuration.threadParticipantsTableId, [
      appwriteQueryEqual('threadId', [threadId])
    ]);

    const participantUserIds = participantRows
      .map((row) => this.stringValue(row.userId))
      .filter((value): value is string => Boolean(value));

    const otherUserId = participantUserIds.find((userId) => userId !== resolvedCurrentAccountId) ?? null;
    const profileRow = otherUserId ? await this.fetchProfileRow(otherUserId) : null;

    const messageRows = await this.listRows(this.configuration.messagesTableId, [
      appwriteQueryEqual('threadId', [threadId]),
      appwriteQueryOrderAsc('createdAt')
    ]);

    const messages = messageRows
      .map((row) => this.makeChatMessage(row, resolvedCurrentAccountId))
      .filter((message): message is ChatMessage => message !== null);

    const threadName = this.displayName(
      this.stringValue(profileRow?.firstName),
      this.stringValue(profileRow?.lastName),
      this.stringValue(profileRow?.email),
      this.stringValue(threadRow.subject) ?? 'Match'
    );

    const presenceUpdatedAt = this.dateValue(profileRow?.presenceUpdatedAt);
    const isOnline = presenceUpdatedAt ? Date.now() - presenceUpdatedAt.getTime() <= 70_000 : false;
    const threadCreatedAt =
      this.dateValue(threadRow.createdAt) ?? this.dateValue(threadRow.$createdAt) ?? new Date();

    return {
      id: threadId,
      name: threadName,
      avatar: threadName.slice(0, 1).toUpperCase(),
      isOnline,
      unreadCount: 0,
      createdAt: threadCreatedAt.toISOString(),
      messages
    };
  }

  private makeChatMessage(row: Record<string, unknown>, currentAccountId: string): ChatMessage | null {
    const id = this.stringValue(row.$id);
    if (!id) {
      return null;
    }

    const createdAt = this.dateValue(row.createdAt) ?? this.dateValue(row.$createdAt) ?? new Date();

    return {
      id,
      text: this.stringValue(row.text) ?? '',
      isMe: this.stringValue(row.senderUserId) === currentAccountId,
      time: formatTime(createdAt),
      createdAt: createdAt.toISOString()
    };
  }

  private async createAccount(email: string, password: string): Promise<void> {
    await this.sendJsonRequest('POST', '/account', {
      body: {
        userId: 'unique()',
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

    const gender = this.userGenderValue(this.stringValue(profileRow?.gender));
    const preferredGenders = this.genderListValue(profileRow?.preferredGenders);

    return {
      email: this.stringValue(account.email) ?? '',
      password: '',
      appwriteUserId: accountId,
      firstName: this.stringValue(profileRow?.firstName) ?? undefined,
      lastName: this.stringValue(profileRow?.lastName) ?? undefined,
      birthDate: this.toInputDate(this.dateValue(profileRow?.birthDate)),
      gender: gender ?? undefined,
      orientation: this.userOrientationValue(this.stringValue(profileRow?.orientation)) ?? undefined,
      showMe: this.showMeValue(preferredGenders),
      smokes: this.booleanValue(profileRow?.smokes) ?? undefined,
      drinks: this.booleanValue(profileRow?.drinks) ?? undefined,
      hobbies: this.stringValue(profileRow?.interests) ?? '',
      passions: this.stringValue(profileRow?.bio) ?? '',
      lookingFor: this.intentToText(this.stringValue(profileRow?.intent)),
      favoriteSong: this.stringValue(profileRow?.spotifyTag) ?? '',
      favoriteMovie: this.stringValue(profileRow?.instagramTag) ?? '',
      profileImageData: avatarDataUrl ?? undefined,
      avatarFileId: avatarFileId ?? undefined,
      city: this.stringValue(profileRow?.city) ?? undefined,
      latitude: this.numberValue(profileRow?.latitude) ?? undefined,
      longitude: this.numberValue(profileRow?.longitude) ?? undefined,
      preferredGenders,
      minPreferredAge: this.integerValue(profileRow?.minPreferredAge) ?? undefined,
      maxPreferredAge: this.integerValue(profileRow?.maxPreferredAge) ?? undefined,
      maxDistanceKm: this.integerValue(profileRow?.maxDistanceKm) ?? undefined,
      bio: this.stringValue(profileRow?.bio) ?? undefined,
      intent: this.intentValue(this.stringValue(profileRow?.intent)) ?? undefined,
      instagramTag: this.stringValue(profileRow?.instagramTag) ?? undefined,
      spotifyTag: this.stringValue(profileRow?.spotifyTag) ?? undefined
    };
  }

  private makeProfilePayload(user: User): Record<string, unknown> {
    const accountId = this.stringValue(user.appwriteUserId) ?? '';
    const city = this.stringValue(user.city) ?? DEFAULT_CITY;
    const latitude = typeof user.latitude === 'number' ? user.latitude : DEFAULT_LATITUDE;
    const longitude = typeof user.longitude === 'number' ? user.longitude : DEFAULT_LONGITUDE;

    return {
      userId: accountId,
      email: user.email,
      firstName: this.nullOrString(user.firstName),
      lastName: this.nullOrString(user.lastName),
      city: this.nullOrString(city),
      birthDate: this.nullOrDateString(user.birthDate),
      gender: this.nullOrString(this.genderToBackendValue(user.gender)),
      orientation: this.nullOrString(user.orientation ?? null),
      preferredGenders: this.preferredGendersFromShowMe(user.showMe, user.preferredGenders),
      minPreferredAge: user.minPreferredAge ?? 18,
      maxPreferredAge: user.maxPreferredAge ?? 35,
      maxDistanceKm: user.maxDistanceKm ?? null,
      latitude,
      longitude,
      smokes: typeof user.smokes === 'boolean' ? user.smokes : null,
      drinks: typeof user.drinks === 'boolean' ? user.drinks : null,
      bio: this.nullOrString(this.userBio(user)),
      intent: this.nullOrString(this.intentFromText(user.lookingFor, user.intent)),
      interests: this.nullOrString(user.hobbies),
      instagramTag: this.nullOrString(user.instagramTag ?? user.favoriteMovie),
      spotifyTag: this.nullOrString(user.spotifyTag ?? user.favoriteSong),
      profileReady: isProfileComplete(user),
      avatarFileId: this.nullOrString(user.avatarFileId)
    };
  }

  private async fetchMainEventRows(): Promise<Record<string, unknown>[]> {
    const rows = await this.listRows(this.configuration.eventsTableId, [appwriteQueryOrderAsc('startsAt')]);
    const now = Date.now();

    return rows.filter((row) => {
      const status = this.stringValue(row.status)?.toLowerCase();
      if (status === 'cancelled') {
        return false;
      }

      const startsAt = this.dateValue(row.startsAt);
      return !startsAt || startsAt.getTime() >= now;
    });
  }

  private async fetchUpcomingEventRows(): Promise<Record<string, unknown>[]> {
    return this.fetchMainEventRows();
  }

  private makeMainEventSnapshot(eventRow: Record<string, unknown>, registrations: Record<string, unknown>[]): MainEventSnapshot {
    const confirmedRows = registrations.filter((row) => {
      const status = this.eventHistoryStatus(this.stringValue(row.status));
      return status ? CONFIRMED_EVENT_STATUSES.has(status) : false;
    });

    const maleCount = confirmedRows.filter((row) => this.stringValue(row.gender) === 'male').length;
    const femaleCount = confirmedRows.filter((row) => this.stringValue(row.gender) === 'female').length;
    const waitingListCount = registrations.filter((row) => this.eventHistoryStatus(this.stringValue(row.status)) === 'waitlisted').length;

    const maxParticipants = this.integerValue(eventRow.maxParticipants) ?? 48;
    const maleLimit = this.integerValue(eventRow.maleLimit) ?? 24;
    const femaleLimit = this.integerValue(eventRow.femaleLimit) ?? 24;

    return {
      date: this.dateValue(eventRow.startsAt)?.toISOString() ?? new Date().toISOString(),
      title: this.stringValue(eventRow.title) ?? 'Evento principale',
      maxParticipants,
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

    if (!eventId || !startsAt) {
      return null;
    }

    const participants = this.arrayOfDictionaries(payload.participants)
      .map((row) => this.makeEventAdminParticipant(row))
      .filter((participant): participant is EventAdminParticipant => participant !== null)
      .sort((left, right) => {
        const leftOrder = this.eventHistorySortOrder(left.status);
        const rightOrder = this.eventHistorySortOrder(right.status);

        if (leftOrder === rightOrder) {
          const leftCreatedAt = this.dateValue(left.createdAt)?.getTime() ?? 0;
          const rightCreatedAt = this.dateValue(right.createdAt)?.getTime() ?? 0;
          return leftCreatedAt - rightCreatedAt;
        }

        return leftOrder - rightOrder;
      });

    return {
      eventId,
      title: this.stringValue(event.title) ?? 'Evento principale',
      startsAt: startsAt.toISOString(),
      maxParticipants: this.integerValue(event.maxParticipants) ?? 48,
      maleLimit: this.integerValue(event.maleLimit) ?? 24,
      femaleLimit: this.integerValue(event.femaleLimit) ?? 24,
      registrationClosesAt: this.dateValue(event.registrationClosesAt)?.toISOString() ?? null,
      cancellationClosesAt: this.dateValue(event.cancellationClosesAt)?.toISOString() ?? null,
      adminUserIds: this.stringValue(event.adminUserIds) ?? '',
      adminEmails: this.stringValue(event.adminEmails) ?? '',
      participants
    };
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

  private async executeUserFunction(functionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { ...body };

    if (!payload.currentUserId) {
      const currentUserId = await this.fetchCurrentAccountId(true);
      payload.currentUserId = currentUserId;
    }

    return this.executeFunction(functionId, payload);
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

  private async listRows(tableId: string, queries: string[]): Promise<Record<string, unknown>[]> {
    const response = await this.sendJsonRequest('GET', this.tableRowsPath(tableId), {
      queryItems: queries.map((query) => ({ name: 'queries[]', value: query }))
    });

    return this.arrayOfDictionaries(response.rows);
  }

  private async excludedDiscoverUserIds(currentAccountId: string | null): Promise<Set<string>> {
    if (!currentAccountId) {
      return new Set<string>();
    }

    const excludedUserIds = new Set<string>();

    if (this.configuration.swipesTableId) {
      const swipeRows = await this.listRows(this.configuration.swipesTableId, [
        appwriteQueryEqual('fromUserId', [currentAccountId])
      ]);

      for (const row of swipeRows) {
        const userId = this.stringValue(row.toUserId);
        if (userId) {
          excludedUserIds.add(userId);
        }
      }
    }

    if (this.configuration.matchesTableId) {
      const matchRows = await this.listRows(this.configuration.matchesTableId, []);
      for (const row of matchRows) {
        const userAId = this.stringValue(row.userAId);
        const userBId = this.stringValue(row.userBId);

        if (userAId === currentAccountId && userBId) {
          excludedUserIds.add(userBId);
        } else if (userBId === currentAccountId && userAId) {
          excludedUserIds.add(userAId);
        }
      }
    }

    return excludedUserIds;
  }

  private makeDiscoverProfile(row: Record<string, unknown>): DiscoverProfile | null {
    const userId = this.stringValue(row.userId);
    const gender = this.userGenderValue(this.stringValue(row.gender));

    if (!userId || !gender) {
      return null;
    }

    const firstName = this.stringValue(row.firstName) ?? '';
    const lastName = this.stringValue(row.lastName) ?? '';
    const fullName = `${firstName} ${lastName}`.trim();
    const email = this.stringValue(row.email) ?? '';
    const fallbackName = email.includes('@') ? email.split('@')[0] : 'Match';

    return {
      id: userId,
      name: fullName || fallbackName,
      age: Math.max(18, calculateAge(this.toInputDate(this.dateValue(row.birthDate)) ?? '')),
      gender,
      bio: this.stringValue(row.bio) ?? 'Say hi and start the conversation.',
      imageUrl: this.avatarUrl(this.stringValue(row.avatarFileId)) ?? undefined
    };
  }

  private avatarUrl(fileId: string | null): string | null {
    if (!fileId) {
      return null;
    }

    const url = new URL(`${this.endpoint}/storage/buckets/${this.configuration.avatarsBucketId}/files/${fileId}/view`);
    url.searchParams.set('project', this.projectId);
    return url.toString();
  }

  private async uploadAvatarDataUrl(dataUrl: string, fileId: string): Promise<void> {
    const file = dataUrlToFile(dataUrl, `avatar-${fileId}.jpg`);
    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('file', file);

    await this.sendRequest('POST', `/storage/buckets/${this.configuration.avatarsBucketId}/files`, {
      body: formData,
      expectedStatusCodes: [201],
      isFormData: true
    });
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

  private userBio(user: User): string {
    const candidates = [user.bio, user.passions, user.lookingFor]
      .map((value) => this.stringValue(value))
      .filter((value): value is string => Boolean(value));

    return candidates[0] ?? 'Profilo Fyre';
  }

  private intentFromText(text: string | undefined, fallbackIntent: User['intent'] | undefined): string {
    const normalized = this.stringValue(text)?.toLowerCase() ?? '';

    if (normalized.includes('relazione')) {
      return 'relationship';
    }

    if (normalized.includes('casual')) {
      return 'casual';
    }

    if (normalized.includes('amic')) {
      return 'friendship';
    }

    if (fallbackIntent) {
      return fallbackIntent;
    }

    return 'friendship';
  }

  private intentToText(intent: string | null): string {
    switch (intent) {
      case 'relationship':
        return 'Relazione seria';
      case 'casual':
        return 'Connessioni casual';
      case 'friendship':
        return 'Nuove amicizie';
      case 'notSure':
        return 'Sto ancora esplorando';
      default:
        return '';
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

  private preferredGendersFromShowMe(showMe: UserShowMe, preferredGenders: UserGender[] | undefined): string[] {
    if (Array.isArray(preferredGenders) && preferredGenders.length > 0) {
      return preferredGenders.map((gender) => this.genderToBackendValue(gender)).filter((value): value is string => Boolean(value));
    }

    switch (showMe) {
      case 'men':
        return ['male'];
      case 'women':
        return ['female'];
      default:
        return ['male', 'female', 'nonbinary', 'other'];
    }
  }

  private showMeValue(preferredGenders: UserGender[]): UserShowMe {
    if (preferredGenders.length === 1 && preferredGenders[0] === 'male') {
      return 'men';
    }

    if (preferredGenders.length === 1 && preferredGenders[0] === 'female') {
      return 'women';
    }

    return 'everyone';
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

    if (gender === 'nonBinary') {
      return 'nonbinary';
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

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [metadata, encoded] = dataUrl.split(',');
  if (!metadata || !encoded) {
    throw new AppwriteServiceError('Invalid image payload', 400);
  }

  const mimeMatch = metadata.match(/data:([^;]+);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
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
