import {
  useContext,
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  AppSettings,
  ChatThread,
  DiscoverProfile,
  EventHistoryItem,
  EventHistoryStatus,
  LocalUserSummary,
  MainEventSnapshot,
  PersistedAppState,
  ProfileUpdateInput,
  User,
  UserGender,
  UserOrientation,
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
  MainEventConfig,
  registerForMainEvent,
  removeUserFromMainEvent,
  willLoseMainEventRegistrations
} from '../services/eventEngine';
import {
  formatTime,
  getMainEventDate,
  MAIN_EVENT_INFO,
  MAIN_EVENT_TITLE,
  MAX_PARTICIPANTS,
  MAX_PER_GENDER
} from '../data/mockData';
import { loadAppwriteConfiguration } from '../services/appwriteConfiguration';
import { AppwriteService, AppwriteServiceError, EventRemoteState } from '../services/appwriteService';

interface EventFeedback {
  message: string;
  isError: boolean;
}

interface AppContextValue {
  persisted: PersistedAppState;
  currentUser: User | null;
  localUsers: LocalUserSummary[];
  discoverProfiles: DiscoverProfile[];
  mainEventConfig: MainEventConfig;
  mainEventInfo: typeof MAIN_EVENT_INFO;
  mainEventSnapshot: MainEventSnapshot;
  mainEventFlags: {
    isRegistered: boolean;
    isWaiting: boolean;
  };
  currentUserUpcomingEventHistory: EventHistoryItem[];
  isBackendMode: boolean;
  signUp(email: string, password: string): Promise<string | null>;
  createLocalUser(email: string, password: string): string | null;
  logIn(email: string, password: string): Promise<string | null>;
  logOut(): Promise<void>;
  switchLocalUser(email: string): string | null;
  removeLocalUser(email: string): string | null;
  seedDemoUsers(): number;
  resetLocalData(): void;
  updateProfileImage(imageData: string): Promise<string | null>;
  updateProfile(input: ProfileUpdateInput): Promise<string | null>;
  updateAccountPreferences(input: {
    orientation: UserOrientation;
    showMe: User['showMe'];
    smokes: boolean;
    drinks: boolean;
    hobbies: string;
    passions: string;
    lookingFor: string;
    favoriteSong: string;
    favoriteMovie: string;
  }): Promise<string | null>;
  willUserLoseEventRegistrations(nextGender: UserGender, nextOrientation: UserOrientation): boolean;
  registerCurrentUserForMainEvent(): Promise<EventFeedback>;
  cancelCurrentUserMainEventRegistration(): Promise<EventFeedback>;
  sendMessage(threadId: string, text: string): Promise<string | null>;
  deleteThread(threadId: string): void;
  updateSettings(patch: Partial<AppSettings>): void;
  setThreads(threads: ChatThread[]): void;
  hydrateMockDiscoverProfiles(): Promise<void>;
  hydrateMockThreadsIfMissing(): Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const MAIN_EVENT_DATE = getMainEventDate();
const ACTIVE_REMOTE_STATUSES = new Set<EventHistoryStatus>(['confirmed', 'promoted', 'waitlisted']);

const EVENT_MESSAGE_BY_KEY: Record<string, string> = {
  'events.error.loginRequired': 'Accedi per gestire l iscrizione.',
  'events.error.genderRequired': 'Imposta il genere nel profilo prima di iscriverti.',
  'events.error.genderUnsupported': 'Solo i profili uomo/donna possono iscriversi a questo evento.',
  'events.error.orientationUnsupported': 'Solo orientamento etero ammesso per questo evento.',
  'events.error.registrationClosed': 'Iscrizioni chiuse (mancano meno di 24h).',
  'events.error.alreadyWaitlisted': 'Sei gia in waiting list.',
  'events.error.alreadyRegistered': 'Sei gia iscritto a questo evento.',
  'events.error.capacityFull': 'Capienza evento raggiunta.',
  'events.error.notRegistered': 'Non risulti iscritto a questo evento.',
  'events.error.cancellationClosed': 'Disdetta non piu disponibile (mancano meno di 48h).',
  'events.error.requestFailed': 'Richiesta evento non riuscita. Riprova.'
};

const DEMO_USERS: User[] = [
  {
    email: 'giulia.demo@fyre.local',
    password: 'DEMO_PASSWORD_REDACTED',
    firstName: 'Giulia',
    lastName: 'Rossi',
    birthDate: '1998-05-22',
    gender: 'female',
    orientation: 'straight',
    showMe: 'men',
    smokes: false,
    drinks: true,
    hobbies: 'Concerti e viaggi brevi',
    passions: 'Arte contemporanea',
    lookingFor: 'Connessioni autentiche',
    favoriteSong: 'Dancing Queen',
    favoriteMovie: 'La La Land'
  },
  {
    email: 'marco.demo@fyre.local',
    password: 'DEMO_PASSWORD_REDACTED',
    firstName: 'Marco',
    lastName: 'Bianchi',
    birthDate: '1995-09-03',
    gender: 'male',
    orientation: 'straight',
    showMe: 'women',
    smokes: false,
    drinks: true,
    hobbies: 'Sport e trekking',
    passions: 'Musica live',
    lookingFor: 'Nuove conoscenze',
    favoriteSong: 'Lose Yourself',
    favoriteMovie: 'Inception'
  },
  {
    email: 'sara.demo@fyre.local',
    password: 'DEMO_PASSWORD_REDACTED',
    firstName: 'Sara',
    lastName: 'Neri',
    birthDate: '1996-12-14',
    gender: 'female',
    orientation: 'bisexual',
    showMe: 'everyone',
    smokes: false,
    drinks: false,
    hobbies: 'Fotografia e yoga',
    passions: 'Cinema e podcast',
    lookingFor: 'Persone affini',
    favoriteSong: 'Halo',
    favoriteMovie: 'Arrival'
  }
];

const appwriteConfiguration = loadAppwriteConfiguration();
const appwriteService = appwriteConfiguration ? new AppwriteService(appwriteConfiguration) : null;
const IS_BACKEND_MODE = appwriteService !== null;

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

function authErrorMessage(error: unknown, isSignUp: boolean): string {
  if (!(error instanceof AppwriteServiceError)) {
    return 'Richiesta autenticazione non riuscita. Riprova.';
  }

  if (isSignUp && error.statusCode === 409) {
    return 'Esiste gia un account con questa email.';
  }

  if (error.statusCode === 401) {
    return 'Email o password non valide.';
  }

  const lowerMessage = error.message.toLowerCase();
  if (lowerMessage.includes('password')) {
    return 'La password non rispetta i criteri richiesti.';
  }

  return 'Richiesta autenticazione non riuscita. Riprova.';
}

function profileErrorMessage(error: unknown): string {
  if (error instanceof AppwriteServiceError && error.isUnauthorized) {
    return 'Effettua di nuovo l accesso.';
  }

  return 'Salvataggio profilo non riuscito. Riprova.';
}

function eventErrorMessage(error: unknown): string {
  const messageKey = appwriteMessageKey(error);
  if (messageKey && EVENT_MESSAGE_BY_KEY[messageKey]) {
    return EVENT_MESSAGE_BY_KEY[messageKey];
  }

  if (error instanceof AppwriteServiceError && error.message.startsWith('events.')) {
    return EVENT_MESSAGE_BY_KEY[error.message] ?? 'Richiesta evento non riuscita. Riprova.';
  }

  return 'Richiesta evento non riuscita. Riprova.';
}

function canUseLocalUsersFeature(): boolean {
  return !IS_BACKEND_MODE;
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [persisted, setPersisted] = useState<PersistedAppState>(() => loadPersistedState());
  const [discoverProfiles, setDiscoverProfiles] = useState<DiscoverProfile[]>([]);
  const [remoteMainEventState, setRemoteMainEventState] = useState<EventRemoteState | null>(null);

  const currentUser = useMemo(() => {
    if (!persisted.currentUserEmail) {
      return null;
    }

    return (
      persisted.users.find((candidate) => candidate.email === persisted.currentUserEmail) ?? null
    );
  }, [persisted.currentUserEmail, persisted.users]);

  const upsertCurrentUser = useCallback((nextUser: User): void => {
    const normalizedEmail = normalizeEmail(nextUser.email);

    setPersisted((prev) => {
      const userIndex = prev.users.findIndex((candidate) => candidate.email === normalizedEmail);
      const mergedUser = {
        ...nextUser,
        email: normalizedEmail
      };

      if (userIndex >= 0) {
        const updatedUsers = [...prev.users];
        updatedUsers[userIndex] = {
          ...updatedUsers[userIndex],
          ...mergedUser
        };

        return {
          ...prev,
          users: updatedUsers,
          currentUserEmail: normalizedEmail
        };
      }

      return {
        ...prev,
        users: [...prev.users, mergedUser],
        currentUserEmail: normalizedEmail
      };
    });
  }, []);

  const refreshRemoteMainEventState = useCallback(async (userOverride?: User | null): Promise<EventRemoteState | null> => {
    if (!IS_BACKEND_MODE || !appwriteService) {
      setRemoteMainEventState(null);
      return null;
    }

    try {
      const state = await appwriteService.fetchMainEventState(userOverride ?? currentUser ?? null);
      setRemoteMainEventState(state);
      return state;
    } catch {
      return null;
    }
  }, [currentUser]);

  useEffect(() => {
    persistState(persisted);
  }, [persisted]);

  const hydrateMockDiscoverProfiles = useCallback(async (): Promise<void> => {
    try {
      if (IS_BACKEND_MODE && appwriteService) {
        const profiles = await appwriteService.fetchDiscoverProfiles();
        setDiscoverProfiles(profiles);
        return;
      }

      const profiles = await backendApi.fetchDiscoverProfiles();
      setDiscoverProfiles(profiles);
    } catch {
      setDiscoverProfiles([]);
    }
  }, []);

  const hydrateMockThreadsIfMissing = useCallback(async (): Promise<void> => {
    try {
      if (IS_BACKEND_MODE && appwriteService) {
        const threads = await appwriteService.fetchThreads();
        setPersisted((prev) => ({
          ...prev,
          threads
        }));
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
    } catch {
      // Keep local state untouched when background hydration fails.
    }
  }, [persisted.threads.length]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (IS_BACKEND_MODE && appwriteService) {
        try {
          const restoredUser = await appwriteService.restoreCurrentUser();
          if (cancelled) {
            return;
          }

          if (restoredUser) {
            upsertCurrentUser(restoredUser);
          } else {
            setPersisted((prev) => ({
              ...prev,
              currentUserEmail: null
            }));
            setRemoteMainEventState(null);
          }
        } catch {
          // Keep persisted user state when a temporary backend outage happens during bootstrap.
        }
      }

      if (cancelled) {
        return;
      }

      await hydrateMockDiscoverProfiles();
      if (cancelled) {
        return;
      }

      await hydrateMockThreadsIfMissing();
      if (cancelled) {
        return;
      }

      await refreshRemoteMainEventState();
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const localMainEventConfig = useMemo<MainEventConfig>(
    () => ({
      date: MAIN_EVENT_DATE,
      title: MAIN_EVENT_TITLE,
      maxParticipants: MAX_PARTICIPANTS,
      maxPerGender: MAX_PER_GENDER
    }),
    []
  );

  const localMainEventSnapshot = useMemo(
    () => getSnapshot(persisted.mainEventState, localMainEventConfig),
    [localMainEventConfig, persisted.mainEventState]
  );

  const localMainEventFlags = useMemo(
    () => getFlags(persisted.mainEventState, currentUser?.email ?? null),
    [currentUser?.email, persisted.mainEventState]
  );

  const mainEventConfig = useMemo<MainEventConfig>(() => {
    if (IS_BACKEND_MODE && remoteMainEventState?.snapshot) {
      const snapshot = remoteMainEventState.snapshot;
      const maleLimit = snapshot.maleCount + snapshot.remainingMaleSlots;
      const femaleLimit = snapshot.femaleCount + snapshot.remainingFemaleSlots;

      return {
        date: snapshot.date,
        title: snapshot.title,
        maxParticipants: snapshot.maxParticipants,
        maxPerGender: Math.max(maleLimit, femaleLimit)
      };
    }

    return localMainEventConfig;
  }, [localMainEventConfig, remoteMainEventState]);

  const mainEventSnapshot = useMemo<MainEventSnapshot>(() => {
    if (IS_BACKEND_MODE && remoteMainEventState?.snapshot) {
      return remoteMainEventState.snapshot;
    }

    return localMainEventSnapshot;
  }, [localMainEventSnapshot, remoteMainEventState]);

  const mainEventFlags = useMemo(() => {
    if (IS_BACKEND_MODE && remoteMainEventState) {
      return {
        isRegistered:
          remoteMainEventState.currentStatus === 'confirmed' ||
          remoteMainEventState.currentStatus === 'promoted',
        isWaiting: remoteMainEventState.currentStatus === 'waitlisted'
      };
    }

    return localMainEventFlags;
  }, [localMainEventFlags, remoteMainEventState]);

  const currentUserUpcomingEventHistory = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const now = Date.now();

    if (IS_BACKEND_MODE && remoteMainEventState) {
      return remoteMainEventState.history
        .filter((item) => new Date(item.eventDate).getTime() >= now)
        .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
    }

    return persisted.mainEventState.history
      .filter((item) => item.email === currentUser.email && new Date(item.eventDate).getTime() >= now)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }, [currentUser, persisted.mainEventState.history, remoteMainEventState]);

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

  const signUp = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!isValidEmail(email)) {
      return 'Inserisci un indirizzo email valido.';
    }

