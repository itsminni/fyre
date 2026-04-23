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
  getDisplayName,
  isProfileComplete,
  isValidEmail,
  normalizeEmail
} from '../types/models';
import { backendApi } from '../services/mockBackend';
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
import { AppwriteService, AppwriteServiceError } from '../services/appwriteService';

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
  signUp(email: string, password: string): string | null;
  createLocalUser(email: string, password: string): string | null;
  logIn(email: string, password: string): string | null;
  logOut(): void;
  switchLocalUser(email: string): string | null;
  removeLocalUser(email: string): string | null;
  seedDemoUsers(): number;
  resetLocalData(): void;
  updateProfileImage(imageData: string): string | null;
  updateProfile(input: ProfileUpdateInput): string | null;
  updateAccountPreferences(input: {
    orientation: UserOrientation;
    showMe: User['showMe'];
    smokes: boolean;
    drinks: boolean;
    bio: string;
    ageRangeMin: number;
    ageRangeMax: number;
    maxDistanceKm: number;
    intent: MatchIntent;
    hobbies: string;
    passions: string;
    lookingFor: string;
    instagram: string;
    telegram: string;
    website: string;
    favoriteSong: string;
    favoriteMovie: string;
  }): string | null;
  willUserLoseEventRegistrations(nextGender: UserGender, nextOrientation: UserOrientation): boolean;
  registerCurrentUserForMainEvent(): EventFeedback;
  cancelCurrentUserMainEventRegistration(): EventFeedback;
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
  deleteThread(threadId: string): void;
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
  hydrateMockDiscoverProfiles(): Promise<void>;
  hydrateMockThreadsIfMissing(): Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const INCOMING_MESSAGE_LIBRARY = [
  'Ti va un aperitivo questa settimana?',
  'Ho visto il tuo profilo, ottima energia.',
  'Ci sentiamo dopo cena?',
  'Quando sei libera/o per un caffe?',
  'Hai idee per il weekend?'
];

const POLL_NOTIFICATION_LIBRARY = [
  'Ricorda di confermare la tua disponibilita per il Main Event.',
  'Nuovi profili compatibili disponibili nella Home.',
  'Hai una chat con messaggi non letti.'
];

