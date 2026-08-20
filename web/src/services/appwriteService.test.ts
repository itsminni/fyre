import { afterEach, describe, expect, it, vi } from 'vitest';
import { User } from '../types/models';
import { AppwriteConfiguration } from './appwriteConfiguration';
import { AppwriteService } from './appwriteService';

const configuration: AppwriteConfiguration = {
  endpoint: 'https://example.appwrite.test/v1',
  projectId: 'project-id',
  databaseId: 'database-id',
  profilesTableId: 'profiles',
  avatarsBucketId: 'avatars',
  chatAttachmentsBucketId: null,
  eventsTableId: 'events',
  eventRegistrationsTableId: 'event-registrations',
  threadsTableId: 'threads',
  threadParticipantsTableId: 'thread-participants',
  messagesTableId: 'messages',
  swipesTableId: 'swipes',
  matchesTableId: 'matches',
  relationshipsTableId: 'relationships',
  registerForEventFunctionId: 'register-event',
  cancelEventRegistrationFunctionId: 'cancel-event',
  eventAdminFunctionId: 'event-admin',
  createOrGetThreadFunctionId: 'create-thread',
  sendMessageFunctionId: 'send-message',
  recordSwipeFunctionId: 'record-swipe',
  discoverProfilesFunctionId: 'discover-profiles',
  manageProfileFunctionId: 'manage-profile',
  manageRelationshipFunctionId: 'manage-relationship',
  createOrGetThreadFunctionDomain: null,
  sendMessageFunctionDomain: null,
  recordSwipeFunctionDomain: null,
  discoverProfilesFunctionDomain: null,
  eventAdminFunctionDomain: null
};

interface ListRowsAccess {
  listRows(
    tableId: string,
    queries: string[],
    maximumRows?: number
  ): Promise<Record<string, unknown>[]>;
}

interface EventSnapshotAccess {
  makeMainEventSnapshot(eventRow: Record<string, unknown>): {
    maleCount: number;
    femaleCount: number;
    waitingListCount: number;
    totalCount: number;
  };
}

interface AvatarPermissionAccess {
  avatarFilePermissions(ownerUserId: string): string[];
}

interface ProfilePayloadAccess {
  makeProfilePayload(user: User): Record<string, unknown>;
}

interface ProjectionAccess {
  chatPeerProjection(value: unknown, expectedUserId: string): { avatarUrl: string | null } | null;
  mapContractDiscoverProfile(profile: {
    id: string;
    name: string;
    age: number;
    bio: string;
    photos: string[];
    imageUrl?: string;
    commonInterests: string[];
    relationshipState: string;
  }): { photos?: string[]; imageUrl?: string };
}