    if (password.length < 6) {
      return 'La password deve contenere almeno 6 caratteri.';
    }

    const normalized = normalizeEmail(email);

    if (IS_BACKEND_MODE && appwriteService) {
      try {
        const user = await appwriteService.signUp(normalized, password);
        upsertCurrentUser(user);
        await hydrateMockDiscoverProfiles();
        await hydrateMockThreadsIfMissing();
        await refreshRemoteMainEventState(user);
        return null;
      } catch (error) {
        return authErrorMessage(error, true);
      }
    }

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
  }, [hydrateMockDiscoverProfiles, hydrateMockThreadsIfMissing, persisted.users, refreshRemoteMainEventState, upsertCurrentUser]);

  const createLocalUser = useCallback((email: string, password: string): string | null => {
    if (!canUseLocalUsersFeature()) {
      return 'Gestione utenti locali non disponibile con backend attivo.';
    }

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
  }, [persisted.users]);

  const logIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!isValidEmail(email)) {
      return 'Inserisci un indirizzo email valido.';
    }

    const normalized = normalizeEmail(email);

    if (IS_BACKEND_MODE && appwriteService) {
      try {
        const user = await appwriteService.logIn(normalized, password);
        upsertCurrentUser(user);
        await hydrateMockDiscoverProfiles();
        await hydrateMockThreadsIfMissing();
        await refreshRemoteMainEventState(user);
        return null;
      } catch (error) {
        return authErrorMessage(error, false);
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
  }, [hydrateMockDiscoverProfiles, hydrateMockThreadsIfMissing, persisted.users, refreshRemoteMainEventState, upsertCurrentUser]);

  const logOut = useCallback(async (): Promise<void> => {
    if (IS_BACKEND_MODE && appwriteService) {
      try {
        await appwriteService.logOut();
      } catch {
        // Always clear local session state even when remote logout fails.
      }
    }

    setPersisted((prev) => ({
      ...prev,
      currentUserEmail: null
    }));
    setRemoteMainEventState(null);
  }, []);

  const switchLocalUser = useCallback((email: string): string | null => {
    if (!canUseLocalUsersFeature()) {
      return 'Gestione utenti locali non disponibile con backend attivo.';
    }

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
  }, [persisted.users]);

  const removeLocalUser = useCallback((email: string): string | null => {
    if (!canUseLocalUsersFeature()) {
      return 'Gestione utenti locali non disponibile con backend attivo.';
    }

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
  }, [persisted.users]);

  const seedDemoUsers = useCallback((): number => {
    if (!canUseLocalUsersFeature()) {
      return 0;
    }

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
    setDiscoverProfiles([]);
    setRemoteMainEventState(null);
  }, []);

  const updateProfileImage = useCallback(async (imageData: string): Promise<string | null> => {
    if (!currentUser) {
      return 'Effettua di nuovo l accesso.';
    }

    if (IS_BACKEND_MODE && appwriteService) {
      try {
        const updatedUser = await appwriteService.updateProfileImage(currentUser, imageData);
        upsertCurrentUser(updatedUser);
        await hydrateMockDiscoverProfiles();
        return null;
      } catch (error) {
        return profileErrorMessage(error);
      }
    }

    withCurrentUser((existing) => ({
      ...existing,
      profileImageData: imageData
    }));

    return null;
  }, [currentUser, hydrateMockDiscoverProfiles, upsertCurrentUser, withCurrentUser]);

  const willUserLoseEventRegistrations = useCallback(
    (nextGender: UserGender, nextOrientation: UserOrientation): boolean => {
      if (!currentUser) {
        return false;
      }

      if (IS_BACKEND_MODE && remoteMainEventState) {
        if (!remoteMainEventState.currentStatus || !ACTIVE_REMOTE_STATUSES.has(remoteMainEventState.currentStatus)) {
          return false;
        }

        return currentUser.gender !== nextGender || currentUser.orientation !== nextOrientation;
      }

      return willLoseMainEventRegistrations(
        persisted.mainEventState,
        currentUser,
        nextGender,
        nextOrientation
      );
    },
    [currentUser, persisted.mainEventState, remoteMainEventState]
  );

  const updateProfile = useCallback(async (input: ProfileUpdateInput): Promise<string | null> => {
    if (!currentUser) {
      return 'Effettua di nuovo l accesso.';
    }

    const requiredFields = [
      input.firstName,
      input.lastName,
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

    const shouldRemoveMainEvent = willUserLoseEventRegistrations(input.gender, input.orientation);

    if (IS_BACKEND_MODE && appwriteService) {
      const mergedUser: User = {
        ...currentUser,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        birthDate: input.birthDate,
        gender: input.gender,
        orientation: input.orientation,
        showMe: input.showMe,
        smokes: input.smokes,
        drinks: input.drinks,
        hobbies: input.hobbies.trim(),
        passions: input.passions.trim(),
        lookingFor: input.lookingFor.trim(),
        favoriteSong: input.favoriteSong.trim(),
        favoriteMovie: input.favoriteMovie.trim()
      };

      try {
        const updatedUser = await appwriteService.updateProfile(mergedUser);
        upsertCurrentUser(updatedUser);

        if (shouldRemoveMainEvent) {
          await appwriteService.cancelMainEventRegistration(
            updatedUser,
            remoteMainEventState?.eventId,
            true
          ).catch(() => undefined);
        }

        await refreshRemoteMainEventState(updatedUser);
        await hydrateMockDiscoverProfiles();
        return null;
      } catch (error) {
        return profileErrorMessage(error);
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

      const existing = prev.users[userIndex];
      const updatedUser: User = {
        ...existing,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        birthDate: input.birthDate,
        gender: input.gender,
        orientation: input.orientation,
        showMe: input.showMe,
        smokes: input.smokes,
        drinks: input.drinks,
        hobbies: input.hobbies.trim(),
        passions: input.passions.trim(),
        lookingFor: input.lookingFor.trim(),
        favoriteSong: input.favoriteSong.trim(),
        favoriteMovie: input.favoriteMovie.trim()
      };

      const users = [...prev.users];
      users[userIndex] = updatedUser;

      return {
        ...prev,
        users,
        mainEventState: shouldRemoveMainEvent
          ? removeUserFromMainEvent(prev.mainEventState, updatedUser.email, mainEventConfig)
          : prev.mainEventState
      };
    });

    return null;
  }, [
    currentUser,
    hydrateMockDiscoverProfiles,
    mainEventConfig,
    refreshRemoteMainEventState,
    remoteMainEventState?.eventId,
    upsertCurrentUser,
    willUserLoseEventRegistrations
  ]);

  const updateAccountPreferences = useCallback(async (input: {
    orientation: UserOrientation;
    showMe: User['showMe'];
    smokes: boolean;
    drinks: boolean;
    hobbies: string;
    passions: string;
    lookingFor: string;
    favoriteSong: string;
    favoriteMovie: string;
  }): Promise<string | null> => {
    if (!currentUser) {
      return 'Effettua di nuovo l accesso.';
    }

    const shouldRemoveMainEvent = willUserLoseEventRegistrations(
      currentUser.gender ?? 'male',
      input.orientation
    );

    if (IS_BACKEND_MODE && appwriteService) {
      const mergedUser: User = {
        ...currentUser,
        orientation: input.orientation,
        showMe: input.showMe,
        smokes: input.smokes,
        drinks: input.drinks,
        hobbies: input.hobbies.trim(),
        passions: input.passions.trim(),
        lookingFor: input.lookingFor.trim(),
        favoriteSong: input.favoriteSong.trim(),
        favoriteMovie: input.favoriteMovie.trim()
      };

      try {
        const updatedUser = await appwriteService.updateProfile(mergedUser);
        upsertCurrentUser(updatedUser);

        if (shouldRemoveMainEvent) {
          await appwriteService.cancelMainEventRegistration(
            updatedUser,
            remoteMainEventState?.eventId,
            true
          ).catch(() => undefined);
        }

        await refreshRemoteMainEventState(updatedUser);
        await hydrateMockDiscoverProfiles();
        return null;
      } catch (error) {
        return profileErrorMessage(error);
      }
    }

    withCurrentUser((existing) => ({
      ...existing,
      orientation: input.orientation,
      showMe: input.showMe,
      smokes: input.smokes,
      drinks: input.drinks,
      hobbies: input.hobbies.trim(),
      passions: input.passions.trim(),
      lookingFor: input.lookingFor.trim(),
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
            mainEventConfig
          )
        };
      });
    }

    return null;
  }, [
    currentUser,
    hydrateMockDiscoverProfiles,
    mainEventConfig,
    refreshRemoteMainEventState,
    remoteMainEventState?.eventId,
    upsertCurrentUser,
    willUserLoseEventRegistrations,
    withCurrentUser
  ]);

  const registerCurrentUserForMainEvent = useCallback(async (): Promise<EventFeedback> => {
    if (IS_BACKEND_MODE && appwriteService) {
      if (!currentUser) {
        return {
          message: 'Accedi per gestire l iscrizione.',
          isError: true
        };
      }

      const hadRegistrationBeforeRequest = mainEventFlags.isRegistered || mainEventFlags.isWaiting;

      try {
        const status = await appwriteService.registerForMainEvent(currentUser, remoteMainEventState?.eventId);
        const refreshedState = await refreshRemoteMainEventState(currentUser);
        const resolvedStatus = refreshedState?.currentStatus ?? status;

        return {
          message:
            resolvedStatus === 'waitlisted'
              ? 'Inserito in waiting list. Verrai promosso automaticamente quando si libera un posto.'
              : 'Iscrizione confermata.',
          isError: false
        };
      } catch (error) {
        const refreshedState = await refreshRemoteMainEventState(currentUser);

        if (
          !hadRegistrationBeforeRequest &&
          refreshedState?.currentStatus &&
          ACTIVE_REMOTE_STATUSES.has(refreshedState.currentStatus)
        ) {
          return {
            message:
              refreshedState.currentStatus === 'waitlisted'
                ? 'Inserito in waiting list. Verrai promosso automaticamente quando si libera un posto.'
                : 'Iscrizione confermata.',
            isError: false
          };
        }

        return {
          message: eventErrorMessage(error),
          isError: true
        };
      }
    }

    const result = registerForMainEvent(
      persisted.mainEventState,
      currentUser,
      mainEventConfig
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
    mainEventConfig,
    mainEventFlags.isRegistered,
    mainEventFlags.isWaiting,
    persisted.mainEventState,
    refreshRemoteMainEventState,
    remoteMainEventState?.eventId
  ]);

  const cancelCurrentUserMainEventRegistration = useCallback(async (): Promise<EventFeedback> => {
    if (IS_BACKEND_MODE && appwriteService) {
      if (!currentUser) {
        return {
          message: 'Accedi per gestire l iscrizione.',
          isError: true
        };
      }

      const hadRegistrationBeforeRequest = mainEventFlags.isRegistered || mainEventFlags.isWaiting;
      const wasWaitingBeforeRequest = mainEventFlags.isWaiting;

      try {
        await appwriteService.cancelMainEventRegistration(currentUser, remoteMainEventState?.eventId);
        await refreshRemoteMainEventState(currentUser);

        return {
          message: wasWaitingBeforeRequest ? 'Rimosso dalla waiting list.' : 'Iscrizione annullata.',
          isError: false
        };
      } catch (error) {
        const refreshedState = await refreshRemoteMainEventState(currentUser);

        if (
          hadRegistrationBeforeRequest &&
          (!refreshedState?.currentStatus || !ACTIVE_REMOTE_STATUSES.has(refreshedState.currentStatus))
        ) {
          return {
            message: wasWaitingBeforeRequest ? 'Rimosso dalla waiting list.' : 'Iscrizione annullata.',
            isError: false
          };
        }

        return {
          message: eventErrorMessage(error),
          isError: true
        };
      }
    }

    const result = cancelMainEventRegistration(
      persisted.mainEventState,
      currentUser,
      mainEventConfig
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
    mainEventConfig,
    mainEventFlags.isRegistered,
    mainEventFlags.isWaiting,
    persisted.mainEventState,
    refreshRemoteMainEventState,
    remoteMainEventState?.eventId
  ]);

  const sendMessage = useCallback(async (threadId: string, text: string): Promise<string | null> => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return null;
    }

    if (IS_BACKEND_MODE && appwriteService) {
      try {
        const sentMessage = await appwriteService.sendMessage(threadId, normalizedText);

        setPersisted((prev) => ({
          ...prev,
          threads: prev.threads.map((thread) => {
            if (thread.id !== threadId) {
              return thread;
            }

            return {
              ...thread,
              messages: [...thread.messages, sentMessage]
            };
          })
        }));

        await hydrateMockThreadsIfMissing();
        return null;
      } catch {
        return 'Invio non riuscito. Riprova.';
      }
    }

    setPersisted((prev) => ({
      ...prev,
      threads: prev.threads.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        return {
          ...thread,
          messages: [
            ...thread.messages,
            {
              id: crypto.randomUUID(),
              text: normalizedText,
              isMe: true,
              time: formatTime(new Date())
            }
          ]
        };
      })
    }));

    return null;
  }, [hydrateMockThreadsIfMissing]);

  const deleteThread = useCallback((threadId: string): void => {
    setPersisted((prev) => ({
      ...prev,
      threads: prev.threads.filter((thread) => thread.id !== threadId)
    }));
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

  const contextValue = useMemo<AppContextValue>(
    () => ({
      persisted,
      currentUser,
      localUsers,
      discoverProfiles,
      mainEventConfig,
      mainEventInfo: MAIN_EVENT_INFO,
      mainEventSnapshot,
      mainEventFlags,
      currentUserUpcomingEventHistory,
      isBackendMode: IS_BACKEND_MODE,
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
      sendMessage,
      deleteThread,
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
      mainEventSnapshot,
      mainEventFlags,
      currentUserUpcomingEventHistory,
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
      sendMessage,
      deleteThread,
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
