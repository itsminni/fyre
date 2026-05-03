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
  LocalUserSummary,
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
  inferShowMeFromPreferredGenders,
  calculateAge,
  createEmptyUser,
  getDisplayName,
  isProfileComplete,
  isValidEmail,
  normalizeUser,
  normalizeEmail
} from '../types/models';
import { backendApi as mockBackendApi } from '../services/mockBackend';
import {
  createDefaultPersistedState,
  loadPersistedState,
  persistState
} from '../services/persistence';
import {
  cancelMainEventRegistration,
  getFlags,
  getSnapshot,
  registerForMainEvent,
  removeUserFromMainEvent,
  willLoseMainEventRegistrations
} from '../services/eventEngine';
import { formatTime } from '../data/mockData';
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
type ParticipantBucket = 'participants' | 'waitingList';
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
  isBackendMode: boolean;
  currentUser: User | null;
  localUsers: LocalUserSummary[];
  discoverProfiles: DiscoverProfile[];
  mainEventConfig: MainEventConfig;
  mainEventInfo: MainEventInfo;
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
  createLocalUser(email: string, password: string): string | null;
  logIn(email: string, password: string): Promise<string | null>;
  logOut(): Promise<void>;
  switchLocalUser(email: string): string | null;
  removeLocalUser(email: string): string | null;
  seedDemoUsers(): number;
  resetLocalData(): void;
  updateProfileImage(imageData: string): Promise<string | null>;
  updateProfileImages(imageDataItems: string[]): Promise<string | null>;
  updateProfile(input: ProfileUpdateInput): Promise<string | null>;
  updateAccountPreferences(input: {
    orientation: UserOrientation;
    showMe: User['showMe'];
    preferredGenders: UserGender[];
    smokes: boolean;
    drinks: boolean;
    excludeSmokers: boolean;
    excludeDrinkers: boolean;
    bio: string;
    ageRangeMin: number;
    ageRangeMax: number;
    maxDistanceKm?: number;
    intent: MatchIntent;
    hobbies: string;
    passions: string;
    lookingFor: string;
    instagram: string;
    instagramTag: string;
    telegram: string;
    spotifyTag: string;
    website: string;
    favoriteSong: string;
    favoriteMovie: string;
  }): Promise<string | null>;
  willUserLoseEventRegistrations(nextGender: UserGender, nextOrientation: UserOrientation): boolean;
  registerCurrentUserForMainEvent(): Promise<EventFeedback>;
  cancelCurrentUserMainEventRegistration(): Promise<EventFeedback>;
  updateMainEventConfig(patch: Partial<MainEventConfig>): string | null;
  updateMainEventInfo(patch: Partial<MainEventInfo>): void;
  adminAddMainEventParticipant(
    email: string,
    gender: UserGender,
    destination: ParticipantBucket
  ): string | null;
  adminRemoveMainEventParticipant(email: string, destination: ParticipantBucket): string | null;
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
  'events.error.orientationUnsupported': 'Per questo evento e richiesto orientamento straight.',
  'events.error.notRegistered': 'Nessuna iscrizione evento trovata.',
  'events.error.registrationClosed': 'Le iscrizioni per questo evento sono chiuse.',
  'events.error.cancellationClosed': 'La finestra per la disdetta e terminata.',
  'events.error.alreadyRegistered': 'Sei già registrato a questo evento.',
  'events.error.alreadyWaitlisted': 'Sei già in waiting list.',
  'events.error.capacityFull': 'L evento e al completo.',
  'events.error.requestFailed': 'Operazione evento non riuscita. Riprova.'
};

const DEMO_USERS: User[] = [
  {
    email: 'giulia.demo@fyre.local',
    password: 'DEMO_PASSWORD_REDACTED',
    firstName: 'Giulia',
    lastName: 'Rossi',
    city: 'Reggio Emilia',
    cityLat: 44.6983,
    cityLng: 10.6318,
    birthDate: '1998-05-22',
    gender: 'female',
    orientation: 'straight',
    showMe: 'men',
    smokes: false,
    drinks: true,
    bio: 'Amo concerti, viaggi brevi e persone genuine.',
    ageRangeMin: 24,
    ageRangeMax: 38,
    maxDistanceKm: 45,
    intent: 'relationship',
    hobbies: 'Concerti e viaggi brevi',
    passions: 'Arte contemporanea',
    lookingFor: 'Connessioni autentiche',
    instagram: 'giulia.fyre',
    telegram: 'giuliafyre',
    website: '',
    favoriteSong: 'Dancing Queen',
    favoriteMovie: 'La La Land'
  },
  {
    email: 'marco.demo@fyre.local',
    password: 'DEMO_PASSWORD_REDACTED',
    firstName: 'Marco',
    lastName: 'Bianchi',
    city: 'Parma',
    cityLat: 44.8015,
    cityLng: 10.3279,
    birthDate: '1995-09-03',
    gender: 'male',
    orientation: 'straight',
    showMe: 'women',
    smokes: false,
    drinks: true,
    bio: 'Sport, cocktail bar e road trip spontanei.',
    ageRangeMin: 23,
    ageRangeMax: 36,
    maxDistanceKm: 60,
    intent: 'casual',
    hobbies: 'Sport e trekking',
    passions: 'Musica live',
    lookingFor: 'Nuove conoscenze',
    instagram: 'marco.ontheroad',
    telegram: '',
    website: '',
    favoriteSong: 'Lose Yourself',
    favoriteMovie: 'Inception'
  },
  {
    email: 'sara.demo@fyre.local',
    password: 'DEMO_PASSWORD_REDACTED',
    firstName: 'Sara',
    lastName: 'Neri',
    city: 'Modena',
    cityLat: 44.6471,
    cityLng: 10.9252,
    birthDate: '1996-12-14',
    gender: 'female',
    orientation: 'bisexual',
    showMe: 'everyone',
    smokes: false,
    drinks: false,
    bio: 'Fotografia, yoga e chiacchiere profonde.',
    ageRangeMin: 24,
    ageRangeMax: 42,
    maxDistanceKm: 70,
    intent: 'friendship',
    hobbies: 'Fotografia e yoga',
    passions: 'Cinema e podcast',
    lookingFor: 'Persone affini',
    instagram: '',
    telegram: 'saraflow',
    website: '',
    favoriteSong: 'Halo',
    favoriteMovie: 'Arrival'
  }
];