interface DiscoveryFetchAccess {
  fetchDiscoverProfiles(): Promise<Array<{ id: string }>>;
  executeUserFunction(
    functionId: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
}

interface ThreadCreationAccess {
  createOrGetThread(otherUserId: string, otherUserName: string | null): Promise<unknown>;
  executeUserFunction(functionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  fetchThreadAfterWrite(...args: unknown[]): Promise<unknown>;
}

interface ThreadFetchAccess {
  fetchThread(threadId: string, currentAccountId?: string): Promise<{
    name: string;
    avatar: string;
    isOnline: boolean;
    lastSeenAt?: string;
  } | null>;
  fetchRowIfAccessible(tableId: string, rowId: string): Promise<Record<string, unknown> | null>;
  listRows(tableId: string, queries: string[]): Promise<Record<string, unknown>[]>;
  fetchRelationshipState(currentAccountId: string, otherUserId: string | null): Promise<string>;
  fetchThreadPeerProjection(threadId: string, otherUserId: string): Promise<Record<string, unknown> | null>;
  fetchProfileRow(rowId: string): Promise<Record<string, unknown> | null>;
  executeUserFunction(functionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface EventAdminAccess {
  fetchEventAdminState(eventId?: string): Promise<{ participants: Array<{ registrationId: string }> }>;
  updateMainEventAsAdmin(
    eventId: string,
    draft: {
      status: 'active';
      title: string;
      place: string;
      description: string;
      rules: string[];
      startsAt: string;
      maxParticipants: number;
      maleLimit: number;
      femaleLimit: number;
      registrationClosesAt: null;
      cancellationClosesAt: null;
    }
  ): Promise<{ participants: Array<{ registrationId: string }> }>;
  executeUserFunction(functionId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
}

function queryMethods(input: RequestInfo | URL): Array<Record<string, unknown>> {
  const url = new URL(typeof input === 'string' ? input : input.toString());
  return url.searchParams.getAll('queries[]').map((query) => JSON.parse(query) as Record<string, unknown>);
}

function queryValue(queries: Array<Record<string, unknown>>, method: string): unknown {
  const query = queries.find((candidate) => candidate.method === method);
  return Array.isArray(query?.values) ? query.values[0] : undefined;
}

function jsonResponse(rows: Record<string, unknown>[], total: number): Response {
  return new Response(JSON.stringify({ rows, total }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function eventAdminResponse(registrationIds: string[], nextCursor: string | null): Record<string, unknown> {
  return {
    isAdmin: true,
    event: {
      $id: 'event-1',
      status: 'active',
      title: 'Event',
      startsAt: '2030-01-01T20:00:00.000Z'
    },
    participants: registrationIds.map((registrationId) => ({
      registrationId,
      userId: `user-${registrationId}`,
      status: 'confirmed',
      createdAt: '2029-01-01T00:00:00.000Z'
    })),
    participantPage: {
      limit: 100,
      nextCursor,
      total: registrationIds.length
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Appwrite row pagination', () => {
  it('loads every page using cursorAfter when row identifiers are available', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ $id: `row-${index + 1}` }));
    const secondPage = Array.from({ length: 25 }, (_, index) => ({ $id: `row-${index + 101}` }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const queries = queryMethods(input);
      return queryValue(queries, 'cursorAfter') === 'row-100'
        ? jsonResponse(secondPage, 125)
        : jsonResponse(firstPage, 125);
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AppwriteService(configuration) as unknown as ListRowsAccess;
    const rows = await service.listRows('profiles', []);

    expect(rows).toHaveLength(125);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryValue(queryMethods(fetchMock.mock.calls[0][0]), 'limit')).toBe(100);
    expect(queryValue(queryMethods(fetchMock.mock.calls[1][0]), 'cursorAfter')).toBe('row-100');
  });

  it('falls back to offset pagination when a page has no usable cursor', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ value: index + 1 }));
    const secondPage = [{ value: 101 }, { value: 102 }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const queries = queryMethods(input);
      return queryValue(queries, 'offset') === 100
        ? jsonResponse(secondPage, 102)
        : jsonResponse(firstPage, 102);
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AppwriteService(configuration) as unknown as ListRowsAccess;
    const rows = await service.listRows('profiles', []);

    expect(rows).toHaveLength(102);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryValue(queryMethods(fetchMock.mock.calls[1][0]), 'offset')).toBe(100);
  });

  it('honours an explicit maximum without requesting unnecessary pages', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => (
      jsonResponse([{ $id: 'only-row' }], 50)
    ));
    vi.stubGlobal('fetch', fetchMock);

    const service = new AppwriteService(configuration) as unknown as ListRowsAccess;
    const rows = await service.listRows('relationships', [], 1);

    expect(rows).toEqual([{ $id: 'only-row' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queryValue(queryMethods(fetchMock.mock.calls[0][0]), 'limit')).toBe(1);
  });
});

describe('Appwrite event counters', () => {
  it('uses the server-maintained public counters instead of private registration rows', () => {
    const service = new AppwriteService(configuration) as unknown as EventSnapshotAccess;
    const snapshot = service.makeMainEventSnapshot({
      startsAt: '2030-01-01T20:00:00.000Z',
      maleCount: 17,
      femaleCount: 19,
      waitingListCount: 4,
      maleLimit: 24,
      femaleLimit: 24
    });

    expect(snapshot).toMatchObject({
      maleCount: 17,
      femaleCount: 19,
      waitingListCount: 4,
      totalCount: 36
    });
  });
});

describe('Appwrite event admin pagination', () => {
  it('collects every roster page with a bounded cursor loop', async () => {
    const service = new AppwriteService(configuration) as unknown as EventAdminAccess;
    const firstIds = Array.from({ length: 100 }, (_, index) => `registration-${index + 1}`);
    const executeUserFunction = vi.fn(async (_functionId: string, body: Record<string, unknown>) => (
      body.participantCursor === 'registration-100'
        ? eventAdminResponse(['registration-101'], null)
        : eventAdminResponse(firstIds, 'registration-100')
    ));
    service.executeUserFunction = executeUserFunction;

    const state = await service.fetchEventAdminState('event-1');

    expect(state.participants).toHaveLength(101);
    expect(executeUserFunction).toHaveBeenCalledTimes(2);
    expect(executeUserFunction.mock.calls[0][1]).toMatchObject({
      action: 'fetch',
      eventId: 'event-1',
      participantLimit: 100
    });
    expect(executeUserFunction.mock.calls[1][1]).toMatchObject({
      action: 'fetch',
      eventId: 'event-1',
      participantLimit: 100,
      participantCursor: 'registration-100'
    });
  });

  it('fails closed when the function repeats a participant cursor', async () => {
    const service = new AppwriteService(configuration) as unknown as EventAdminAccess;
    const executeUserFunction = vi.fn(async () => eventAdminResponse([], 'repeated-cursor'));
    service.executeUserFunction = executeUserFunction;

    await expect(service.fetchEventAdminState('event-1')).rejects.toThrow('Invalid event admin pagination');
    expect(executeUserFunction).toHaveBeenCalledTimes(2);
  });

  it('executes an admin mutation once and uses fetch for remaining roster pages', async () => {
    const service = new AppwriteService(configuration) as unknown as EventAdminAccess;
    const firstIds = Array.from({ length: 100 }, (_, index) => `registration-${index + 1}`);
    const executeUserFunction = vi.fn(async (_functionId: string, body: Record<string, unknown>) => {
      if (body.action === 'updateEvent') {
        return eventAdminResponse(firstIds, 'registration-100');
      }
      return body.participantCursor === 'registration-100'
        ? eventAdminResponse(['registration-101'], null)
        : eventAdminResponse(firstIds, 'registration-100');
    });
    service.executeUserFunction = executeUserFunction;

    const state = await service.updateMainEventAsAdmin('event-1', {
      status: 'active',
      title: 'Event',
      place: 'Venue',
      description: '',
      rules: [],
      startsAt: '2030-01-01T20:00:00.000Z',
      maxParticipants: 200,
      maleLimit: 100,
      femaleLimit: 100,
      registrationClosesAt: null,
      cancellationClosesAt: null
    });

    expect(state.participants).toHaveLength(101);
    expect(executeUserFunction.mock.calls.filter(([, body]) => body.action === 'updateEvent')).toHaveLength(1);
    expect(executeUserFunction.mock.calls.filter(([, body]) => body.action === 'fetch')).toHaveLength(2);
  });
});

describe('Appwrite avatar permissions', () => {
  it('uploads avatars with owner-only read, update and delete access', () => {
    const service = new AppwriteService(configuration) as unknown as AvatarPermissionAccess;

    expect(service.avatarFilePermissions('user-a')).toEqual([
      'read("user:user-a")',
      'update("user:user-a")',
      'delete("user:user-a")'
    ]);
  });
});

describe('Appwrite profile payload', () => {
  it('does not invent a city or coordinates for an incomplete profile', () => {
    const service = new AppwriteService(configuration) as unknown as ProfilePayloadAccess;

    const payload = service.makeProfilePayload({
      email: 'person@example.com'
    });

    expect(payload).toMatchObject({
      city: null,
      latitude: null,
      longitude: null
    });
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('profileReady');
  });

  it('maps canonical profile fields without semantic fallbacks', () => {
    const service = new AppwriteService(configuration) as unknown as ProfilePayloadAccess;

    const payload = service.makeProfilePayload({
      email: 'person@example.com',
      firstName: 'Ada',
      city: 'Roma',
      birthDate: '2000-01-01',
      gender: 'female',
      orientation: 'bisexual',
      preferredGenders: ['female', 'nonBinary'],
      bio: 'Ciao',
      intent: 'relationship',
      interests: 'musica, fotografia',
      instagramTag: 'ada',
      spotifyTag: 'ada-music',
      latitude: 41.9,
      longitude: 12.5
    });

    expect(payload).toMatchObject({
      preferredGenders: ['female', 'nonBinary'],
      bio: 'Ciao',
      intent: 'relationship',
      interests: 'musica, fotografia',
      instagramTag: 'ada',
      spotifyTag: 'ada-music',
      latitude: 41.9,
      longitude: 12.5
    });
    expect(payload).not.toHaveProperty('showMe');
    expect(payload).not.toHaveProperty('hobbies');
    expect(payload).not.toHaveProperty('lookingFor');
  });
});

describe('Appwrite chat peer projection', () => {
  it('discards untokenized and insecure avatar URLs', () => {
    const service = new AppwriteService(configuration) as unknown as ProjectionAccess;

    expect(service.chatPeerProjection({
      userId: 'user-b',
      displayName: 'Bea',
      avatarUrl: 'https://appwrite.test/avatar/view'
    }, 'user-b')?.avatarUrl).toBeNull();
    expect(service.chatPeerProjection({
      userId: 'user-b',
      displayName: 'Bea',
      avatarUrl: 'http://remote.example.test/avatar/view?token=secret'
    }, 'user-b')?.avatarUrl).toBeNull();
  });

  it('does not forward a client-supplied display name to create/get thread', async () => {
    const service = new AppwriteService(configuration) as unknown as ThreadCreationAccess;
    const executeUserFunction = vi.fn(async () => ({
      threadId: 'thread-1',
      peer: {
        userId: 'user-b',
        displayName: 'Bea Rossi',
        avatarUrl: 'https://appwrite.test/v1/storage/buckets/avatars/files/avatar-b/view?project=project&token=temporary',
        presenceUpdatedAt: '2030-01-02T03:04:05.000Z',
        lastSeenAt: '2030-01-02T03:00:00.000Z'
      }
    }));
    const expectedThread = { id: 'thread-1' };
    const fetchThreadAfterWrite = vi.fn(async () => expectedThread);
    service.executeUserFunction = executeUserFunction;
    service.fetchThreadAfterWrite = fetchThreadAfterWrite;

    const result = await service.createOrGetThread('user-b', '<script>spoofed name</script>');

    expect(result).toBe(expectedThread);
    expect(executeUserFunction).toHaveBeenCalledWith('create-thread', { otherUserId: 'user-b' });
    expect(fetchThreadAfterWrite).toHaveBeenCalledWith(
      'thread-1',
      'user-b',
      'matched',
      {
        userId: 'user-b',
        displayName: 'Bea Rossi',
        avatarUrl: 'https://appwrite.test/v1/storage/buckets/avatars/files/avatar-b/view?project=project&token=temporary',
        presenceUpdatedAt: '2030-01-02T03:04:05.000Z',
        lastSeenAt: '2030-01-02T03:00:00.000Z'
      }
    );
  });

  it('builds inbox metadata from the authenticated peer projection without reading the peer profile row', async () => {
    const service = new AppwriteService(configuration) as unknown as ThreadFetchAccess;
    service.fetchRowIfAccessible = vi.fn(async () => ({
      $id: 'thread-1',
      createdAt: '2030-01-01T00:00:00.000Z'
    }));
    service.listRows = vi.fn(async (tableId) => {
      if (tableId === 'thread-participants') {
        return [
          { $id: 'participant-a', threadId: 'thread-1', userId: 'user-a' },
          { $id: 'participant-b', threadId: 'thread-1', userId: 'user-b' }
        ];
      }
      return [];
    });
    service.fetchRelationshipState = vi.fn(async () => 'matched');
    service.fetchThreadPeerProjection = vi.fn(async () => ({
      userId: 'user-b',
      displayName: 'Bea Rossi',
      avatarUrl: 'https://appwrite.test/v1/storage/buckets/avatars/files/avatar-b/view?project=project&token=temporary',
      presenceUpdatedAt: '2020-01-02T03:04:05.000Z',
      lastSeenAt: '2020-01-02T03:00:00.000Z'
    }));
    const fetchProfileRow = vi.fn(async () => ({
      email: 'must-not-be-read@example.com',
      latitude: 44.1,
      longitude: 10.2
    }));
    service.fetchProfileRow = fetchProfileRow;

    const thread = await service.fetchThread('thread-1', 'user-a');

    expect(thread?.name).toBe('Bea Rossi');
    expect(thread?.avatar).toContain('token=temporary');
    expect(thread?.isOnline).toBe(false);
    expect(thread?.lastSeenAt).toBe('2020-01-02T03:00:00.000Z');
    expect(service.fetchThreadPeerProjection).toHaveBeenCalledWith('thread-1', 'user-b');
    expect(fetchProfileRow).not.toHaveBeenCalled();
  });

  it('requests the read-only peerProjection action and validates the returned peer identity', async () => {
    const service = new AppwriteService(configuration) as unknown as ThreadFetchAccess;
    const executeUserFunction = vi.fn(async () => ({
      threadId: 'thread-1',
      peer: {
        userId: 'user-b',
        displayName: 'Bea Rossi',
        avatarUrl: null,
        presenceUpdatedAt: null,
        lastSeenAt: null
      }
    }));
    service.executeUserFunction = executeUserFunction;

    const peer = await service.fetchThreadPeerProjection('thread-1', 'user-b');

    expect(peer).toMatchObject({ userId: 'user-b', displayName: 'Bea Rossi' });
    expect(executeUserFunction).toHaveBeenCalledWith('create-thread', {
      action: 'peerProjection',
      otherUserId: 'user-b'
    });
  });

  it('fails closed when the canonical relationship is missing and never falls back to matches', async () => {
    const service = new AppwriteService(configuration) as unknown as ThreadFetchAccess;
    const listRows = vi.fn(async (_tableId: string, _queries: string[]) => []);
    service.listRows = listRows;

    await expect(service.fetchRelationshipState('user-a', 'user-b')).resolves.toBe('none');
    expect(listRows).toHaveBeenCalledTimes(1);
    expect(listRows.mock.calls[0][0]).toBe('relationships');
  });
});

describe('Appwrite discovery avatar projection', () => {
  it('keeps only secure file-token URLs', () => {
    const service = new AppwriteService(configuration) as unknown as ProjectionAccess;
    const profile = service.mapContractDiscoverProfile({
      id: 'user-b',
      name: 'Bea',
      age: 28,
      bio: 'Hello',
      photos: [
        'https://appwrite.test/avatar/view',
        'https://appwrite.test/avatar/view?token=temporary'
      ],
      imageUrl: 'http://remote.example.test/avatar/view?token=secret',
      commonInterests: [],
      relationshipState: 'none'
    });

    expect(profile.photos).toEqual([
      'https://appwrite.test/avatar/view?token=temporary'
    ]);
    expect(profile.imageUrl).toBe('https://appwrite.test/avatar/view?token=temporary');
  });
});

describe('Appwrite discovery pagination', () => {
  it('follows empty windows and stops at the first non-empty page', async () => {
    const service = new AppwriteService(configuration) as unknown as DiscoveryFetchAccess;
    const executeUserFunction = vi.fn()
      .mockResolvedValueOnce({ profiles: [], nextCursor: 'profile-100' })
      .mockResolvedValueOnce({
        profiles: [{ id: 'profile-101', name: 'Bea' }],
        nextCursor: 'profile-200'
      });
    service.executeUserFunction = executeUserFunction;

    await expect(service.fetchDiscoverProfiles()).resolves.toEqual([
      expect.objectContaining({ id: 'profile-101' })
    ]);
    expect(executeUserFunction).toHaveBeenCalledTimes(2);
    expect(executeUserFunction.mock.calls.map((call) => call[1])).toEqual([
      {},
      { profileCursor: 'profile-100' }
    ]);
  });

  it('stops when an empty page repeats a cursor', async () => {
    const service = new AppwriteService(configuration) as unknown as DiscoveryFetchAccess;
    const executeUserFunction = vi.fn()
      .mockResolvedValueOnce({ profiles: [], nextCursor: 'profile-100' })
      .mockResolvedValueOnce({ profiles: [], nextCursor: 'profile-100' });
    service.executeUserFunction = executeUserFunction;

    await expect(service.fetchDiscoverProfiles()).resolves.toEqual([]);
    expect(executeUserFunction).toHaveBeenCalledTimes(2);
  });

  it('limits empty discovery scans to four windows', async () => {
    const service = new AppwriteService(configuration) as unknown as DiscoveryFetchAccess;
    const executeUserFunction = vi.fn()
      .mockImplementation(async (_functionId: string, body: Record<string, unknown>) => ({
        profiles: [],
        nextCursor: `next-${String(body.profileCursor ?? 'initial')}`
      }));
    service.executeUserFunction = executeUserFunction;

    await expect(service.fetchDiscoverProfiles()).resolves.toEqual([]);
    expect(executeUserFunction).toHaveBeenCalledTimes(4);
  });
});
