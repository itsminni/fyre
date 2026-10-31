import { OFFLINE_DEMO, LOCAL_STATE_PREFIX } from '../services/runtimeMode';
import { OfflineDemoService } from '../demo/OfflineDemoService';
import { notificationDestination } from '../services/notificationDestination';
import { mergeChatMessages, mergeChatThreads } from '../services/chatState';
export { mergeChatThreads } from '../services/chatState';
import { mapAppwriteError } from '../services/userFacingError';
import { UploadControl, messageOperationId } from '../services/uploads';
import { accountSettings, storeAccountSettings } from '../services/accountSettings';
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  AppNotification,
  AppSettings,
  ChatAttachment,
  ChatDeliveryState,
  ChatMessage,
  ChatThread,
  DiscoverProfile,
  EventAdminDraftInput,
  EventAdminMutableStatus,
  EventAdminState,
  EventHistoryItem,
  MainEventConfig,
  MainEventInfo,
  MainEventSnapshot,
  MatchIntent,
  NotificationType,
  PersistedAppState,
  ProfileUpdateInput,
  User,
  UserGender,
  UserOrientation,
  calculateAge,
  isProfileComplete,
  isValidEmail,
  normalizeUser,
  normalizeEmail
} from '../types/models';
import {
  loadPersistedState,
  persistState,
  removePersistedState,
  withoutSensitivePersistedData
} from '../services/persistence';
import {
  createEmptyMainEventConfig,
  createEmptyMainEventInfo,
  createEmptyMainEventSnapshot
} from '../data/appDefaults';
import { loadAppwriteConfiguration } from '../services/appwriteConfiguration';
import { AppwriteService, AppwriteServiceError, EventRemoteState } from '../services/appwriteService';

interface EventFeedback {
  message: string;
  isError: boolean;
}

interface SendMessageInput {
  threadId: string;
  text: string;
  replyToMessageId?: string;
  attachments?: ChatAttachment[];
}

type SwipeDecision = 'left' | 'right';
type RelationshipAction = 'archive' | 'unmatch' | 'block';

interface SwipeDecisionResult {
  matched: boolean;
  message: string;
  threadId?: string;
  recorded: boolean;
}

interface EventAdminActionResult {
  state: EventAdminState | null;
  error: string | null;
}

interface AppContextValue {
  persisted: PersistedAppState;
  isAuthInitialized: boolean;
  authError: boolean;
  retrySession(): void;
  discoveryLoading: boolean;
  discoveryError: boolean;
  discoveryExhausted: boolean;
  loadMoreProfiles(): Promise<void>;
  openThread(threadId: string | null): void;
  loadOlderMessages(threadId: string, beforeCommit?: () => void): Promise<void>;
  retryMessage(messageId: string): void;
  cancelMessage(messageId: string): void;
  currentUser: User | null;
  discoverProfiles: DiscoverProfile[];
  mainEventConfig: MainEventConfig;
  mainEventInfo: MainEventInfo;
  hasMainEvent: boolean;
  isEventAdmin: boolean;
  isEventAdminEnabled: boolean;
  mainEventSnapshot: MainEventSnapshot;
  mainEventFlags: {
    isRegistered: boolean;
    isWaiting: boolean;
  };
  currentUserUpcomingEventHistory: EventHistoryItem[];
  unreadNotificationsCount: number;
  unreadThreadsCount: number;
  notificationPermission: NotificationPermission | 'unsupported';
  signUp(email: string, password: string): Promise<string | null>;
  logIn(email: string, password: string): Promise<string | null>;
  logOut(): Promise<void>;
  updateProfileImage(imageData: string): Promise<string | null>;
  updateProfileImages(imageDataItems: string[]): Promise<string | null>;
  updateProfile(input: ProfileUpdateInput): Promise<string | null>;
  updateAccountPreferences(input: {
    city?: string | null;
    latitude?: number;
    longitude?: number;
    orientation: UserOrientation;
    preferredGenders: UserGender[];
    smokes: boolean;
    drinks: boolean;
    excludeSmokers: boolean;
    excludeDrinkers: boolean;
    bio: string;
    minPreferredAge: number;
    maxPreferredAge: number;
    maxDistanceKm?: number;
    intent: MatchIntent;
    interests: string;
    instagramTag: string;
    spotifyTag: string;
  }): Promise<string | null>;
  willUserLoseEventRegistrations(
    nextGender: UserGender | undefined,
    nextOrientation: UserOrientation | undefined
  ): boolean;
  registerCurrentUserForMainEvent(): Promise<EventFeedback>;
  cancelCurrentUserMainEventRegistration(): Promise<EventFeedback>;
  sendMessage(input: SendMessageInput): void;
  markThreadRead(threadId: string): void;
  setThreadNotifications(threadId: string, enabled: boolean): Promise<string | null>;
  deleteThread(threadId: string): void;
  applyRelationshipAction(threadId: string, action: RelationshipAction): Promise<string | null>;
  submitSwipeDecision(profileId: string, decision: SwipeDecision): Promise<SwipeDecisionResult>;
  fetchMainEventAdminState(eventId?: string): Promise<EventAdminActionResult>;
  updateMainEventAsAdmin(eventId: string, draft: EventAdminDraftInput): Promise<EventAdminActionResult>;
  addMainEventParticipantAsAdmin(eventId: string, lookup: string, status: EventAdminMutableStatus): Promise<EventAdminActionResult>;
  removeMainEventParticipantAsAdmin(eventId: string, registrationId: string): Promise<EventAdminActionResult>;
  markNotificationRead(notificationId: string): void;
  markAllNotificationsRead(): void;
  requestBrowserNotificationsPermission(): Promise<NotificationPermission | 'unsupported'>;
  updateSettings(patch: Partial<AppSettings>): void;
  setThreads(threads: ChatThread[]): void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const EVENT_ADMIN_MESSAGE_BY_KEY: Record<string, string> = {
  'events.admin.error.forbidden': 'Non hai i permessi admin per questo evento.',
  'events.admin.error.invalidAction': 'Azione admin non valida.',
  'events.admin.error.invalidParticipant': 'Dati partecipante non validi.',
  'events.admin.error.userNotFound': 'Utente non trovato.',
  'events.error.requestFailed': 'Operazione admin non riuscita. Riprova.'
};

const EVENT_MESSAGE_BY_KEY: Record<string, string> = {
  'events.error.genderRequired': 'Completa il genere nel profilo prima di iscriverti.',
  'events.error.genderUnsupported': 'Per questo evento sono ammessi solo uomo/donna.',
  'events.error.orientationUnsupported': 'Per questo evento è richiesto orientamento etero.',
  'events.error.notRegistered': 'Nessuna iscrizione evento trovata.',
  'events.error.registrationClosed': 'Le iscrizioni per questo evento sono chiuse.',
  'events.error.cancellationClosed': 'La finestra per la disdetta è terminata.',
  'events.error.alreadyRegistered': 'Sei già registrato a questo evento.',
  'events.error.alreadyWaitlisted': 'Sei già in waiting list.',
  'events.error.capacityFull': 'L\'evento è al completo.',
  'events.error.requestFailed': 'Operazione evento non riuscita. Riprova.'
};

const liveConfiguration = OFFLINE_DEMO ? null : loadAppwriteConfiguration();
const appwriteConfiguration = liveConfiguration ?? { projectId: 'offline-demo', eventAdminFunctionId: 'offline-demo' };
const appwriteService = liveConfiguration ? new AppwriteService(liveConfiguration) : new OfflineDemoService();
const IS_EVENT_ADMIN_ENABLED = Boolean(appwriteConfiguration.eventAdminFunctionId);
const LOGOUT_TOMBSTONE_KEY = `${LOCAL_STATE_PREFIX}backend_logout_pending_v1`;
const DISCOVERY_TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000;

function hasLogoutTombstone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(LOGOUT_TOMBSTONE_KEY) === '1';
  } catch {
    return true;
  }
}