const EVENT_ADMIN_MESSAGE_BY_KEY: Record<string, string> = {
  'events.admin.error.forbidden': 'Non hai i permessi admin per questo evento.',
  'events.admin.error.invalidAction': 'Azione admin non valida.',
  'events.admin.error.invalidParticipant': 'Dati partecipante non validi.',
  'events.admin.error.userNotFound': 'Utente non trovato.',
  'events.error.requestFailed': 'Operazione admin non riuscita. Riprova.'
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
  const [persisted, setPersisted] = useState<PersistedAppState>(() => loadPersistedState());
  const [discoverProfiles, setDiscoverProfiles] = useState<DiscoverProfile[]>([]);
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

  const hydrateMockDiscoverProfiles = useCallback(async (): Promise<void> => {
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

    const profiles = await backendApi.fetchDiscoverProfiles();
    setDiscoverProfiles(profiles);
  }, []);

  const hydrateMockThreadsIfMissing = useCallback(async (): Promise<void> => {
    if (IS_BACKEND_MODE && appwriteService) {
      try {
        const threads = await appwriteService.fetchThreads();
        setPersisted((prev) => ({
          ...prev,
          threads
        }));
      } catch {
        // Keep local state untouched when backend thread hydration fails.
      }
      return;
    }

    if (persisted.threads.length > 0) {
      return;
    }

    const threads = await backendApi.fetchThreads();
    setPersisted((prev) => ({
      ...prev,
      threads
    }));
  }, [persisted.threads.length]);

  useEffect(() => {
    void hydrateMockDiscoverProfiles();
    void hydrateMockThreadsIfMissing();
  }, [hydrateMockDiscoverProfiles, hydrateMockThreadsIfMissing]);

  const currentUser = useMemo(() => {
    if (!persisted.currentUserEmail) {
      return null;
    }

    return (
      persisted.users.find((candidate) => candidate.email === persisted.currentUserEmail) ?? null
    );
  }, [persisted.currentUserEmail, persisted.users]);

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

  const mainEventSnapshot = useMemo(
    () => getSnapshot(persisted.mainEventState, mainEventConfig),
    [mainEventConfig, persisted.mainEventState]
  );

  const mainEventFlags = useMemo(
    () => getFlags(persisted.mainEventState, currentUser?.email ?? null),
    [currentUser?.email, persisted.mainEventState]
  );

  const currentUserUpcomingEventHistory = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const now = Date.now();

    return persisted.mainEventState.history
      .filter((item) => item.email === currentUser.email && new Date(item.eventDate).getTime() >= now)
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
      );
  }, [currentUser, persisted.mainEventState.history]);

  const unreadNotificationsCount = useMemo(
    () => persisted.notifications.filter((notification) => !notification.readAt).length,
    [persisted.notifications]
  );

  const unreadThreadsCount = useMemo(
    () => persisted.threads.filter((thread) => thread.unreadCount > 0).length,
    [persisted.threads]
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

        const updatedUser = callback(prev.users[userIndex]);
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
      if (!persisted.settings.notificationsEnabled) {
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
    [persisted.settings.notificationsEnabled]
  );

  const signUp = useCallback(
    (email: string, password: string): string | null => {
      if (!isValidEmail(email)) {
        return 'Inserisci un indirizzo email valido.';
      }

      if (password.length < 6) {
        return 'La password deve contenere almeno 6 caratteri.';
      }

      const normalized = normalizeEmail(email);
      const alreadyExists = persisted.users.some((candidate) => candidate.email === normalized);
      if (alreadyExists) {
        return 'Esiste gia un account con questa email.';
      }

      const nextUser: User = {
        email: normalized,
        password,
        showMe: 'everyone'
      };

      setPersisted((prev) => ({
        ...prev,
        users: [...prev.users, nextUser],
        currentUserEmail: nextUser.email
      }));

      return null;
    },
    [persisted.users]
  );

  const createLocalUser = useCallback(
    (email: string, password: string): string | null => {
      if (!isValidEmail(email)) {
        return 'Inserisci un indirizzo email valido.';
      }

      if (password.length < 6) {
        return 'La password deve contenere almeno 6 caratteri.';
      }

      const normalized = normalizeEmail(email);
      const alreadyExists = persisted.users.some((candidate) => candidate.email === normalized);
      if (alreadyExists) {
        return 'Esiste gia un account con questa email.';
      }

      const nextUser: User = {
        email: normalized,
        password,
        showMe: 'everyone'
      };

      setPersisted((prev) => ({
        ...prev,
        users: [...prev.users, nextUser]
      }));

      return null;
    },
    [persisted.users]
  );

  const logIn = useCallback(
    (email: string, password: string): string | null => {
      if (!isValidEmail(email)) {
        return 'Inserisci un indirizzo email valido.';
      }

      const normalized = normalizeEmail(email);
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
    [persisted.users]
  );

  const logOut = useCallback(() => {
    setPersisted((prev) => ({
      ...prev,
      currentUserEmail: null
    }));
  }, []);

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
    const usersToAdd = DEMO_USERS.filter((user) => !existingEmails.has(user.email));

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
    (imageData: string): string | null => {
      if (!currentUser) {
        return 'Effettua di nuovo l accesso.';
      }

      withCurrentUser((existing) => ({
        ...existing,
        profileImageData: imageData
      }));

      return null;
    },
    [currentUser, withCurrentUser]
  );

  const willUserLoseEventRegistrations = useCallback(
    (nextGender: UserGender, nextOrientation: UserOrientation): boolean =>
      willLoseMainEventRegistrations(
        persisted.mainEventState,
        currentUser,
        nextGender,
        nextOrientation
      ),
    [currentUser, persisted.mainEventState]
  );

  const updateProfile = useCallback(
    (input: ProfileUpdateInput): string | null => {
      if (!currentUser) {
        return 'Effettua di nuovo l accesso.';
      }

      const requiredFields = [
        input.firstName,
        input.lastName,
        input.city,
        input.bio,
        input.hobbies,
        input.passions,
        input.lookingFor,
        input.favoriteSong,
        input.favoriteMovie
      ];

      if (!requiredFields.every((field) => field.trim().length > 0)) {
        return 'Compila tutti i campi obbligatori.';
      }

      const age = calculateAge(input.birthDate);
      if (age < 18) {
        return 'Devi avere almeno 18 anni.';
      }

      if (input.ageRangeMin < 18 || input.ageRangeMax < input.ageRangeMin) {
        return 'Il range di eta non e valido.';
      }

      if (input.maxDistanceKm < 1 || input.maxDistanceKm > 300) {
        return 'La distanza massima deve essere tra 1 e 300 km.';
      }

      const shouldRemoveMainEvent = willLoseMainEventRegistrations(
        persisted.mainEventState,
        currentUser,
        input.gender,
        input.orientation
      );

      setPersisted((prev) => {
        if (!prev.currentUserEmail) {
          return prev;
        }

        const userIndex = prev.users.findIndex((candidate) => candidate.email === prev.currentUserEmail);
        if (userIndex < 0) {
          return prev;
        }

        const existing = prev.users[userIndex];
        const updatedUser: User = {
          ...existing,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          city: input.city.trim(),
          cityLat: input.cityLat,
          cityLng: input.cityLng,
          birthDate: input.birthDate,
          gender: input.gender,
          orientation: input.orientation,
          showMe: input.showMe,
          smokes: input.smokes,
          drinks: input.drinks,
          bio: input.bio.trim(),
          ageRangeMin: input.ageRangeMin,
          ageRangeMax: input.ageRangeMax,
          maxDistanceKm: input.maxDistanceKm,
          intent: input.intent,
          hobbies: input.hobbies.trim(),
          passions: input.passions.trim(),
          lookingFor: input.lookingFor.trim(),
          instagram: input.instagram.trim(),
          telegram: input.telegram.trim(),
          website: input.website.trim(),
          favoriteSong: input.favoriteSong.trim(),
          favoriteMovie: input.favoriteMovie.trim()
        };

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
    [currentUser, persisted.mainEventState]
  );

  const updateAccountPreferences = useCallback(
    (input: {
      orientation: UserOrientation;
      showMe: User['showMe'];
      smokes: boolean;
      drinks: boolean;
      bio: string;
      ageRangeMin: number;
      ageRangeMax: number;
      maxDistanceKm: number;
      intent: MatchIntent;
      hobbies: string;
      passions: string;
      lookingFor: string;
      instagram: string;
      telegram: string;
      website: string;
      favoriteSong: string;
      favoriteMovie: string;
    }): string | null => {
      if (!currentUser) {
        return 'Effettua di nuovo l accesso.';
      }

      if (input.ageRangeMin < 18 || input.ageRangeMax < input.ageRangeMin) {
        return 'Range eta non valido.';
      }

      if (input.maxDistanceKm < 1 || input.maxDistanceKm > 300) {
        return 'Distanza non valida.';
      }

      const shouldRemoveMainEvent = willLoseMainEventRegistrations(
        persisted.mainEventState,
        currentUser,
        currentUser.gender,
        input.orientation
      );

      withCurrentUser((existing) => ({
        ...existing,
        orientation: input.orientation,
        showMe: input.showMe,
        smokes: input.smokes,
        drinks: input.drinks,
        bio: input.bio.trim(),
        ageRangeMin: input.ageRangeMin,
        ageRangeMax: input.ageRangeMax,
        maxDistanceKm: input.maxDistanceKm,
        intent: input.intent,
        hobbies: input.hobbies.trim(),
        passions: input.passions.trim(),
        lookingFor: input.lookingFor.trim(),
        instagram: input.instagram.trim(),
        telegram: input.telegram.trim(),
        website: input.website.trim(),
        favoriteSong: input.favoriteSong.trim(),
        favoriteMovie: input.favoriteMovie.trim()
      }));

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
    [currentUser, persisted.mainEventState, withCurrentUser]
  );

  const registerCurrentUserForMainEvent = useCallback((): EventFeedback => {
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
  }, [currentUser, persisted.mainEventConfig, persisted.mainEventState]);

  const cancelCurrentUserMainEventRegistration = useCallback((): EventFeedback => {
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
  }, [currentUser, persisted.mainEventConfig, persisted.mainEventState]);

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
        return 'Questo utente e gia presente in evento o waiting list.';
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

    setPersisted((prev) => ({
      ...prev,
      threads: prev.threads.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        return {
          ...thread,
          unreadCount: 0,
          messages: thread.messages.map((message) =>
            !message.isMe && !message.readAt
              ? {
                  ...message,
                  readAt,
                  deliveryState: 'read'
                }
              : message
          )
        };
      }),
      notifications: prev.notifications.map((notification) =>
        notification.threadId === threadId && !notification.readAt
          ? {
              ...notification,
              readAt
            }
          : notification
      )
    }));
  }, []);

  const deleteThread = useCallback((threadId: string): void => {
    setPersisted((prev) => ({
      ...prev,
      threads: prev.threads.filter((thread) => thread.id !== threadId),
      notifications: prev.notifications.filter((notification) => notification.threadId !== threadId)
    }));
  }, []);

  const submitSwipeDecision = useCallback(
    async (profileId: string, decision: SwipeDecision): Promise<SwipeDecisionResult> => {
      const profile = discoverProfiles.find((candidate) => candidate.id === profileId);
      if (!profile) {
        return {
          matched: false,
          message: 'Profilo non disponibile.'
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
                : `Like inviato a ${profile.name}. In attesa di risposta.`
            };
          }

          const createdAt = nowIso();
          const matchNotification: AppNotification = {
            id: crypto.randomUUID(),
            type: 'match',
            title: `Nuovo match con ${profile.name}`,
            body: 'La chat e stata creata automaticamente.',
            createdAt,
            threadId: thread.id
          };

          setPersisted((prev) => ({
            ...prev,
            threads: [
              thread,
              ...prev.threads.filter((existingThread) => existingThread.id !== thread.id)
            ],
            notifications: [matchNotification, ...prev.notifications].slice(0, 180)
          }));

          return {
            matched: true,
            threadId: thread.id,
            message: `It s a match con ${profile.name}!`
          };
        } catch {
          return {
            matched: false,
            message: 'Swipe non registrato. Riprova.'
          };
        }
      }

      if (decision === 'left') {
        return {
          matched: false,
          message: `Hai saltato ${profile.name}.`
        };
      }

      const existingThread = persisted.threads.find(
        (thread) => thread.name.toLowerCase() === profile.name.toLowerCase()
      );

      if (existingThread) {
        return {
          matched: true,
          threadId: existingThread.id,
          message: `Hai gia una chat con ${profile.name}.`
        };
      }

      const matched = Math.random() > 0.38;
      if (!matched) {
        return {
          matched: false,
          message: `Like inviato a ${profile.name}. In attesa di risposta.`
        };
      }

      const createdAt = nowIso();
      const threadId = crypto.randomUUID();
      const openerMessage: ChatMessage = {
        id: crypto.randomUUID(),
        text: `Ehi! Match fatto. Ti va di sentirci qui?`,
        isMe: false,
        time: formatTime(new Date()),
        createdAt,
        senderName: profile.name,
        deliveryState: 'delivered'
      };

      const newThread: ChatThread = {
        id: threadId,
        name: profile.name,
        avatar: profile.name.slice(0, 1).toUpperCase(),
        isOnline: true,
        isTyping: false,
        unreadCount: 1,
        createdAt,
        matchedAt: createdAt,
        lastSeenAt: createdAt,
        messages: [openerMessage]
      };

      const matchNotification: AppNotification = {
        id: crypto.randomUUID(),
        type: 'match',
        title: `Nuovo match con ${profile.name}`,
        body: 'La chat e stata creata automaticamente.',
        createdAt,
        threadId
      };

      setPersisted((prev) => ({
        ...prev,
        threads: [newThread, ...prev.threads],
        notifications: [matchNotification, ...prev.notifications].slice(0, 180)
      }));

      return {
        matched: true,
        threadId,
        message: `It s a match con ${profile.name}!`
      };
    },
    [discoverProfiles, persisted.threads]
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
    setPersisted((prev) => ({
      ...prev,
      realtimeState: 'connecting'
    }));

    const connectTimer = window.setTimeout(() => {
      setPersisted((prev) => ({
        ...prev,
        realtimeState: 'connected'
      }));
    }, 900);

    const realtimeTimer = window.setInterval(() => {
      setPersisted((prev) => {
        if (prev.threads.length === 0 || Math.random() < 0.32) {
          return prev;
        }

        const randomIndex = Math.floor(Math.random() * prev.threads.length);
        const target = prev.threads[randomIndex];
        const messageText =
          INCOMING_MESSAGE_LIBRARY[Math.floor(Math.random() * INCOMING_MESSAGE_LIBRARY.length)];
        const createdAt = nowIso();

        const incomingMessage: ChatMessage = {
          id: crypto.randomUUID(),
          text: messageText,
          isMe: false,
          time: formatTime(new Date()),
          createdAt,
          senderName: target.name,
          deliveryState: 'delivered'
        };

        const nextThreads: ChatThread[] = prev.threads.map((thread, index): ChatThread => {
          if (index !== randomIndex) {
            return thread;
          }

          return {
            ...thread,
            isOnline: Math.random() > 0.22,
            lastSeenAt: createdAt,
            unreadCount: thread.unreadCount + 1,
            messages: [...thread.messages, incomingMessage]
          };
        });

        const incomingNotification: AppNotification = {
          id: crypto.randomUUID(),
          type: 'chat',
          title: `Nuovo messaggio da ${target.name}`,
          body: messageText,
          createdAt,
          threadId: target.id
        };

        const nextNotifications: AppNotification[] = prev.settings.notificationsEnabled
          ? [incomingNotification, ...prev.notifications].slice(0, 180)
          : prev.notifications;

        return {
          ...prev,
          realtimeState: 'connected',
          threads: nextThreads,
          notifications: nextNotifications
        };
      });
    }, 14000);

    return () => {
      window.clearTimeout(connectTimer);
      window.clearInterval(realtimeTimer);
      setPersisted((prev) => ({
        ...prev,
        realtimeState: 'disconnected'
      }));
    };
  }, []);

  useEffect(() => {
    if (!persisted.settings.notificationsPollingEnabled) {
      return;
    }

    const pollTimer = window.setInterval(() => {
      if (Math.random() < 0.55) {
        return;
      }

      const content =
        POLL_NOTIFICATION_LIBRARY[Math.floor(Math.random() * POLL_NOTIFICATION_LIBRARY.length)];
      pushNotification({
        type: 'system',
        title: 'Aggiornamento inbox',
        body: content
      });
    }, 30000);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [persisted.settings.notificationsPollingEnabled, pushNotification]);

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
      mainEventConfig,
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
      deleteThread,
      submitSwipeDecision,
      fetchMainEventAdminState,
      updateMainEventAsAdmin,
      addMainEventParticipantAsAdmin,
      removeMainEventParticipantAsAdmin,
      markNotificationRead,
      markAllNotificationsRead,
      requestBrowserNotificationsPermission,
      updateSettings,
      setThreads,
      hydrateMockDiscoverProfiles,
      hydrateMockThreadsIfMissing
    }),
    [
      persisted,
      currentUser,
      localUsers,
      discoverProfiles,
      mainEventConfig,
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
      deleteThread,
      submitSwipeDecision,
      fetchMainEventAdminState,
      updateMainEventAsAdmin,
      addMainEventParticipantAsAdmin,
      removeMainEventParticipantAsAdmin,
      markNotificationRead,
      markAllNotificationsRead,
      requestBrowserNotificationsPermission,
      updateSettings,
      setThreads,
      hydrateMockDiscoverProfiles,
      hydrateMockThreadsIfMissing
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