const appwriteConfiguration = loadAppwriteConfiguration();
const appwriteService = appwriteConfiguration ? new AppwriteService(appwriteConfiguration) : null;
const IS_BACKEND_MODE = appwriteService !== null;
const IS_EVENT_ADMIN_ENABLED = IS_BACKEND_MODE && Boolean(appwriteConfiguration?.eventAdminFunctionId);

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
    ...normalizedUser,
    password: normalizedUser.password || nextUsers[existingIndex].password
  });
  return nextUsers;
}

function mapAppwriteError(error: unknown, fallbackMessage: string): string {
  if (error instanceof AppwriteServiceError) {
    const normalizedType = error.type?.toLowerCase() ?? '';
    const normalizedMessage = error.message.toLowerCase();
    const statusCode = error.statusCode;

    if (statusCode === 401) {
      return 'Credenziali non valide o sessione scaduta.';
    }

    if (
      statusCode === 409 ||
      normalizedType.includes('already') ||
      normalizedMessage.includes('already exists')
    ) {
      return 'Esiste già un account con questa email.';
    }

    if (
      normalizedType.includes('password') ||
      normalizedMessage.includes('password')
    ) {
      return 'La password deve contenere almeno 8 caratteri.';
    }

    if (
      normalizedType.includes('email') ||
      normalizedMessage.includes('email')
    ) {
      return 'Inserisci un indirizzo email valido.';
    }

    if (statusCode === 429) {
      return 'Troppe richieste in poco tempo. Riprova tra qualche minuto.';
    }

    if (statusCode === 400) {
      return 'Controlla i dati inseriti e riprova.';
    }

    if (statusCode !== null && statusCode >= 500) {
      return 'Il server non è disponibile adesso. Riprova tra poco.';
    }
  }

  if (error instanceof TypeError) {
    return 'Impossibile raggiungere il server. Controlla la connessione e riprova.';
  }

  return fallbackMessage;
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

function formatLastSeen(dateIso: string | undefined): string {
  if (!dateIso) {
    return 'Ultimo accesso non disponibile';
  }

  const timestamp = new Date(dateIso).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Ultimo accesso non disponibile';
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes <= 1) {
    return 'Attivo poco fa';
  }
  if (diffMinutes < 60) {
    return `Attivo ${diffMinutes} min fa`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Attivo ${diffHours} h fa`;
  }

  return `Attivo il ${new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))}`;
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
  return value.trim().replace(/^@+/, '').replace(/\s+/g, '');
}

function normalizeMaxDistanceKm(value: number | undefined): number | undefined {
  if (value == null || value <= 0) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(Math.floor(value), 5);
}

function shouldPreferCachedThread(cachedThread: ChatThread, fetchedThread: ChatThread): boolean {
  const cachedLastMessage = cachedThread.messages[cachedThread.messages.length - 1];
  const fetchedLastMessage = fetchedThread.messages[fetchedThread.messages.length - 1];
  const cachedLastMessageAt = Date.parse(cachedLastMessage?.createdAt ?? '');
  const fetchedLastMessageAt = Date.parse(fetchedLastMessage?.createdAt ?? '');
  const cachedTimestamp = Number.isNaN(cachedLastMessageAt) ? 0 : cachedLastMessageAt;
  const fetchedTimestamp = Number.isNaN(fetchedLastMessageAt) ? 0 : fetchedLastMessageAt;

  if (cachedTimestamp > fetchedTimestamp) {
    return true;
  }

  return cachedThread.messages.length > fetchedThread.messages.length
    && cachedTimestamp === fetchedTimestamp;
}

function mergeChatThreads(fetchedThreads: ChatThread[], cachedThreads: ChatThread[]): ChatThread[] {
  const merged = [...fetchedThreads];
  const fetchedThreadIds = new Set(fetchedThreads.map((thread) => thread.id));

  for (const cachedThread of cachedThreads) {
    const existingIndex = merged.findIndex((thread) => thread.id === cachedThread.id);
    if (existingIndex >= 0) {
      if (shouldPreferCachedThread(cachedThread, merged[existingIndex])) {
        merged[existingIndex] = cachedThread;
      }
    } else if (!fetchedThreadIds.has(cachedThread.id)) {
      merged.unshift(cachedThread);
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

function createHistoryEntry(
  email: string,
  status: EventHistoryItem['status'],
  config: MainEventConfig
): EventHistoryItem {
  return {
    id: crypto.randomUUID(),
    email,
    eventTitle: config.title,
    eventDate: config.date,
    status,
    timestamp: nowIso()
  };
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [persisted, setPersisted] = useState<PersistedAppState>(() => {
    const initialState = loadPersistedState();
    if (!IS_BACKEND_MODE) {
      return initialState;
    }

    return {
      ...initialState,
      threads: [],
      notifications: []
    };
  });
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

  const pendingTimeoutsRef = useRef<number[]>([]);
  const lastBrowserNotificationRef = useRef<string | null>(null);

  useEffect(() => {
    persistState(persisted);
  }, [persisted]);

  useEffect(
    () => () => {
      pendingTimeoutsRef.current.forEach((timer) => window.clearTimeout(timer));
      pendingTimeoutsRef.current = [];
    },
    []
  );

  const mainEventConfig = persisted.mainEventConfig;
  const mainEventInfo = persisted.mainEventInfo;
  const currentUser = useMemo(() => {
    if (!persisted.currentUserEmail) {
      return null;
    }

    return (
      persisted.users.find((candidate) => candidate.email === persisted.currentUserEmail) ?? null
    );
  }, [persisted.currentUserEmail, persisted.users]);

  const refreshRemoteMainEventState = useCallback(async (user: User | null): Promise<EventRemoteState | null> => {
    if (!IS_BACKEND_MODE || !appwriteService) {
      setRemoteMainEventState(null);
      return null;
    }

    try {
      const nextState = await appwriteService.fetchMainEventState(user);
      setRemoteMainEventState(nextState);
      return nextState;
    } catch {
      setRemoteMainEventState(null);
      return null;
    }
  }, []);

  const refreshThreads = useCallback(async (): Promise<void> => {
    if (!IS_BACKEND_MODE || !appwriteService) {
      return;
    }

    try {
      const threads = await appwriteService.fetchThreads();
      setPersisted((prev) => ({
        ...prev,
        threads: mergeChatThreads(threads, prev.threads),
        realtimeState: 'connected'
      }));
    } catch {
      setPersisted((prev) => ({
        ...prev,
        realtimeState: 'disconnected'
      }));
    }
  }, [appwriteService]);

  const commitCurrentUser = useCallback((user: User | null): void => {
    setPersisted((prev) => {
      if (!user) {
        return {
          ...prev,
          currentUserEmail: null,
          threads: IS_BACKEND_MODE ? [] : prev.threads,
          notifications: IS_BACKEND_MODE ? [] : prev.notifications
        };
      }

      const normalizedUser = normalizeUser(user);

      return {
        ...prev,
        users: upsertUser(prev.users, normalizedUser),
        currentUserEmail: normalizedUser.email
      };
    });
  }, []);

  useEffect(() => {
    if (!IS_BACKEND_MODE || !appwriteService) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const restoredUser = await appwriteService.restoreCurrentUser();
        if (!isCancelled) {
          commitCurrentUser(restoredUser);
          await refreshRemoteMainEventState(restoredUser);
        }
      } catch {
        if (!isCancelled) {
          commitCurrentUser(null);
          setRemoteMainEventState(null);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [commitCurrentUser, refreshRemoteMainEventState]);

  useEffect(() => {
    if (!IS_BACKEND_MODE || !appwriteService || !currentUser) {
      return;
    }

    let isStopped = false;

    const markOnline = () => {
      if (!isStopped) {
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
  }, [currentUser?.appwriteUserId, currentUser?.email]);

  useEffect(() => {
    if (!IS_BACKEND_MODE) {
      setRemoteMainEventState(null);
      return;
    }

    void refreshRemoteMainEventState(currentUser);
  }, [currentUser, refreshRemoteMainEventState]);

  const hydrateDiscoverProfiles = useCallback(async (): Promise<void> => {
    if (IS_BACKEND_MODE && appwriteService) {
      try {
        const profiles = await appwriteService.fetchDiscoverProfiles();
        setDiscoverProfiles(profiles);
        return;
      } catch {
        setDiscoverProfiles([]);
        return;
      }
    }

    const profiles = await mockBackendApi.fetchDiscoverProfiles();
    setDiscoverProfiles(profiles);
  }, []);

  const hydrateThreads = useCallback(async (): Promise<void> => {
    if (IS_BACKEND_MODE && appwriteService) {
      await refreshThreads();
      return;
    }

    setPersisted((prev) => ({
      ...prev,
      threads: []
    }));
  }, [refreshThreads]);

  useEffect(() => {
    void hydrateDiscoverProfiles();
    void hydrateThreads();
  }, [persisted.currentUserEmail, hydrateDiscoverProfiles, hydrateThreads]);

  const discoveryProfileRefreshKey = useMemo(() => {
    if (!currentUser || !isProfileComplete(currentUser)) {
      return '';
    }

    return [
      currentUser.appwriteUserId ?? currentUser.email,
      currentUser.gender,
      currentUser.orientation,
      currentUser.showMe,
      (currentUser.preferredGenders ?? []).join(','),
      currentUser.ageRangeMin,
      currentUser.ageRangeMax,
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

    void hydrateDiscoverProfiles();
  }, [discoveryProfileRefreshKey, hydrateDiscoverProfiles]);

  useEffect(() => {
    if (!IS_BACKEND_MODE || !appwriteService || !currentUser?.appwriteUserId) {
      return;
    }

    let isStopped = false;
    let pendingRefresh: number | null = null;
    let refreshInFlight = false;
    let fallbackRefresh: number | null = null;

    const scheduleRefresh = () => {
      if (isStopped || pendingRefresh !== null) {
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
      fallbackRefresh = window.setInterval(scheduleRefresh, 8_000);
    } catch {
      setPersisted((prev) => ({
        ...prev,
        realtimeState: 'disconnected'
      }));
      fallbackRefresh = window.setInterval(scheduleRefresh, 8_000);
      scheduleRefresh();
    }

    return () => {
      isStopped = true;
      if (pendingRefresh !== null) {
        window.clearTimeout(pendingRefresh);
      }
      if (fallbackRefresh !== null) {
        window.clearInterval(fallbackRefresh);
      }
      unsubscribe();
    };
  }, [appwriteService, currentUser?.appwriteUserId, refreshThreads]);

  const isEventAdmin = useMemo(() => {
    if (!currentUser) {
      return false;
    }

    return currentUser.email === 'admin@fyre.local' || currentUser.email.endsWith('.demo@fyre.local');
  }, [currentUser]);

  const localUsers = useMemo<LocalUserSummary[]>(
    () =>
      persisted.users
        .map((user) => ({
          email: user.email,
          displayName: getDisplayName(user),
          isProfileComplete: isProfileComplete(user),
          isCurrent: user.email === persisted.currentUserEmail
        }))
        .sort((left, right) => left.email.localeCompare(right.email)),
    [persisted.currentUserEmail, persisted.users]
  );

  const resolvedMainEventConfig = useMemo<MainEventConfig>(() => {
    if (!IS_BACKEND_MODE || !remoteMainEventState) {
      return mainEventConfig;
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
  }, [mainEventConfig, remoteMainEventState]);

  const mainEventSnapshot = useMemo(
    () => remoteMainEventState?.snapshot ?? getSnapshot(persisted.mainEventState, resolvedMainEventConfig),
    [persisted.mainEventState, remoteMainEventState, resolvedMainEventConfig]
  );

  const mainEventFlags = useMemo(() => {
    if (IS_BACKEND_MODE) {
      return {
        isRegistered: remoteMainEventState?.currentStatus === 'confirmed' || remoteMainEventState?.currentStatus === 'promoted',
        isWaiting: remoteMainEventState?.currentStatus === 'waitlisted'
      };
    }

    return getFlags(persisted.mainEventState, currentUser?.email ?? null);
  }, [currentUser?.email, persisted.mainEventState, remoteMainEventState]);

  const currentUserUpcomingEventHistory = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const now = Date.now();
    const sourceHistory = IS_BACKEND_MODE && remoteMainEventState
      ? remoteMainEventState.history
      : persisted.mainEventState.history;

    return sourceHistory
      .filter((item) => item.email === currentUser.email && new Date(item.eventDate).getTime() >= now)
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );
  }, [currentUser, persisted.mainEventState.history, remoteMainEventState]);

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

  const withCurrentUser = useCallback(
    (callback: (user: User) => User): void => {
      setPersisted((prev) => {
        if (!prev.currentUserEmail) {
          return prev;
        }

        const userIndex = prev.users.findIndex((candidate) => candidate.email === prev.currentUserEmail);
        if (userIndex < 0) {
          return {
            ...prev,
            currentUserEmail: null
          };
        }

        const updatedUser = normalizeUser(callback(prev.users[userIndex]));
        const updatedUsers = [...prev.users];
        updatedUsers[userIndex] = updatedUser;

        return {
          ...prev,
          users: updatedUsers
        };
      });
    },
    []
  );

  const pushNotification = useCallback(
    (payload: Omit<AppNotification, 'id' | 'createdAt' | 'readAt'>): void => {
      if (!isNotificationEnabledForType(persisted.settings, payload.type)) {
        return;
      }

      setPersisted((prev) => ({
        ...prev,
        notifications: [
          {
            id: crypto.randomUUID(),
            type: payload.type,
            title: payload.title,
            body: payload.body,
            threadId: payload.threadId,
            createdAt: nowIso()
          },
          ...prev.notifications
        ].slice(0, 180)
      }));
    },
    [persisted.settings]
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

      if (IS_BACKEND_MODE && appwriteService) {
        try {
          const user = await appwriteService.signUp(normalized, password);
          commitCurrentUser(user);
          return null;
        } catch (error) {
          return mapAppwriteError(error, 'Registrazione non riuscita. Riprova.');
        }
      }

      const alreadyExists = persisted.users.some((candidate) => candidate.email === normalized);
      if (alreadyExists) {
        return 'Esiste già un account con questa email.';
      }

      const nextUser = createEmptyUser(normalized, password);

      setPersisted((prev) => ({
        ...prev,
        users: [...prev.users, nextUser],
        currentUserEmail: nextUser.email
      }));

      return null;
    },
    [commitCurrentUser, persisted.users]
  );

  const createLocalUser = useCallback(
    (email: string, password: string): string | null => {
      if (!isValidEmail(email)) {
        return 'Inserisci un indirizzo email valido.';
      }

      if (password.length < 8) {
        return 'La password deve contenere almeno 8 caratteri.';
      }

      const normalized = normalizeEmail(email);
      const alreadyExists = persisted.users.some((candidate) => candidate.email === normalized);
      if (alreadyExists) {
        return 'Esiste già un account con questa email.';
      }

      const nextUser = createEmptyUser(normalized, password);

      setPersisted((prev) => ({
        ...prev,
        users: [...prev.users, nextUser]
      }));

      return null;
    },
    [persisted.users]
  );

  const logIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!isValidEmail(email)) {
        return 'Inserisci un indirizzo email valido.';
      }

      const normalized = normalizeEmail(email);

      if (IS_BACKEND_MODE && appwriteService) {
        try {
          const user = await appwriteService.logIn(normalized, password);
          commitCurrentUser(user);
          return null;
        } catch (error) {
          return mapAppwriteError(error, 'Accesso non riuscito. Riprova.');
        }
      }

      const account = persisted.users.find((candidate) => candidate.email === normalized);

      if (!account) {
        return 'Nessun account trovato con questa email.';
      }

      if (account.password !== password) {
        return 'Password errata.';
      }

      setPersisted((prev) => ({
        ...prev,
        currentUserEmail: normalized
      }));

      return null;
    },
    [commitCurrentUser, persisted.users]
  );

  const logOut = useCallback(async (): Promise<void> => {
    if (IS_BACKEND_MODE && appwriteService) {
      try {
        await appwriteService.logOut();
      } catch {
        // Clear the local session state even if the backend logout call fails.
      }
    }

    commitCurrentUser(null);
    setDiscoverProfiles([]);
    setPersisted((prev) => ({
      ...prev,
      realtimeState: 'disconnected'
    }));
  }, [commitCurrentUser]);

  const switchLocalUser = useCallback(
    (email: string): string | null => {
      const normalized = normalizeEmail(email);
      const exists = persisted.users.some((candidate) => candidate.email === normalized);

      if (!exists) {
        return 'Utente non trovato nella memoria locale.';
      }

      setPersisted((prev) => ({
        ...prev,
        currentUserEmail: normalized
      }));

      return null;
    },
    [persisted.users]
  );

  const removeLocalUser = useCallback(
    (email: string): string | null => {
      const normalized = normalizeEmail(email);
      const exists = persisted.users.some((candidate) => candidate.email === normalized);

      if (!exists) {
        return 'Utente non trovato nella memoria locale.';
      }

      setPersisted((prev) => {
        const users = prev.users.filter((candidate) => candidate.email !== normalized);
        const nextCurrentUserEmail =
          prev.currentUserEmail === normalized ? users[0]?.email ?? null : prev.currentUserEmail;

        return {
          ...prev,
          users,
          currentUserEmail: nextCurrentUserEmail,
          mainEventState: {
            participants: prev.mainEventState.participants.filter((item) => item.email !== normalized),
            waitingList: prev.mainEventState.waitingList.filter((item) => item.email !== normalized),
            history: prev.mainEventState.history.filter((item) => item.email !== normalized)
          }
        };
      });

      return null;
    },
    [persisted.users]
  );

  const seedDemoUsers = useCallback((): number => {
    const existingEmails = new Set(persisted.users.map((user) => user.email));
    const usersToAdd = DEMO_USERS.map((user) => normalizeUser(user)).filter(
      (user) => !existingEmails.has(user.email)
    );

    if (usersToAdd.length === 0) {
      return 0;
    }

    setPersisted((prev) => ({
      ...prev,
      users: [...prev.users, ...usersToAdd]
    }));

    return usersToAdd.length;
  }, [persisted.users]);

  const resetLocalData = useCallback(() => {
    setPersisted(createDefaultPersistedState());
  }, []);

  const updateProfileImage = useCallback(
    async (imageData: string): Promise<string | null> => {
      if (!currentUser) {
        return 'Effettua di nuovo l\'accesso.';
      }

      if (IS_BACKEND_MODE && appwriteService) {
        try {
          const updatedUser = await appwriteService.updateProfileImage(currentUser, imageData);
          commitCurrentUser(updatedUser);
          return null;
        } catch (error) {
          return mapAppwriteError(error, 'Impossibile aggiornare la foto profilo.');
        }
      }

      withCurrentUser((existing) => ({
        ...normalizeUser(existing),
        profileImageData: imageData.trim().length > 0 ? imageData : undefined,
        avatarFileId: imageData.trim().length > 0 ? existing.avatarFileId : undefined
      }));

      return null;
    },
    [commitCurrentUser, currentUser, withCurrentUser]
  );

  const updateProfileImages = useCallback(
    async (imageDataItems: string[]): Promise<string | null> => {
      if (!currentUser) {
        return 'Effettua di nuovo l\'accesso.';
      }

      const sanitizedImages = imageDataItems
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .slice(0, 6);

      withCurrentUser((existing) => ({
        ...normalizeUser(existing),
        profilePhotoDataItems: sanitizedImages,
        photoFileIds: sanitizedImages.length === 0
          ? []
          : (existing.photoFileIds ?? []).filter((fileId) =>
              sanitizedImages.some((image) => image.includes(fileId))
            )
      }));

      return null;
    },
    [currentUser, withCurrentUser]
  );

  const willUserLoseEventRegistrations = useCallback(
    (nextGender: UserGender, nextOrientation: UserOrientation): boolean => {
      if (IS_BACKEND_MODE) {
        if (!hasRemoteMainEventRegistration) {
          return false;
        }

        const isGenderSupported = nextGender === 'male' || nextGender === 'female';
        return !isGenderSupported || nextOrientation !== 'straight';
      }

      return willLoseMainEventRegistrations(
        persisted.mainEventState,
        currentUser,
        nextGender,
        nextOrientation
      );
    },
    [currentUser, hasRemoteMainEventRegistration, persisted.mainEventState]
  );

  const enforceRemoteMainEventEligibilityAfterProfileChange = useCallback(
    async (shouldRemoveRegistration: boolean, user: User): Promise<string | null> => {
      if (!IS_BACKEND_MODE || !appwriteService) {
        return null;
      }

      if (shouldRemoveRegistration) {
        try {
          await appwriteService.cancelMainEventRegistration(user, remoteMainEventState?.eventId, true);
        } catch {
          // Refresh below decides whether the forced cancellation actually applied.
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

      if (input.ageRangeMin < 18 || input.ageRangeMax <= input.ageRangeMin) {
        return 'La fascia d\'età non è valida.';
      }

      const normalizedMaxDistanceKm = normalizeMaxDistanceKm(input.maxDistanceKm);

      const preferredGenders = normalizePreferredGenders(input.preferredGenders);
      if (preferredGenders.length === 0) {
        return 'Seleziona almeno una preferenza di genere.';
      }

      const shouldRemoveMainEvent = willLoseMainEventRegistrations(
        persisted.mainEventState,
        currentUser,
        input.gender,
        input.orientation
      );

      const updatedUser = normalizeUser({
        ...currentUser,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        city: input.city.trim(),
        cityLat: input.cityLat,
        cityLng: input.cityLng,
        birthDate: input.birthDate,
        gender: input.gender,
        orientation: input.orientation,
        showMe: inferShowMeFromPreferredGenders(preferredGenders, input.showMe),
        preferredGenders,
        smokes: input.smokes,
        drinks: input.drinks,
        excludeSmokers: input.excludeSmokers,
        excludeDrinkers: input.excludeDrinkers,
        bio: input.bio.trim(),
        ageRangeMin: input.ageRangeMin,
        ageRangeMax: input.ageRangeMax,
        maxDistanceKm: normalizedMaxDistanceKm,
        intent: input.intent,
        hobbies: input.hobbies.trim(),
        passions: '',
        lookingFor: '',
        instagram: input.instagram.trim(),
        instagramTag: normalizeSocialHandle(input.instagramTag),
        telegram: input.telegram.trim(),
        spotifyTag: normalizeSocialHandle(input.spotifyTag),
        website: input.website.trim(),
        favoriteSong: '',
        favoriteMovie: ''
      });

      if (IS_BACKEND_MODE && appwriteService) {
        try {
          const savedUser = await appwriteService.updateProfile(updatedUser);
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
          return mapAppwriteError(error, 'Impossibile salvare il profilo adesso. Riprova.');
        }
      }

      setPersisted((prev) => {
        if (!prev.currentUserEmail) {
          return prev;
        }

        const userIndex = prev.users.findIndex((candidate) => candidate.email === prev.currentUserEmail);
        if (userIndex < 0) {
          return prev;
        }

        const users = [...prev.users];
        users[userIndex] = updatedUser;

        return {
          ...prev,
          users,
          mainEventState: shouldRemoveMainEvent
            ? removeUserFromMainEvent(prev.mainEventState, updatedUser.email, prev.mainEventConfig)
            : prev.mainEventState
        };
      });

      return null;
    },
    [commitCurrentUser, currentUser, enforceRemoteMainEventEligibilityAfterProfileChange, persisted.mainEventState]
  );

  const updateAccountPreferences = useCallback(
    async (input: {
      orientation: UserOrientation;
      showMe: User['showMe'];
      preferredGenders: UserGender[];
      smokes: boolean;
      drinks: boolean;
      excludeSmokers: boolean;
      excludeDrinkers: boolean;
      bio: string;
      ageRangeMin: number;
      ageRangeMax: number;
      maxDistanceKm?: number;
      intent: MatchIntent;
      hobbies: string;
      passions: string;
      lookingFor: string;
      instagram: string;
      instagramTag: string;
      telegram: string;
      spotifyTag: string;
      website: string;
      favoriteSong: string;
      favoriteMovie: string;
    }): Promise<string | null> => {
      if (!currentUser) {
        return 'Effettua di nuovo l\'accesso.';
      }

      if (input.ageRangeMin < 18 || input.ageRangeMax <= input.ageRangeMin) {
        return 'Fascia d\'età non valida.';
      }

      const normalizedMaxDistanceKm = normalizeMaxDistanceKm(input.maxDistanceKm);

      const preferredGenders = normalizePreferredGenders(input.preferredGenders);
      if (preferredGenders.length === 0) {
        return 'Seleziona almeno una preferenza di genere.';
      }

      const shouldRemoveMainEvent = willLoseMainEventRegistrations(
        persisted.mainEventState,
        currentUser,
        currentUser.gender,
        input.orientation
      );

      const updatedUser = normalizeUser({
        ...currentUser,
        orientation: input.orientation,
        showMe: inferShowMeFromPreferredGenders(preferredGenders, input.showMe),
        preferredGenders,
        smokes: input.smokes,
        drinks: input.drinks,
        excludeSmokers: input.excludeSmokers,
        excludeDrinkers: input.excludeDrinkers,
        bio: input.bio.trim(),
        ageRangeMin: input.ageRangeMin,
        ageRangeMax: input.ageRangeMax,
        maxDistanceKm: normalizedMaxDistanceKm,
        intent: input.intent,
        hobbies: input.hobbies.trim(),
        passions: '',
        lookingFor: '',
        instagram: input.instagram.trim(),
        instagramTag: normalizeSocialHandle(input.instagramTag),
        telegram: input.telegram.trim(),
        spotifyTag: normalizeSocialHandle(input.spotifyTag),
        website: input.website.trim(),
        favoriteSong: '',
        favoriteMovie: ''
      });

      if (IS_BACKEND_MODE && appwriteService) {
        try {
          const savedUser = await appwriteService.updateProfile(updatedUser);
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
          return mapAppwriteError(error, 'Aggiornamento preferenze non riuscito. Riprova.');
        }
      }

      withCurrentUser(() => updatedUser);

      if (shouldRemoveMainEvent) {
        setPersisted((prev) => {
          if (!prev.currentUserEmail) {
            return prev;
          }
          return {
            ...prev,
            mainEventState: removeUserFromMainEvent(
              prev.mainEventState,
              prev.currentUserEmail,
              prev.mainEventConfig
            )
          };
        });
      }

      return null;
    },
    [
      commitCurrentUser,
      currentUser,
      enforceRemoteMainEventEligibilityAfterProfileChange,
      persisted.mainEventState,
      withCurrentUser
    ]
  );

  const registerCurrentUserForMainEvent = useCallback(async (): Promise<EventFeedback> => {
    if (IS_BACKEND_MODE && appwriteService) {
      if (!currentUser) {
        return {
          message: 'Effettua di nuovo l accesso.',
          isError: true
        };
      }

      const hadRegistrationBeforeRequest = hasRemoteMainEventRegistration;

      try {
        const status = await appwriteService.registerForMainEvent(currentUser, remoteMainEventState?.eventId);
        const nextState = await refreshRemoteMainEventState(currentUser);
        const resolvedStatus = nextState?.currentStatus ?? status;

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
    }

    const result = registerForMainEvent(
      persisted.mainEventState,
      currentUser,
      persisted.mainEventConfig
    );

    if (result.nextState !== persisted.mainEventState) {
      setPersisted((prev) => ({
        ...prev,
        mainEventState: result.nextState
      }));
    }

    return {
      message: result.message,
      isError: result.isError
    };
  }, [
    currentUser,
    hasRemoteMainEventRegistration,
    persisted.mainEventConfig,
    persisted.mainEventState,
    refreshRemoteMainEventState,
    remoteMainEventState?.eventId
  ]);

  const cancelCurrentUserMainEventRegistration = useCallback(async (): Promise<EventFeedback> => {
    if (IS_BACKEND_MODE && appwriteService) {
      if (!currentUser) {
        return {
          message: 'Effettua di nuovo l accesso.',
          isError: true
        };
      }

      const hadRegistrationBeforeRequest = hasRemoteMainEventRegistration;

      try {
        await appwriteService.cancelMainEventRegistration(currentUser, remoteMainEventState?.eventId);
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
    }

    const result = cancelMainEventRegistration(
      persisted.mainEventState,
      currentUser,
      persisted.mainEventConfig
    );

    if (result.nextState !== persisted.mainEventState) {
      setPersisted((prev) => ({
        ...prev,
        mainEventState: result.nextState
      }));
    }

    return {
      message: result.message,
      isError: result.isError
    };
  }, [
    currentUser,
    hasRemoteMainEventRegistration,
    persisted.mainEventConfig,
    persisted.mainEventState,
    refreshRemoteMainEventState,
    remoteMainEventState?.eventId
  ]);

  const updateMainEventConfig = useCallback((patch: Partial<MainEventConfig>): string | null => {
    if (patch.maxParticipants !== undefined && patch.maxParticipants < 2) {
      return 'La capienza totale deve essere almeno 2.';
    }

    if (patch.maxPerGender !== undefined && patch.maxPerGender < 1) {
      return 'I posti per genere devono essere almeno 1.';
    }

    if (patch.date !== undefined && Number.isNaN(new Date(patch.date).getTime())) {
      return 'Data evento non valida.';
    }

    setPersisted((prev) => {
      const merged: MainEventConfig = {
        ...prev.mainEventConfig,
        ...patch
      };

      const maxParticipants = Math.max(2, Math.round(merged.maxParticipants));
      const maxPerGender = Math.max(1, Math.min(Math.round(merged.maxPerGender), maxParticipants));

      return {
        ...prev,
        mainEventConfig: {
          ...merged,
          maxParticipants,
          maxPerGender
        }
      };
    });

    return null;
  }, []);

  const updateMainEventInfo = useCallback((patch: Partial<MainEventInfo>): void => {
    setPersisted((prev) => ({
      ...prev,
      mainEventInfo: {
        ...prev.mainEventInfo,
        ...patch,
        rules: patch.rules ?? prev.mainEventInfo.rules
      }
    }));
  }, []);

  const adminAddMainEventParticipant = useCallback(
    (email: string, gender: UserGender, destination: ParticipantBucket): string | null => {
      const normalized = normalizeEmail(email);
      if (!isValidEmail(normalized)) {
        return 'Inserisci una email valida.';
      }

      if (gender !== 'male' && gender !== 'female') {
        return 'Per questo evento admin sono ammessi solo uomo/donna.';
      }

      const alreadyPresent =
        persisted.mainEventState.participants.some((item) => item.email === normalized) ||
        persisted.mainEventState.waitingList.some((item) => item.email === normalized);

      if (alreadyPresent) {
        return 'Questo utente è già presente in evento o waiting list.';
      }

      setPersisted((prev) => ({
        ...prev,
        mainEventState: {
          ...prev.mainEventState,
          participants:
            destination === 'participants'
              ? [...prev.mainEventState.participants, { email: normalized, gender }]
              : prev.mainEventState.participants,
          waitingList:
            destination === 'waitingList'
              ? [...prev.mainEventState.waitingList, { email: normalized, gender }]
              : prev.mainEventState.waitingList,
          history: [
            ...prev.mainEventState.history,
            createHistoryEntry(
              normalized,
              destination === 'participants' ? 'confirmed' : 'waitlisted',
              prev.mainEventConfig
            )
          ]
        }
      }));

      pushNotification({
        type: 'event',
        title: 'Evento aggiornato',
        body:
          destination === 'participants'
            ? `${normalized} aggiunto ai partecipanti.`
            : `${normalized} aggiunto alla waiting list.`
      });

      return null;
    },
    [persisted.mainEventState.participants, persisted.mainEventState.waitingList, pushNotification]
  );

  const adminRemoveMainEventParticipant = useCallback(
    (email: string, destination: ParticipantBucket): string | null => {
      const normalized = normalizeEmail(email);

      if (destination === 'participants') {
        const exists = persisted.mainEventState.participants.some((item) => item.email === normalized);
        if (!exists) {
          return 'Utente non presente tra i partecipanti.';
        }

        setPersisted((prev) => ({
          ...prev,
          mainEventState: removeUserFromMainEvent(prev.mainEventState, normalized, prev.mainEventConfig)
        }));
      } else {
        const exists = persisted.mainEventState.waitingList.some((item) => item.email === normalized);
        if (!exists) {
          return 'Utente non presente in waiting list.';
        }

        setPersisted((prev) => ({
          ...prev,
          mainEventState: {
            ...prev.mainEventState,
            waitingList: prev.mainEventState.waitingList.filter((item) => item.email !== normalized),
            history: [
              ...prev.mainEventState.history,
              createHistoryEntry(normalized, 'cancelled', prev.mainEventConfig)
            ]
          }
        }));
      }

      pushNotification({
        type: 'event',
        title: 'Evento aggiornato',
        body: `${normalized} rimosso da ${destination === 'participants' ? 'partecipanti' : 'waiting list'}.`
      });

      return null;
    },
    [persisted.mainEventState.participants, persisted.mainEventState.waitingList, pushNotification]
  );

  const updateMessageDeliveryState = useCallback(
    (
      threadId: string,
      messageId: string,
      patch: Partial<Pick<ChatMessage, 'deliveryState' | 'readAt'>>
    ): void => {
      setPersisted((prev) => ({
        ...prev,
        threads: prev.threads.map((thread) => {
          if (thread.id !== threadId) {
            return thread;
          }

          return {
            ...thread,
            messages: thread.messages.map((message) => {
              if (message.id !== messageId) {
                return message;
              }

              return {
                ...message,
                ...patch
              };
            })
          };
        })
      }));
    },
    []
  );

  const sendMessage = useCallback(
    (input: SendMessageInput): void => {
      const normalizedText = input.text.trim();
      const attachments = input.attachments ?? [];

      if (!normalizedText && attachments.length === 0) {
        return;
      }

      const targetThread = persisted.threads.find((thread) => thread.id === input.threadId);
      if (!targetThread) {
        return;
      }

      if (IS_BACKEND_MODE && appwriteService) {
        void (async () => {
          try {
            const pendingMessages =
              attachments.length > 0
                ? attachments.map((attachment, index) => ({
                    threadId: input.threadId,
                    text: index === 0 ? normalizedText : '',
                    replyToMessageId: index === 0 ? input.replyToMessageId : undefined,
                    attachment
                  }))
                : [
                    {
                      threadId: input.threadId,
                      text: normalizedText,
                      replyToMessageId: input.replyToMessageId
                    }
                  ];
            const sentMessages: ChatMessage[] = [];

            for (const pendingMessage of pendingMessages) {
              const message = await appwriteService.sendMessage(pendingMessage);
              sentMessages.push({
                ...message,
                senderName: currentUser ? getDisplayName(currentUser) : 'Tu'
              });
            }

            setPersisted((prev) => ({
              ...prev,
              threads: prev.threads.map((thread) => {
                if (thread.id !== input.threadId) {
                  return thread;
                }

                return {
                  ...thread,
                  unreadCount: 0,
                  messages: [...thread.messages, ...sentMessages],
                  isTyping: false
                };
              })
            }));
          } catch {
            // Leave the thread untouched when the backend rejects the message.
          }
        })();

        return;
      }

      const now = new Date();
      const messageId = crypto.randomUUID();

      setPersisted((prev) => ({
        ...prev,
        threads: prev.threads.map((thread) => {
          if (thread.id !== input.threadId) {
            return thread;
          }

          return {
            ...thread,
            messages: [
              ...thread.messages,
              {
                id: messageId,
                text: normalizedText,
                isMe: true,
                time: formatTime(now),
                createdAt: now.toISOString(),
                senderName: currentUser ? getDisplayName(currentUser) : 'Tu',
                replyToMessageId: input.replyToMessageId,
                attachments,
                deliveryState: 'sending'
              }
            ],
            isTyping: false
          };
        })
      }));

      const sentTimeout = window.setTimeout(() => {
        updateMessageDeliveryState(input.threadId, messageId, { deliveryState: 'sent' });
      }, 220);

      const deliveredTimeout = window.setTimeout(() => {
        updateMessageDeliveryState(input.threadId, messageId, { deliveryState: 'delivered' });
      }, 900);

      pendingTimeoutsRef.current.push(sentTimeout, deliveredTimeout);

      if (targetThread.isOnline) {
        const readTimeout = window.setTimeout(() => {
          updateMessageDeliveryState(input.threadId, messageId, {
            deliveryState: 'read',
            readAt: nowIso()
          });
        }, 2600);
        pendingTimeoutsRef.current.push(readTimeout);
      }
    },
    [currentUser, persisted.threads, updateMessageDeliveryState]
  );

  const markThreadRead = useCallback((threadId: string): void => {
    const readAt = nowIso();

    if (IS_BACKEND_MODE && appwriteService) {
      void appwriteService.markThreadRead(threadId).catch(() => undefined);
    }

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

      if (IS_BACKEND_MODE && appwriteService) {
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

      if (IS_BACKEND_MODE && appwriteService && appwriteConfiguration?.manageRelationshipFunctionId) {
        try {
          await appwriteService.updateRelationship(threadId, action);
        } catch {
          return 'Operazione relazione non riuscita. Riprova.';
        }
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

      if (IS_BACKEND_MODE && appwriteService) {
        const backendDecision = decision === 'right' ? 'liked' : 'passed';

        try {
          const thread = await appwriteService.submitSwipe(profile.id, profile.name, backendDecision);

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
      }

      return {
        matched: false,
        message: IS_BACKEND_MODE
          ? 'Swipe non disponibile. Riprova.'
          : 'Backend non configurato: impossibile creare chat o match.',
        recorded: false
      };
    },
    [discoverProfiles]
  );

  const fetchMainEventAdminState = useCallback(async (eventId?: string): Promise<EventAdminActionResult> => {
    if (!IS_EVENT_ADMIN_ENABLED || !appwriteService) {
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
    if (!IS_EVENT_ADMIN_ENABLED || !appwriteService) {
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
    if (!IS_EVENT_ADMIN_ENABLED || !appwriteService) {
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
    if (!IS_EVENT_ADMIN_ENABLED || !appwriteService) {
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
    setPersisted((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch
      }
    }));
  }, []);

  const setThreads = useCallback((threads: ChatThread[]): void => {
    setPersisted((prev) => ({
      ...prev,
      threads
    }));
  }, []);

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

    if (latestUnread.threadId) {
      browserNotification.onclick = () => {
        window.focus();
      };
    }
  }, [notificationPermission, persisted.notifications, persisted.settings.browserPushEnabled]);

  const contextValue = useMemo<AppContextValue>(
    () => ({
      persisted,
      isBackendMode: IS_BACKEND_MODE,
      currentUser,
      localUsers,
      discoverProfiles,
      mainEventConfig: resolvedMainEventConfig,
      mainEventInfo,
      isEventAdmin,
      isEventAdminEnabled: IS_EVENT_ADMIN_ENABLED,
      mainEventSnapshot,
      mainEventFlags,
      currentUserUpcomingEventHistory,
      unreadNotificationsCount,
      unreadThreadsCount,
      notificationPermission,
      signUp,
      createLocalUser,
      logIn,
      logOut,
      switchLocalUser,
      removeLocalUser,
      seedDemoUsers,
      resetLocalData,
      updateProfileImage,
      updateProfileImages,
      updateProfile,
      updateAccountPreferences,
      willUserLoseEventRegistrations,
      registerCurrentUserForMainEvent,
      cancelCurrentUserMainEventRegistration,
      updateMainEventConfig,
      updateMainEventInfo,
      adminAddMainEventParticipant,
      adminRemoveMainEventParticipant,
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
      currentUser,
      localUsers,
      discoverProfiles,
      resolvedMainEventConfig,
      mainEventInfo,
      isEventAdmin,
      mainEventSnapshot,
      mainEventFlags,
      currentUserUpcomingEventHistory,
      unreadNotificationsCount,
      unreadThreadsCount,
      notificationPermission,
      signUp,
      createLocalUser,
      logIn,
      logOut,
      switchLocalUser,
      removeLocalUser,
      seedDemoUsers,
      resetLocalData,
      updateProfileImage,
      updateProfileImages,
      updateProfile,
      updateAccountPreferences,
      willUserLoseEventRegistrations,
      registerCurrentUserForMainEvent,
      cancelCurrentUserMainEventRegistration,
      updateMainEventConfig,
      updateMainEventInfo,
      adminAddMainEventParticipant,
      adminRemoveMainEventParticipant,
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

export { formatLastSeen };