function setLogoutTombstone(isPending: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (isPending) {
      window.localStorage.setItem(LOGOUT_TOMBSTONE_KEY, '1');
    } else {
      window.localStorage.removeItem(LOGOUT_TOMBSTONE_KEY);
    }
  } catch {
    // Storage failure remains fail-closed for the current in-memory session.
  }
}

function upsertUser(users: User[], user: User): User[] {
  const normalizedUser = normalizeUser(user);
  const existingIndex = users.findIndex(
    (candidate) =>
      candidate.email === normalizedUser.email ||
      (Boolean(normalizedUser.appwriteUserId) &&
        candidate.appwriteUserId === normalizedUser.appwriteUserId)
  );

  if (existingIndex < 0) {
    return [...users, normalizedUser];
  }

  const nextUsers = [...users];
  nextUsers[existingIndex] = normalizeUser({
    ...nextUsers[existingIndex],
    ...normalizedUser
  });
  return nextUsers;
}

function appwriteMessageKey(error: unknown): string | null {
  if (!(error instanceof AppwriteServiceError)) {
    return null;
  }

  const payload = error.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const maybeKey = (payload as Record<string, unknown>).messageKey;
  return typeof maybeKey === 'string' && maybeKey.trim().length > 0 ? maybeKey.trim() : null;
}

function eventAdminErrorMessage(error: unknown): string {
  const messageKey = appwriteMessageKey(error);
  if (messageKey && EVENT_ADMIN_MESSAGE_BY_KEY[messageKey]) {
    return EVENT_ADMIN_MESSAGE_BY_KEY[messageKey];
  }

  if (error instanceof AppwriteServiceError && error.statusCode === 403) {
    return 'Non hai i permessi admin per questo evento.';
  }

  if (error instanceof AppwriteServiceError && error.statusCode === 404) {
    return 'Evento non trovato o non accessibile.';
  }

  return 'Operazione admin non riuscita. Riprova.';
}

function eventErrorMessage(error: unknown, fallbackMessage: string): string {
  const messageKey = appwriteMessageKey(error);
  if (messageKey && EVENT_MESSAGE_BY_KEY[messageKey]) {
    return EVENT_MESSAGE_BY_KEY[messageKey];
  }

  return mapAppwriteError(error, fallbackMessage);
}

function nowIso(): string {
  return new Date().toISOString();
}

function isNotificationEnabledForType(
  settings: AppSettings,
  type: NotificationType
): boolean {
  if (!settings.notificationsEnabled) {
    return false;
  }

  if (type === 'match') {
    return settings.matchNotificationsEnabled;
  }

  if (type === 'chat') {
    return settings.messageNotificationsEnabled;
  }

  if (type === 'event') {
    return settings.eventReminderNotificationsEnabled;
  }

  return true;
}

function normalizePreferredGenders(preferredGenders: UserGender[]): UserGender[] {
  const ordered = ['male', 'female', 'nonBinary', 'other'] as const;
  const unique = new Set(preferredGenders);
  return ordered.filter((gender) => unique.has(gender));
}

function normalizeSocialHandle(value: string): string {
  return value.trim().replace(/@/g, '').replace(/\s+/g, '').slice(0, 64);
}

