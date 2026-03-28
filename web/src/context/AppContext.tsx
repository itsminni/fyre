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
    hobbies: string;
    passions: string;
    lookingFor: string;
    favoriteSong: string;
    favoriteMovie: string;
  }): string | null;
  willUserLoseEventRegistrations(nextGender: UserGender, nextOrientation: UserOrientation): boolean;
  registerCurrentUserForMainEvent(): EventFeedback;
  cancelCurrentUserMainEventRegistration(): EventFeedback;
  sendMessage(threadId: string, text: string): void;
  deleteThread(threadId: string): void;
  updateSettings(patch: Partial<AppSettings>): void;
  setThreads(threads: ChatThread[]): void;
  hydrateMockDiscoverProfiles(): Promise<void>;
  hydrateMockThreadsIfMissing(): Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const MAIN_EVENT_DATE = getMainEventDate();

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

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [persisted, setPersisted] = useState<PersistedAppState>(() => loadPersistedState());
  const [discoverProfiles, setDiscoverProfiles] = useState<DiscoverProfile[]>([]);

  const mainEventConfig = useMemo<MainEventConfig>(
    () => ({
      date: MAIN_EVENT_DATE,
      title: MAIN_EVENT_TITLE,
      maxParticipants: MAX_PARTICIPANTS,
      maxPerGender: MAX_PER_GENDER
    }),
    []
  );

  useEffect(() => {
    persistState(persisted);
  }, [persisted]);

  const hydrateMockDiscoverProfiles = useCallback(async (): Promise<void> => {
    const profiles = await backendApi.fetchDiscoverProfiles();
    setDiscoverProfiles(profiles);
  }, []);

  const hydrateMockThreadsIfMissing = useCallback(async (): Promise<void> => {
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

  const signUp = useCallback((email: string, password: string): string | null => {
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
  }, [persisted.users]);

  const createLocalUser = useCallback((email: string, password: string): string | null => {
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

  const logIn = useCallback((email: string, password: string): string | null => {
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
  }, [persisted.users]);

  const logOut = useCallback(() => {
    setPersisted((prev) => ({
      ...prev,
      currentUserEmail: null
    }));
  }, []);

  const switchLocalUser = useCallback((email: string): string | null => {
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
    },
    [currentUser, mainEventConfig, persisted.mainEventState]
  );

  const updateAccountPreferences = useCallback(
    (input: {
      orientation: UserOrientation;
      showMe: User['showMe'];
      smokes: boolean;
      drinks: boolean;
      hobbies: string;
      passions: string;
      lookingFor: string;
      favoriteSong: string;
      favoriteMovie: string;
    }): string | null => {
      if (!currentUser) {
        return 'Effettua di nuovo l accesso.';
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
    },
    [currentUser, mainEventConfig, persisted.mainEventState, withCurrentUser]
  );

  const registerCurrentUserForMainEvent = useCallback((): EventFeedback => {
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
  }, [currentUser, mainEventConfig, persisted.mainEventState]);

  const cancelCurrentUserMainEventRegistration = useCallback((): EventFeedback => {
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
  }, [currentUser, mainEventConfig, persisted.mainEventState]);

  const sendMessage = useCallback((threadId: string, text: string): void => {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
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
  }, []);

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