function normalizeMaxDistanceKm(value: number | undefined): number | undefined {
  if (value == null || value <= 0) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(Math.max(Math.floor(value), 5), 999);
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [persisted, setPersisted] = useState<PersistedAppState>(() =>
    withoutSensitivePersistedData(loadPersistedState())
  );
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const retrySession = useCallback(() => { setAuthError(false); setBootstrapAttempt((value) => value + 1); }, []);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState(false);
  const [discoveryExhausted, setDiscoveryExhausted] = useState(false);
  const consumedProfilesRef = useRef(new Set<string>());
  const discoveryCursorRef = useRef<string | null>(null);
  const discoveryLoadingRef = useRef(false);
  const discoveryCursorsRef = useRef(new Set<string>());
  const activeThreadRef = useRef<string | null>(null);
  const olderRequestsRef = useRef(new Set<string>());
  const preferenceOwnerRef = useRef<string | null>(null);
  const attemptsRef = useRef(new Map<string, {
    input: Parameters<AppwriteService['sendMessage']>[0]; generation: number; control: UploadControl | null;
  }>());
  const [discoverProfiles, setDiscoverProfiles] = useState<DiscoverProfile[]>([]);
  const [remoteMainEventState, setRemoteMainEventState] = useState<EventRemoteState | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return 'unsupported';
    }
    return Notification.permission;
  });

  const lastBrowserNotificationRef = useRef<string | null>(null);
  const sessionInvalidationRef = useRef(0);
  const eventRefreshRequestRef = useRef(0);
  const threadRefreshRequestRef = useRef(0);
  const discoveryRefreshRequestRef = useRef(0);
  const authQueueRef = useRef<Promise<void>>(Promise.resolve());

  const runSerializedAuth = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = authQueueRef.current.then(operation, operation);
    authQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  const profileQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveProfileMutation = useCallback((base: User, next: User, image?: string): Promise<User> => {
    const generation = sessionInvalidationRef.current;
    const patch = Object.fromEntries(Object.entries(next).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(base[key as keyof User])));
    const operation = async (): Promise<User> => {
      if (generation !== sessionInvalidationRef.current) throw new AppwriteServiceError('Session ended', 401);
      // Refresh after prior writes, including commits whose response was lost.
      const verified = await appwriteService.restoreCurrentUser();
      if (!verified || verified.appwriteUserId !== base.appwriteUserId || generation !== sessionInvalidationRef.current) {
        throw new AppwriteServiceError('Session changed', 401);
      }
      return image === undefined
        ? appwriteService.updateProfile({ ...verified, ...patch })
        : appwriteService.updateProfileImage(verified, image);
    };
    const result = profileQueueRef.current.then(operation, operation);
    profileQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  const finishPendingBackendLogout = useCallback(async (): Promise<boolean> => {
    if (!hasLogoutTombstone()) {
      return true;
    }
    try {
      await appwriteService.logOut();
      setLogoutTombstone(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    persistState(withoutSensitivePersistedData(persisted));
  }, [persisted]);

  const currentUser = useMemo(() => {
    if (!isAuthInitialized || !persisted.currentUserEmail) {
      return null;
    }

    return (
      persisted.users.find((candidate) => candidate.email === persisted.currentUserEmail) ?? null
    );
  }, [isAuthInitialized, persisted.currentUserEmail, persisted.users]);

  const refreshRemoteMainEventState = useCallback(async (user: User | null): Promise<EventRemoteState | null> => {
    const sessionGeneration = sessionInvalidationRef.current;
    const requestGeneration = ++eventRefreshRequestRef.current;
    try {
      const nextState = await appwriteService.fetchMainEventState(user);
      if (
        sessionGeneration !== sessionInvalidationRef.current ||
        requestGeneration !== eventRefreshRequestRef.current
      ) {
        return null;
      }
      setRemoteMainEventState(nextState);
      return nextState;
    } catch {
      if (
        sessionGeneration !== sessionInvalidationRef.current ||
        requestGeneration !== eventRefreshRequestRef.current
      ) {
        return null;
      }
      setRemoteMainEventState(null);
      return null;
    }
  }, []);

  const refreshThreads = useCallback(async (): Promise<void> => {
    const sessionGeneration = sessionInvalidationRef.current;
    const requestGeneration = ++threadRefreshRequestRef.current;
    try {
      const threads = await appwriteService.fetchThreads();
      const active = activeThreadRef.current;
      if (active && threads.some((thread) => thread.id === active)) {
        const detail = await appwriteService.fetchThread(active);
        if (detail) threads.splice(threads.findIndex((thread) => thread.id === active), 1, detail);
      }
      if (
        sessionGeneration !== sessionInvalidationRef.current ||
        requestGeneration !== threadRefreshRequestRef.current
      ) {
        return;
      }
      setPersisted((prev) => ({
        ...prev,
        threads: mergeChatThreads(threads, prev.threads),
        realtimeState: 'connected'
      }));
    } catch {
      if (
        sessionGeneration !== sessionInvalidationRef.current ||
        requestGeneration !== threadRefreshRequestRef.current
      ) {
        return;
      }
      setPersisted((prev) => ({
        ...prev,
        realtimeState: 'disconnected'
      }));
    }
  }, []);

  const commitCurrentUser = useCallback((user: User | null): void => {
    if (!user) {
      sessionInvalidationRef.current += 1;
      eventRefreshRequestRef.current += 1;
      threadRefreshRequestRef.current += 1;
      discoveryRefreshRequestRef.current += 1;
      removePersistedState();
      activeThreadRef.current = null;
      consumedProfilesRef.current.clear();
      attemptsRef.current.forEach((attempt) => attempt.control?.cancel());
      attemptsRef.current.clear();
    }
    const owner = user?.appwriteUserId ?? null;
    const changedOwner = owner !== preferenceOwnerRef.current;
    preferenceOwnerRef.current = owner;

    setPersisted((prev) => {
      if (!user) {
        return { ...withoutSensitivePersistedData(prev), settings: accountSettings(prev.settings, appwriteConfiguration.projectId, null) };
      }

      const normalizedUser = normalizeUser(user);

      return {
        ...prev,
        users: upsertUser(prev.users, normalizedUser),
        currentUserEmail: normalizedUser.email,
        settings: changedOwner ? accountSettings(prev.settings, appwriteConfiguration.projectId, owner) : prev.settings
      };
    });
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const bootstrapGeneration = sessionInvalidationRef.current;

    void (async () => {
      await runSerializedAuth(async () => {
        if (hasLogoutTombstone()) {
          await finishPendingBackendLogout();
          if (!isCancelled) {
            // Never resurrect an account while a remote logout is unresolved.
            commitCurrentUser(null);
            setRemoteMainEventState(null);
            setIsAuthInitialized(true);
          }
          return;
        }

        try {
          const restoredUser = await appwriteService.restoreCurrentUser();
          if (!isCancelled && bootstrapGeneration === sessionInvalidationRef.current) {
            if (restoredUser) {
              sessionInvalidationRef.current += 1;
            }
            commitCurrentUser(restoredUser);
            setAuthError(false);
            setIsAuthInitialized(true);
          }
        } catch {
          if (!isCancelled && bootstrapGeneration === sessionInvalidationRef.current) {
            setAuthError(true);
          }
        }
      });
    })();

    return () => {
      isCancelled = true;
    };
  }, [commitCurrentUser, finishPendingBackendLogout, runSerializedAuth, bootstrapAttempt]);

  useEffect(() => {
    if (!isAuthInitialized || !currentUser) {
      return;
    }

    let isStopped = false;

    const markOnline = () => {
      if (!isStopped && document.visibilityState === 'visible') {
        void appwriteService.markCurrentUserPresence(true).catch(() => undefined);
      }
    };
    const markOffline = () => {
      void appwriteService.markCurrentUserPresence(false).catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markOnline();
      } else {
        markOffline();
      }
    };

    markOnline();
    const heartbeat = window.setInterval(markOnline, 25_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', markOffline);

    return () => {
      isStopped = true;
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', markOffline);
      markOffline();
    };
  }, [currentUser, isAuthInitialized]);

  useEffect(() => {
    if (!isAuthInitialized) {
      return;
    }

    void refreshRemoteMainEventState(currentUser);
  }, [currentUser, isAuthInitialized, refreshRemoteMainEventState]);

  const hydrateDiscoverProfiles = useCallback(async (reset = true): Promise<void> => {
    if (!reset && (discoveryLoadingRef.current || discoveryCursorRef.current === null)) return;
    if (reset) { discoveryCursorRef.current = null; discoveryCursorsRef.current.clear(); }
    const cursor = discoveryCursorRef.current;
    const sessionGeneration = sessionInvalidationRef.current;
    const requestGeneration = ++discoveryRefreshRequestRef.current;
    discoveryLoadingRef.current = true;
    setDiscoveryLoading(true);
    setDiscoveryError(false);
    try {
      const page = await appwriteService.fetchDiscoverPage(cursor);
      if (sessionGeneration !== sessionInvalidationRef.current || requestGeneration !== discoveryRefreshRequestRef.current) return;
      if (page.nextCursor && discoveryCursorsRef.current.has(page.nextCursor)) throw new Error('Repeated cursor');
      if (page.nextCursor) discoveryCursorsRef.current.add(page.nextCursor);
      discoveryCursorRef.current = page.nextCursor;
      setDiscoveryExhausted(page.nextCursor === null);
      setDiscoverProfiles((previous) => {
        const updated = new Map(previous.map((profile) => [profile.id, profile]));
        page.profiles.forEach((profile) => { if (!consumedProfilesRef.current.has(profile.id)) updated.set(profile.id, profile); });
        return Array.from(updated.values());
      });
    } catch {
      if (sessionGeneration === sessionInvalidationRef.current && requestGeneration === discoveryRefreshRequestRef.current) setDiscoveryError(true);
    } finally {
      if (requestGeneration === discoveryRefreshRequestRef.current) {
        discoveryLoadingRef.current = false;
        setDiscoveryLoading(false);
      }
    }
  }, []);
  const loadMoreProfiles = useCallback(() => hydrateDiscoverProfiles(discoveryCursorRef.current === null), [hydrateDiscoverProfiles]);

  const hydrateThreads = useCallback(async (): Promise<void> => {
    await refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    if (!isAuthInitialized) {
      return;
    }

    void hydrateThreads();
  }, [persisted.currentUserEmail, hydrateDiscoverProfiles, hydrateThreads, isAuthInitialized]);

  const discoveryProfileRefreshKey = useMemo(() => {
    if (!currentUser || !isProfileComplete(currentUser)) {
      return '';
    }

    return [
      currentUser.appwriteUserId ?? currentUser.email,
      currentUser.gender,
      currentUser.orientation,
      (currentUser.preferredGenders ?? []).join(','),
      currentUser.minPreferredAge,
      currentUser.maxPreferredAge,
      currentUser.maxDistanceKm ?? 'none',
      currentUser.excludeSmokers,
      currentUser.excludeDrinkers,
      currentUser.city
    ].join('|');
  }, [currentUser]);

  useEffect(() => {
    if (!discoveryProfileRefreshKey) {
      return;
    }

    setDiscoverProfiles([]);
    setDiscoveryExhausted(false);
    void hydrateDiscoverProfiles();
  }, [discoveryProfileRefreshKey, hydrateDiscoverProfiles]);

  useEffect(() => {
    if (!discoveryProfileRefreshKey) {
      return;
    }

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void hydrateDiscoverProfiles();
      }
    };
    const interval = window.setInterval(refresh, DISCOVERY_TOKEN_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [discoveryProfileRefreshKey, hydrateDiscoverProfiles]);

  useEffect(() => {
    if (!isAuthInitialized || !currentUser?.appwriteUserId) {
      return;
    }

    let isStopped = false;
    let pendingRefresh: number | null = null;
    let refreshInFlight = false;
    let fallbackRefresh: number | null = null;

    const scheduleRefresh = () => {
      if (isStopped || pendingRefresh !== null || document.visibilityState !== 'visible') {
        return;
      }

      pendingRefresh = window.setTimeout(async () => {
        pendingRefresh = null;
        if (isStopped || refreshInFlight) {
          return;
        }

        refreshInFlight = true;
        await refreshThreads();
        refreshInFlight = false;
      }, 500);
    };

    setPersisted((prev) => ({
      ...prev,
      realtimeState: 'connecting'
    }));

    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = appwriteService.subscribeToChatRealtime(scheduleRefresh);
      scheduleRefresh();
      if (persisted.settings.notificationsPollingEnabled) fallbackRefresh = window.setInterval(scheduleRefresh, 30_000);
    } catch {
      setPersisted((prev) => ({
        ...prev,
        realtimeState: 'disconnected'
      }));
      if (persisted.settings.notificationsPollingEnabled) fallbackRefresh = window.setInterval(scheduleRefresh, 30_000);
      scheduleRefresh();
    }

    document.addEventListener('visibilitychange', scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      isStopped = true;
      document.removeEventListener('visibilitychange', scheduleRefresh);
      window.removeEventListener('focus', scheduleRefresh);
      if (pendingRefresh !== null) {
        window.clearTimeout(pendingRefresh);
      }
      if (fallbackRefresh !== null) {
        window.clearInterval(fallbackRefresh);
      }
      unsubscribe();
    };
  }, [currentUser?.appwriteUserId, isAuthInitialized, refreshThreads, persisted.settings.notificationsPollingEnabled]);

  const [verifiedEventAdminUserId, setVerifiedEventAdminUserId] = useState<string | null>(null);
  const activeAppwriteUserId = currentUser?.appwriteUserId ?? null;
  const isEventAdmin = Boolean(
    activeAppwriteUserId && verifiedEventAdminUserId === activeAppwriteUserId
  );

  useEffect(() => {
    let isCancelled = false;

    if (!IS_EVENT_ADMIN_ENABLED || !activeAppwriteUserId) {
      setVerifiedEventAdminUserId(null);
      return () => {
        isCancelled = true;
      };
    }

    void appwriteService.fetchEventAdminState()
      .then(() => {
        if (!isCancelled) {
          setVerifiedEventAdminUserId(activeAppwriteUserId);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setVerifiedEventAdminUserId(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeAppwriteUserId]);

  const resolvedMainEventConfig = useMemo<MainEventConfig>(() => {
    if (!remoteMainEventState) {
      return createEmptyMainEventConfig();
    }

    const maleLimit =
      remoteMainEventState.snapshot.maleCount + remoteMainEventState.snapshot.remainingMaleSlots;
    const femaleLimit =
      remoteMainEventState.snapshot.femaleCount + remoteMainEventState.snapshot.remainingFemaleSlots;

    return {
      date: remoteMainEventState.snapshot.date,
      title: remoteMainEventState.snapshot.title,
      maxParticipants: remoteMainEventState.snapshot.maxParticipants,
      maxPerGender: Math.max(maleLimit, femaleLimit, 1)
    };
  }, [remoteMainEventState]);

  const resolvedMainEventInfo = useMemo<MainEventInfo>(() => {
    if (!remoteMainEventState) {
      return createEmptyMainEventInfo();
    }

    const remoteInfo = remoteMainEventState.info;
    return {
      venue: remoteInfo.venue,
      address: '',
      timeLabel: '',
      contribution: '',
      contact: '',
      dressCode: '',
      description: remoteInfo.description,
      rules: remoteInfo.rules,
      registrationClosesAt: remoteInfo.registrationClosesAt,
      cancellationClosesAt: remoteInfo.cancellationClosesAt
    };
  }, [remoteMainEventState]);

  const mainEventSnapshot = useMemo(
    () => remoteMainEventState?.snapshot ?? createEmptyMainEventSnapshot(),
    [remoteMainEventState]
  );

  const mainEventFlags = useMemo(() => ({
    isRegistered: remoteMainEventState?.currentStatus === 'confirmed' || remoteMainEventState?.currentStatus === 'promoted',
    isWaiting: remoteMainEventState?.currentStatus === 'waitlisted'
  }), [remoteMainEventState]);

  const hasMainEvent = remoteMainEventState !== null;

  const currentUserUpcomingEventHistory = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const now = Date.now();
    const sourceHistory = remoteMainEventState?.history ?? [];

    return sourceHistory
      .filter((item) => item.email === currentUser.email && new Date(item.eventDate).getTime() >= now)
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );
  }, [currentUser, remoteMainEventState]);

  const unreadNotificationsCount = useMemo(
    () => persisted.notifications.filter((notification) => !notification.readAt).length,
    [persisted.notifications]
  );

  const unreadThreadsCount = useMemo(
    () => persisted.threads.filter((thread) => thread.unreadCount > 0).length,
    [persisted.threads]
  );

  const hasRemoteMainEventRegistration = useMemo(
    () =>
      mainEventFlags.isRegistered ||
      mainEventFlags.isWaiting,
    [mainEventFlags.isRegistered, mainEventFlags.isWaiting]
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!isValidEmail(email)) {
        return 'Inserisci un indirizzo email valido.';
      }

      if (password.length < 8) {
        return 'La password deve contenere almeno 8 caratteri.';
      }

      const normalized = normalizeEmail(email);

      const authGeneration = sessionInvalidationRef.current;
      return runSerializedAuth(async () => {
        if (!(await finishPendingBackendLogout())) {
          return 'Disconnessione precedente non completata. Riprova quando il server è raggiungibile.';
        }
        try {
          const user = await appwriteService.signUp(normalized, password);
          if (authGeneration !== sessionInvalidationRef.current) {
            return 'Operazione di accesso annullata.';
          }
          sessionInvalidationRef.current += 1;
          commitCurrentUser(user);
          return null;
        } catch (error) {
          return mapAppwriteError(error, 'Registrazione non riuscita. Riprova.', persisted.settings.language, true);
        }
      });
    },
    [commitCurrentUser, finishPendingBackendLogout, runSerializedAuth, persisted.settings.language]
  );

  const logIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!isValidEmail(email)) {
        return 'Inserisci un indirizzo email valido.';
      }

      const normalized = normalizeEmail(email);

      const authGeneration = sessionInvalidationRef.current;
      return runSerializedAuth(async () => {
        if (!(await finishPendingBackendLogout())) {
          return 'Disconnessione precedente non completata. Riprova quando il server è raggiungibile.';
        }
        try {
          const user = await appwriteService.logIn(normalized, password);
          if (authGeneration !== sessionInvalidationRef.current) {
            return 'Operazione di accesso annullata.';
          }
          sessionInvalidationRef.current += 1;
          commitCurrentUser(user);
          return null;
        } catch (error) {
          return mapAppwriteError(error, 'Accesso non riuscito. Riprova.', persisted.settings.language, true);
        }
      });
    },
    [commitCurrentUser, finishPendingBackendLogout, runSerializedAuth, persisted.settings.language]
  );

  const logOut = useCallback(async (): Promise<void> => {
    setLogoutTombstone(true);
    commitCurrentUser(null);
    setIsAuthInitialized(true);
    setDiscoverProfiles([]);
    setRemoteMainEventState(null);
    lastBrowserNotificationRef.current = null;
    await runSerializedAuth(async () => {
      try {
        await appwriteService.logOut();
        setLogoutTombstone(false);
      } catch {
        // Keep the tombstone: bootstrap and future login remain fail-closed.
      } finally {
        // A late auth response must never repopulate local authenticated state.
        commitCurrentUser(null);
        setDiscoverProfiles([]);
        setRemoteMainEventState(null);
      }
    });
  }, [commitCurrentUser, runSerializedAuth]);

  const updateProfileImage = useCallback(
    async (imageData: string): Promise<string | null> => {
      if (!currentUser) {
        return 'Effettua di nuovo l\'accesso.';
      }

      const sessionGeneration = sessionInvalidationRef.current;
      try {
        const updatedUser = await saveProfileMutation(currentUser, currentUser, imageData);
        if (sessionGeneration !== sessionInvalidationRef.current) {
          return null;
        }
        commitCurrentUser(updatedUser);
        return null;
      } catch (error) {
        return mapAppwriteError(error, 'Impossibile aggiornare la foto profilo.', persisted.settings.language);
      }
    },
    [commitCurrentUser, currentUser, saveProfileMutation, persisted.settings.language]
  );

  const updateProfileImages = useCallback(
    async (imageDataItems: string[]): Promise<string | null> => {
      if (!currentUser) {
        return 'Effettua di nuovo l\'accesso.';
      }

      const sanitizedImages = imageDataItems
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .slice(0, 6);

      const nextUser = normalizeUser({
        ...currentUser,
        profilePhotoDataItems: sanitizedImages,
        photoFileIds: sanitizedImages.length === 0
          ? []
          : (currentUser.photoFileIds ?? []).filter((fileId) =>
              sanitizedImages.some((image) => image.includes(fileId))
            )
      });

      const sessionGeneration = sessionInvalidationRef.current;
      try {
        const updatedUser = await saveProfileMutation(currentUser, nextUser);
        if (sessionGeneration !== sessionInvalidationRef.current) {
          return null;
        }
        commitCurrentUser(updatedUser);
        return null;
      } catch (error) {
        return mapAppwriteError(error, 'Impossibile aggiornare le foto per lo swipe.', persisted.settings.language);
      }
    },
    [commitCurrentUser, currentUser, saveProfileMutation, persisted.settings.language]
  );

  const willUserLoseEventRegistrations = useCallback(
    (nextGender: UserGender | undefined, nextOrientation: UserOrientation | undefined): boolean => {
      if (!hasRemoteMainEventRegistration) {
        return false;
      }

      const isGenderSupported = nextGender === 'male' || nextGender === 'female';
      return !isGenderSupported || nextOrientation !== 'straight';
    },
    [hasRemoteMainEventRegistration]
  );

  const enforceRemoteMainEventEligibilityAfterProfileChange = useCallback(
    async (shouldRemoveRegistration: boolean, user: User): Promise<string | null> => {
      if (shouldRemoveRegistration) {
        try {
          await appwriteService.cancelMainEventRegistration(user, remoteMainEventState?.eventId);
        } catch {
          // Refresh below decides whether the server-side cancellation policy allowed the change.
        }
      }

      const nextState = await refreshRemoteMainEventState(user);
      if (shouldRemoveRegistration && nextState?.currentStatus) {
        return 'Profilo aggiornato, ma la posizione evento non è stata rimossa dal server.';
      }

      return null;
    },
    [refreshRemoteMainEventState, remoteMainEventState?.eventId]
  );

  const updateProfile = useCallback(
    async (input: ProfileUpdateInput): Promise<string | null> => {
      if (!currentUser) {
        return 'Effettua di nuovo l\'accesso.';
      }

      const requiredFields = [
        input.firstName,
        input.city,
        input.bio
      ];

      if (!requiredFields.every((field) => field.trim().length > 0)) {
        return 'Compila tutti i campi obbligatori.';
      }

      const age = calculateAge(input.birthDate);
      if (age < 18) {
        return 'Devi avere almeno 18 anni.';
      }

      if (
        !Number.isInteger(input.minPreferredAge) ||
        !Number.isInteger(input.maxPreferredAge) ||
        input.minPreferredAge < 18 ||
        input.maxPreferredAge > 99 ||
        input.maxPreferredAge <= input.minPreferredAge
      ) {
        return 'La fascia d\'età non è valida.';
      }

      const normalizedMaxDistanceKm = normalizeMaxDistanceKm(input.maxDistanceKm);

      const preferredGenders = normalizePreferredGenders(input.preferredGenders);
      if (preferredGenders.length === 0) {
        return 'Seleziona almeno una preferenza di genere.';
      }

      const shouldRemoveMainEvent = willUserLoseEventRegistrations(
        input.gender,
        input.orientation
      );

      const updatedUser = normalizeUser({
        ...currentUser,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        city: input.city.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        birthDate: input.birthDate,
        gender: input.gender,
        orientation: input.orientation,
        preferredGenders,
        smokes: input.smokes,
        drinks: input.drinks,
        excludeSmokers: input.excludeSmokers,
        excludeDrinkers: input.excludeDrinkers,
        bio: input.bio.trim(),
        minPreferredAge: input.minPreferredAge,
        maxPreferredAge: input.maxPreferredAge,
        maxDistanceKm: normalizedMaxDistanceKm,
        intent: input.intent,
        interests: input.interests.trim(),
        instagramTag: normalizeSocialHandle(input.instagramTag),
        spotifyTag: normalizeSocialHandle(input.spotifyTag)
      });

      const sessionGeneration = sessionInvalidationRef.current;
      try {
        const savedUser = await saveProfileMutation(currentUser, updatedUser);
        if (sessionGeneration !== sessionInvalidationRef.current) {
          return null;
        }
        commitCurrentUser(savedUser);
        const eventError = await enforceRemoteMainEventEligibilityAfterProfileChange(
          shouldRemoveMainEvent,
          savedUser
        );
        if (eventError) {
          return eventError;
        }
        return null;
      } catch (error) {
        return mapAppwriteError(error, 'Impossibile salvare il profilo adesso. Riprova.', persisted.settings.language);
      }
    },
    [
      commitCurrentUser,
      currentUser,
      enforceRemoteMainEventEligibilityAfterProfileChange,
      willUserLoseEventRegistrations,
      saveProfileMutation,
      persisted.settings.language
    ]
  );

  const updateAccountPreferences = useCallback(
    async (input: {
      orientation: UserOrientation;
      preferredGenders: UserGender[];
      smokes: boolean;
      drinks: boolean;
      excludeSmokers: boolean;
      excludeDrinkers: boolean;
      bio: string;
      minPreferredAge: number;
      maxPreferredAge: number;
      maxDistanceKm?: number;
      city?: string | null;
      latitude?: number;
      longitude?: number;
      intent: MatchIntent;
      interests: string;
      instagramTag: string;
      spotifyTag: string;
    }): Promise<string | null> => {
      if (!currentUser) {
        return 'Effettua di nuovo l\'accesso.';
      }

      if (
        !Number.isInteger(input.minPreferredAge) ||
        !Number.isInteger(input.maxPreferredAge) ||
        input.minPreferredAge < 18 ||
        input.maxPreferredAge > 99 ||
        input.maxPreferredAge <= input.minPreferredAge
      ) {
        return 'Fascia d\'età non valida.';
      }

      const normalizedMaxDistanceKm = normalizeMaxDistanceKm(input.maxDistanceKm);

      const preferredGenders = normalizePreferredGenders(input.preferredGenders);
      if (preferredGenders.length === 0) {
        return 'Seleziona almeno una preferenza di genere.';
      }

      const shouldRemoveMainEvent = willUserLoseEventRegistrations(
        currentUser.gender,
        input.orientation
      );

      const updatedUser = normalizeUser({
        ...currentUser,
        ...(input.city != null
          ? {
              city: input.city.trim(),
              latitude: input.latitude,
              longitude: input.longitude
            }
          : {}),
        orientation: input.orientation,
        preferredGenders,
        smokes: input.smokes,
        drinks: input.drinks,
        excludeSmokers: input.excludeSmokers,
        excludeDrinkers: input.excludeDrinkers,
        bio: input.bio.trim(),
        minPreferredAge: input.minPreferredAge,
        maxPreferredAge: input.maxPreferredAge,
        maxDistanceKm: normalizedMaxDistanceKm,
        intent: input.intent,
        interests: input.interests.trim(),
        instagramTag: normalizeSocialHandle(input.instagramTag),
        spotifyTag: normalizeSocialHandle(input.spotifyTag)
      });

      const sessionGeneration = sessionInvalidationRef.current;
      try {
        const savedUser = await saveProfileMutation(currentUser, updatedUser);
        if (sessionGeneration !== sessionInvalidationRef.current) {
          return null;
        }
        commitCurrentUser(savedUser);
        const eventError = await enforceRemoteMainEventEligibilityAfterProfileChange(
          shouldRemoveMainEvent,
          savedUser
        );
        if (eventError) {
          return eventError;
        }
        return null;
      } catch (error) {
        return mapAppwriteError(error, 'Aggiornamento preferenze non riuscito. Riprova.', persisted.settings.language);
      }
    },
    [
      commitCurrentUser,
      currentUser,
      enforceRemoteMainEventEligibilityAfterProfileChange,
      willUserLoseEventRegistrations,
      saveProfileMutation,
      persisted.settings.language
    ]
  );

  const registerCurrentUserForMainEvent = useCallback(async (): Promise<EventFeedback> => {
    if (!currentUser) {
      return {
        message: 'Effettua di nuovo l\'accesso.',
        isError: true
      };
    }

    if (!remoteMainEventState?.eventId) {
      return {
        message: 'Nessun evento live disponibile.',
        isError: true
      };
    }

    if (!currentUser.gender) {
      return {
        message: EVENT_MESSAGE_BY_KEY['events.error.genderRequired'],
        isError: true
      };
    }

    if (currentUser.gender !== 'male' && currentUser.gender !== 'female') {
      return {
        message: EVENT_MESSAGE_BY_KEY['events.error.genderUnsupported'],
        isError: true
      };
    }

    if (currentUser.orientation !== 'straight') {
      return {
        message: EVENT_MESSAGE_BY_KEY['events.error.orientationUnsupported'],
        isError: true
      };
    }

    const hadRegistrationBeforeRequest = hasRemoteMainEventRegistration;

    try {
      const status = await appwriteService.registerForMainEvent(currentUser, remoteMainEventState.eventId);
      const nextState = await refreshRemoteMainEventState(currentUser);
      const resolvedStatus = nextState?.currentStatus ?? status;

      if (!nextState?.currentStatus) {
        return {
          message: 'Iscrizione non confermata dal server. Riprova.',
          isError: true
        };
      }

      return {
        message:
          resolvedStatus === 'waitlisted'
            ? 'Iscrizione registrata: sei in waiting list.'
            : 'Iscrizione evento confermata.',
        isError: false
      };
    } catch (error) {
      const nextState = await refreshRemoteMainEventState(currentUser);
      if (!hadRegistrationBeforeRequest && nextState?.currentStatus) {
        return {
          message:
            nextState.currentStatus === 'waitlisted'
              ? 'Iscrizione registrata: sei in waiting list.'
              : 'Iscrizione evento confermata.',
          isError: false
        };
      }

      return {
        message: eventErrorMessage(error, 'Operazione evento non riuscita. Riprova.'),
        isError: true
      };
    }
  }, [
    currentUser,
    hasRemoteMainEventRegistration,
    refreshRemoteMainEventState,
    remoteMainEventState?.eventId
  ]);

  const cancelCurrentUserMainEventRegistration = useCallback(async (): Promise<EventFeedback> => {
    if (!currentUser) {
      return {
        message: 'Effettua di nuovo l\'accesso.',
        isError: true
      };
    }

    if (!remoteMainEventState?.eventId) {
      return {
        message: 'Nessun evento live disponibile.',
        isError: true
      };
    }

    const hadRegistrationBeforeRequest = hasRemoteMainEventRegistration;

    try {
      await appwriteService.cancelMainEventRegistration(currentUser, remoteMainEventState.eventId);
      await refreshRemoteMainEventState(currentUser);
      return {
        message: 'Iscrizione evento annullata.',
        isError: false
      };
    } catch (error) {
      const nextState = await refreshRemoteMainEventState(currentUser);
      if (hadRegistrationBeforeRequest && !nextState?.currentStatus) {
        return {
          message: 'Iscrizione evento annullata.',
          isError: false
        };
      }

      return {
        message: eventErrorMessage(error, 'Operazione evento non riuscita. Riprova.'),
        isError: true
      };
    }
  }, [
    currentUser,
    hasRemoteMainEventRegistration,
    refreshRemoteMainEventState,
    remoteMainEventState?.eventId
  ]);

  const updateMessage = useCallback((threadId: string, id: string, patch: Partial<ChatMessage>, generation: number) => {
    if (generation !== sessionInvalidationRef.current) return;
    setPersisted((previous) => ({ ...previous, threads: previous.threads.map((thread) => thread.id === threadId
      ? { ...thread, messages: thread.messages.map((message) => message.id === id ? mergeChatMessages([message], [{ ...message, ...patch }])[0] : message) }
      : thread) }));
  }, []);

  const retryMessage = useCallback((id: string): void => {
    const attempt = attemptsRef.current.get(id);
    if (!attempt || attempt.control || attempt.generation !== sessionInvalidationRef.current) return;
    const control = new UploadControl((done, total) => updateMessage(attempt.input.threadId, id,
      { uploadProgress: done / total }, attempt.generation), () => updateMessage(attempt.input.threadId, id, { canCancel: false }, attempt.generation));
    attempt.control = control;
    updateMessage(attempt.input.threadId, id, { deliveryState: 'sending', canCancel: true, uploadProgress: 0 }, attempt.generation);
    void appwriteService.sendMessage({ ...attempt.input, control }).then((message) => {
      updateMessage(attempt.input.threadId, id, { ...message, canCancel: false, uploadProgress: undefined }, attempt.generation);
      attemptsRef.current.delete(id);
    }).catch(() => {
      updateMessage(attempt.input.threadId, id, { deliveryState: control.controller.signal.aborted ? 'cancelled' : 'failed', canCancel: false }, attempt.generation);
    }).finally(() => { attempt.control = null; });
  }, [updateMessage]);

  const cancelMessage = useCallback((id: string) => { attemptsRef.current.get(id)?.control?.cancel(); }, []);

  const sendMessage = useCallback((input: SendMessageInput): void => {
    const owner = currentUser?.appwriteUserId;
    const text = input.text.trim();
    if (!owner || (!text && !input.attachments?.length) || !persisted.threads.some((thread) => thread.id === input.threadId)) return;
    const generation = sessionInvalidationRef.current;
    const entries = input.attachments?.length ? input.attachments : [undefined];
    void (async () => {
      const optimistic: ChatMessage[] = [];
      for (let index = 0; index < entries.length; index++) {
        const operationId = crypto.randomUUID();
        const id = await messageOperationId(owner, input.threadId, operationId);
        if (generation !== sessionInvalidationRef.current) return;
        const pending = { threadId: input.threadId, text: index === 0 ? text : '',
          replyToMessageId: index === 0 ? input.replyToMessageId : undefined, attachment: entries[index], operationId };
        attemptsRef.current.set(id, { input: pending, generation, control: null });
        const createdAt = nowIso();
        optimistic.push({ id, operationId, text: pending.text, isMe: true, createdAt,
          time: new Date(createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
          replyToMessageId: pending.replyToMessageId, attachments: pending.attachment ? [pending.attachment] : undefined,
          deliveryState: 'sending', canCancel: true });
      }
      if (generation !== sessionInvalidationRef.current) return;
      setPersisted((previous) => ({ ...previous, threads: previous.threads.map((thread) => thread.id === input.threadId
        ? { ...thread, messages: mergeChatMessages(thread.messages, optimistic) } : thread) }));
      // Start separately: each attachment keeps its own outcome and operation identity.
      optimistic.forEach((message) => retryMessage(message.id));
    })();
  }, [currentUser?.appwriteUserId, persisted.threads, retryMessage]);

  const openThread = useCallback((threadId: string | null) => {
    activeThreadRef.current = threadId;
    if (threadId) void refreshThreads();
  }, [refreshThreads]);

  const loadOlderMessages = useCallback(async (threadId: string, beforeCommit?: () => void): Promise<void> => {
    const thread = persisted.threads.find((candidate) => candidate.id === threadId);
    const generation = sessionInvalidationRef.current;
    const requestKey = `${generation}:${threadId}`;
    if (!thread?.historyCursor || olderRequestsRef.current.has(requestKey)) return;
    olderRequestsRef.current.add(requestKey);
    try {
      const page = await appwriteService.fetchMessagePage(threadId, thread.historyCursor, undefined, thread.peerReadAt ? new Date(thread.peerReadAt) : null);
      if (generation !== sessionInvalidationRef.current) return;
      beforeCommit?.();
      setPersisted((previous) => ({ ...previous, threads: previous.threads.map((candidate) => candidate.id === threadId
        ? { ...candidate, historyCursor: page.nextCursor, messages: mergeChatMessages(candidate.messages, page.messages) } : candidate) }));
    } finally { olderRequestsRef.current.delete(requestKey); }
  }, [persisted.threads]);

  const markThreadRead = useCallback((threadId: string): void => {
    const readAt = nowIso();

    void appwriteService.markThreadRead(threadId).catch(() => undefined);

    setPersisted((prev) => {
      let didChangeThread = false;
      let didChangeNotifications = false;

      const threads = prev.threads.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        const messages = thread.messages.map((message) => {
          if (message.isMe || message.readAt) {
            return message;
          }

          didChangeThread = true;
          return {
            ...message,
            readAt,
            deliveryState: 'read' as ChatDeliveryState
          };
        });

        if (thread.unreadCount > 0) {
          didChangeThread = true;
        }

        return didChangeThread
          ? {
              ...thread,
              unreadCount: 0,
              messages
            }
          : thread;
      });

      const notifications = prev.notifications.map((notification) => {
        if (notification.threadId !== threadId || notification.readAt) {
          return notification;
        }

        didChangeNotifications = true;
        return {
          ...notification,
          readAt
        };
      });

      if (!didChangeThread && !didChangeNotifications) {
        return prev;
      }

      return {
        ...prev,
        threads,
        notifications
      };
    });
  }, []);

  const setThreadNotifications = useCallback(
    async (threadId: string, enabled: boolean): Promise<string | null> => {
      const thread = persisted.threads.find((candidate) => candidate.id === threadId);
      if (!thread) {
        return 'Conversazione non trovata.';
      }

      setPersisted((prev) => ({
        ...prev,
        threads: prev.threads.map((candidate) =>
          candidate.id === threadId
            ? {
                ...candidate,
                notificationsEnabled: enabled
              }
            : candidate
        )
      }));

      try {
        await appwriteService.updateThreadNotifications(threadId, enabled);
      } catch {
        setPersisted((prev) => ({
          ...prev,
          threads: prev.threads.map((candidate) =>
            candidate.id === threadId
              ? {
                  ...candidate,
                  notificationsEnabled: thread.notificationsEnabled
                }
              : candidate
          )
        }));
        return 'Aggiornamento notifiche chat non riuscito. Riprova.';
      }

      return null;
    },
    [persisted.threads]
  );

  const deleteThread = useCallback((threadId: string): void => {
    setPersisted((prev) => ({
      ...prev,
      threads: prev.threads.filter((thread) => thread.id !== threadId),
      notifications: prev.notifications.filter((notification) => notification.threadId !== threadId)
    }));
  }, []);

  const applyRelationshipAction = useCallback(
    async (threadId: string, action: RelationshipAction): Promise<string | null> => {
      const thread = persisted.threads.find((candidate) => candidate.id === threadId);
      if (!thread) {
        return 'Conversazione non trovata.';
      }

      try {
        await appwriteService.updateRelationship(threadId, action);
      } catch {
        return 'Operazione relazione non riuscita. Riprova.';
      }

      setPersisted((prev) => ({
        ...prev,
        threads: prev.threads.filter((candidate) => candidate.id !== threadId),
        notifications: prev.notifications.filter((notification) => notification.threadId !== threadId)
      }));

      return null;
    },
    [persisted.threads]
  );

  const submitSwipeDecision = useCallback(
    async (profileId: string, decision: SwipeDecision): Promise<SwipeDecisionResult> => {
      const profile = discoverProfiles.find((candidate) => candidate.id === profileId);
      if (!profile) {
        return {
          matched: false,
          message: 'Profilo non disponibile.',
          recorded: false
        };
      }

      const backendDecision = decision === 'right' ? 'liked' : 'passed';
      const sessionGeneration = sessionInvalidationRef.current;

      try {
        const thread = await appwriteService.submitSwipe(profile.id, profile.name, backendDecision);
        if (sessionGeneration !== sessionInvalidationRef.current) {
          return {
            matched: false,
            message: 'Sessione terminata.',
            recorded: false
          };
        }

        consumedProfilesRef.current.add(profileId);
        setDiscoverProfiles((previous) => previous.filter((candidate) => candidate.id !== profileId));
        if (!thread) {
          return {
            matched: false,
            message: decision === 'left'
              ? `Hai saltato ${profile.name}.`
              : `Like inviato a ${profile.name}.`,
            recorded: true
          };
        }

        const createdAt = nowIso();
        const matchNotification: AppNotification = {
          id: crypto.randomUUID(),
          type: 'match',
          title: `Nuovo match con ${profile.name}`,
          body: 'La chat è stata creata automaticamente.',
          createdAt,
          threadId: thread.id
        };

        setPersisted((prev) => ({
          ...prev,
          threads: [
            thread,
            ...prev.threads.filter((existingThread) => existingThread.id !== thread.id)
          ],
          notifications: isNotificationEnabledForType(prev.settings, 'match')
            ? [matchNotification, ...prev.notifications].slice(0, 180)
            : prev.notifications
        }));

        return {
          matched: true,
          threadId: thread.id,
          message: `È un match con ${profile.name}!`,
          recorded: true
        };
      } catch {
        return {
          matched: false,
          message: 'Swipe non registrato. Riprova.',
          recorded: false
        };
      }
    },
    [discoverProfiles]
  );

  const fetchMainEventAdminState = useCallback(async (eventId?: string): Promise<EventAdminActionResult> => {
    if (!IS_EVENT_ADMIN_ENABLED) {
      return {
        state: null,
        error: 'Funzione admin evento non configurata.'
      };
    }

    try {
      const state = await appwriteService.fetchEventAdminState(eventId);
      return {
        state,
        error: null
      };
    } catch (error) {
      return {
        state: null,
        error: eventAdminErrorMessage(error)
      };
    }
  }, []);

  const updateMainEventAsAdmin = useCallback(async (
    eventId: string,
    draft: EventAdminDraftInput
  ): Promise<EventAdminActionResult> => {
    if (!IS_EVENT_ADMIN_ENABLED) {
      return {
        state: null,
        error: 'Funzione admin evento non configurata.'
      };
    }

    if (!eventId.trim()) {
      return {
        state: null,
        error: 'Evento non valido.'
      };
    }

    try {
      const state = await appwriteService.updateMainEventAsAdmin(eventId, draft);
      return {
        state,
        error: null
      };
    } catch (error) {
      return {
        state: null,
        error: eventAdminErrorMessage(error)
      };
    }
  }, []);

  const addMainEventParticipantAsAdmin = useCallback(async (
    eventId: string,
    lookup: string,
    status: EventAdminMutableStatus
  ): Promise<EventAdminActionResult> => {
    if (!IS_EVENT_ADMIN_ENABLED) {
      return {
        state: null,
        error: 'Funzione admin evento non configurata.'
      };
    }

    if (!eventId.trim()) {
      return {
        state: null,
        error: 'Evento non valido.'
      };
    }

    if (!lookup.trim()) {
      return {
        state: null,
        error: 'Inserisci email o user id del partecipante.'
      };
    }

    try {
      const state = await appwriteService.addMainEventParticipantAsAdmin(eventId, lookup, status);
      return {
        state,
        error: null
      };
    } catch (error) {
      return {
        state: null,
        error: eventAdminErrorMessage(error)
      };
    }
  }, []);

  const removeMainEventParticipantAsAdmin = useCallback(async (
    eventId: string,
    registrationId: string
  ): Promise<EventAdminActionResult> => {
    if (!IS_EVENT_ADMIN_ENABLED) {
      return {
        state: null,
        error: 'Funzione admin evento non configurata.'
      };
    }

    if (!eventId.trim() || !registrationId.trim()) {
      return {
        state: null,
        error: 'Partecipante non valido.'
      };
    }

    try {
      const state = await appwriteService.removeMainEventParticipantAsAdmin(eventId, registrationId);
      return {
        state,
        error: null
      };
    } catch (error) {
      return {
        state: null,
        error: eventAdminErrorMessage(error)
      };
    }
  }, []);

  const markNotificationRead = useCallback((notificationId: string): void => {
    const readAt = nowIso();

    setPersisted((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              readAt
            }
          : notification
      )
    }));
  }, []);

  const markAllNotificationsRead = useCallback((): void => {
    const readAt = nowIso();

    setPersisted((prev) => ({
      ...prev,
      notifications: prev.notifications.map((notification) => ({
        ...notification,
        readAt: notification.readAt ?? readAt
      }))
    }));
  }, []);

  const requestBrowserNotificationsPermission = useCallback(async (): Promise<
    NotificationPermission | 'unsupported'
  > => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    setPersisted((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        browserPushEnabled: permission === 'granted'
      }
    }));

    return permission;
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>): void => {
    setPersisted((prev) => {
      const settings = { ...prev.settings, ...patch };
      storeAccountSettings(settings, appwriteConfiguration.projectId, preferenceOwnerRef.current);
      return { ...prev, settings };
    });
  }, []);

  const setThreads = useCallback((threads: ChatThread[]): void => {
    setPersisted((prev) => ({
      ...prev,
      threads
    }));
  }, []);

  useEffect(() => {
    if (
      !hasMainEvent ||
      !currentUser ||
      (!mainEventFlags.isRegistered && !mainEventFlags.isWaiting) ||
      !isNotificationEnabledForType(persisted.settings, 'event')
    ) {
      return;
    }

    const eventId = remoteMainEventState?.eventId;
    if (!eventId) {
      return;
    }
    const eventStartsAt = Date.parse(resolvedMainEventConfig.date);
    if (Number.isNaN(eventStartsAt)) {
      return;
    }

    const reconcileReminder = () => {
      const remainingMs = eventStartsAt - Date.now();
      if (remainingMs <= 0 || remainingMs > 24 * 60 * 60 * 1000) {
        return;
      }
      const milestone = remainingMs <= 60 * 60 * 1000 ? '1h' : '24h';
      const reminderId = `event-reminder:${eventId}:${milestone}`;
      setPersisted((prev) => {
        if (prev.notifications.some((notification) => notification.id === reminderId)) {
          return prev;
        }
        const isEnglish = prev.settings.language === 'en';
        return {
          ...prev,
          notifications: [{
            id: reminderId,
            type: 'event',
            title: isEnglish ? 'Event reminder' : 'Promemoria evento',
            body: isEnglish
              ? `${resolvedMainEventConfig.title} starts ${milestone === '1h' ? 'within one hour' : 'within 24 hours'}.`
              : `${resolvedMainEventConfig.title} inizia ${milestone === '1h' ? 'entro un’ora' : 'entro 24 ore'}.`,
            createdAt: nowIso()
          }, ...prev.notifications]
        };
      });
    };

    reconcileReminder();
    const interval = window.setInterval(reconcileReminder, 60_000);
    return () => window.clearInterval(interval);
  }, [
    currentUser,
    hasMainEvent,
    mainEventFlags.isRegistered,
    mainEventFlags.isWaiting,
    persisted.settings,
    remoteMainEventState?.eventId,
    resolvedMainEventConfig.date,
    resolvedMainEventConfig.title
  ]);

  useEffect(() => {
    if (
      notificationPermission !== 'granted' ||
      !persisted.settings.browserPushEnabled ||
      typeof window === 'undefined' ||
      typeof Notification === 'undefined'
    ) {
      return;
    }

    const latestUnread = persisted.notifications.find((notification) => !notification.readAt);
    if (!latestUnread || latestUnread.id === lastBrowserNotificationRef.current) {
      return;
    }

    lastBrowserNotificationRef.current = latestUnread.id;
    const browserNotification = new Notification(latestUnread.title, {
      body: latestUnread.body
    });

    const generation = sessionInvalidationRef.current;
    browserNotification.onclick = () => {
      if (generation !== sessionInvalidationRef.current) return;
      window.focus();
      const destination = notificationDestination(latestUnread);
      if (destination) window.location.assign(destination);
      browserNotification.close();
    };
    return () => browserNotification.close();
  }, [notificationPermission, persisted.notifications, persisted.settings.browserPushEnabled]);

  const contextValue = useMemo<AppContextValue>(
    () => ({
      persisted,
      isAuthInitialized,
      authError, retrySession,
      currentUser,
      discoverProfiles,
      discoveryLoading, discoveryError, discoveryExhausted, loadMoreProfiles, openThread, loadOlderMessages, retryMessage, cancelMessage,
      mainEventConfig: resolvedMainEventConfig,
      mainEventInfo: resolvedMainEventInfo,
      hasMainEvent,
      isEventAdmin,
      isEventAdminEnabled: IS_EVENT_ADMIN_ENABLED,
      mainEventSnapshot,
      mainEventFlags,
      currentUserUpcomingEventHistory,
      unreadNotificationsCount,
      unreadThreadsCount,
      notificationPermission,
      signUp,
      logIn,
      logOut,
      updateProfileImage,
      updateProfileImages,
      updateProfile,
      updateAccountPreferences,
      willUserLoseEventRegistrations,
      registerCurrentUserForMainEvent,
      cancelCurrentUserMainEventRegistration,
      sendMessage,
      markThreadRead,
      setThreadNotifications,
      deleteThread,
      applyRelationshipAction,
      submitSwipeDecision,
      fetchMainEventAdminState,
      updateMainEventAsAdmin,
      addMainEventParticipantAsAdmin,
      removeMainEventParticipantAsAdmin,
      markNotificationRead,
      markAllNotificationsRead,
      requestBrowserNotificationsPermission,
      updateSettings,
      setThreads
    }),
    [
      persisted,
      isAuthInitialized,
      authError, retrySession,
      currentUser,
      discoverProfiles,
      discoveryLoading, discoveryError, discoveryExhausted, loadMoreProfiles, openThread, loadOlderMessages, retryMessage, cancelMessage,
      resolvedMainEventConfig,
      resolvedMainEventInfo,
      hasMainEvent,
      isEventAdmin,
      mainEventSnapshot,
      mainEventFlags,
      currentUserUpcomingEventHistory,
      unreadNotificationsCount,
      unreadThreadsCount,
      notificationPermission,
      signUp,
      logIn,
      logOut,
      updateProfileImage,
      updateProfileImages,
      updateProfile,
      updateAccountPreferences,
      willUserLoseEventRegistrations,
      registerCurrentUserForMainEvent,
      cancelCurrentUserMainEventRegistration,
      sendMessage,
      markThreadRead,
      setThreadNotifications,
      deleteThread,
      applyRelationshipAction,
      submitSwipeDecision,
      fetchMainEventAdminState,
      updateMainEventAsAdmin,
      addMainEventParticipantAsAdmin,
      removeMainEventParticipantAsAdmin,
      markNotificationRead,
      markAllNotificationsRead,
      requestBrowserNotificationsPermission,
      updateSettings,
      setThreads
    ]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

export function useAppStoreContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppStore must be used inside AppProvider');
  }
  return context;
}
