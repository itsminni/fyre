import {
  EventHistoryStatus,
  MainEventConfig,
  MainEventSnapshot,
  MainEventState,
  User,
  UserGender,
  UserOrientation
} from '../types/models';

export interface EventFlags {
  isRegistered: boolean;
  isWaiting: boolean;
}

export interface EventActionResult {
  nextState: MainEventState;
  message: string;
  isError: boolean;
}

function appendHistory(
  state: MainEventState,
  email: string,
  status: EventHistoryStatus,
  config: MainEventConfig
): MainEventState {
  return {
    ...state,
    history: [
      ...state.history,
      {
        id: crypto.randomUUID(),
        email,
        eventTitle: config.title,
        eventDate: config.date,
        status,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

export function getFlags(state: MainEventState, email: string | null): EventFlags {
  if (!email) {
    return {
      isRegistered: false,
      isWaiting: false
    };
  }

  return {
    isRegistered: state.participants.some((item) => item.email === email),
    isWaiting: state.waitingList.some((item) => item.email === email)
  };
}

export function getSnapshot(state: MainEventState, config: MainEventConfig): MainEventSnapshot {
  const maleCount = state.participants.filter((item) => item.gender === 'male').length;
  const femaleCount = state.participants.filter((item) => item.gender === 'female').length;
  const totalCount = maleCount + femaleCount;

  return {
    date: config.date,
    title: config.title,
    maxParticipants: config.maxParticipants,
    maleLimit: config.maxPerGender,
    femaleLimit: config.maxPerGender,
    maleCount,
    femaleCount,
    waitingListCount: state.waitingList.length,
    totalCount,
    remainingMaleSlots: Math.max(0, config.maxPerGender - maleCount),
    remainingFemaleSlots: Math.max(0, config.maxPerGender - femaleCount)
  };
}

function canPromote(
  state: MainEventState,
  participant: MainEventState['waitingList'][number],
  config: MainEventConfig
): boolean {
  const snapshot = getSnapshot(state, config);
  if (snapshot.totalCount >= config.maxParticipants) {
    return false;
  }

  const sameGenderCount = participant.gender === 'male' ? snapshot.maleCount : snapshot.femaleCount;
  return sameGenderCount < config.maxPerGender;
}

function promoteFromWaitingList(
  state: MainEventState,
  gender: UserGender,
  config: MainEventConfig
): MainEventState {
  const waitingIndex = state.waitingList.findIndex(
    (item) => item.gender === gender && canPromote(state, item, config)
  );

  if (waitingIndex < 0) {
    return state;
  }

  const promoted = state.waitingList[waitingIndex];
  const waitingList = state.waitingList.filter((_, index) => index !== waitingIndex);

  let nextState: MainEventState = {
    ...state,
    waitingList,
    participants: [...state.participants, promoted]
  };

  nextState = appendHistory(nextState, promoted.email, 'promoted', config);
  return nextState;
}

export function removeUserFromMainEvent(
  state: MainEventState,
  email: string,
  config: MainEventConfig
): MainEventState {
  const participantIndex = state.participants.findIndex((item) => item.email === email);
  const waitingIndex = state.waitingList.findIndex((item) => item.email === email);

  let nextState = state;

  if (participantIndex >= 0) {
    const removed = state.participants[participantIndex];
    nextState = {
      ...nextState,
      participants: nextState.participants.filter((_, index) => index !== participantIndex)
    };
    nextState = appendHistory(nextState, email, 'cancelled', config);
    nextState = promoteFromWaitingList(nextState, removed.gender, config);
  }

  if (waitingIndex >= 0) {
    nextState = {
      ...nextState,
      waitingList: nextState.waitingList.filter((_, index) => index !== waitingIndex)
    };
    nextState = appendHistory(nextState, email, 'cancelled', config);
  }

  return nextState;
}

export function willLoseMainEventRegistrations(
  state: MainEventState,
  user: User | null,
  nextGender: UserGender | undefined,
  nextOrientation: UserOrientation | undefined
): boolean {
  if (!user) {
    return false;
  }

  const flags = getFlags(state, user.email);
  if (!flags.isRegistered && !flags.isWaiting) {
    return false;
  }

  return user.gender !== nextGender || user.orientation !== nextOrientation;
}

export function registerForMainEvent(
  state: MainEventState,
  user: User | null,
  config: MainEventConfig,
  now = new Date()
): EventActionResult {
  if (!user) {
    return {
      nextState: state,
      message: 'Accedi per gestire l iscrizione.',
      isError: true
    };
  }

  const flags = getFlags(state, user.email);
  if (flags.isRegistered) {
    return {
      nextState: state,
      message: 'Sei già iscritto a questo evento.',
      isError: true
    };
  }
  if (flags.isWaiting) {
    return {
      nextState: state,
      message: 'Sei già in waiting list.',
      isError: true
    };
  }

  if (!user.gender) {
    return {
      nextState: state,
      message: 'Imposta il genere nel profilo prima di iscriverti.',
      isError: true
    };
  }

  if (user.gender !== 'male' && user.gender !== 'female') {
    return {
      nextState: state,
      message: 'Solo i profili uomo/donna possono iscriversi a questo evento.',
      isError: true
    };
  }

  if (user.orientation !== 'straight') {
    return {
      nextState: state,
      message: 'Solo orientamento etero ammesso per questo evento.',
      isError: true
    };
  }

  const eventDate = new Date(config.date);
  const registrationLockDate = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
  if (now >= registrationLockDate) {
    return {
      nextState: state,
      message: 'Iscrizioni chiuse (mancano meno di 24h).',
      isError: true
    };
  }

  const snapshot = getSnapshot(state, config);
  if (snapshot.totalCount >= config.maxParticipants) {
    return {
      nextState: state,
      message: 'Capienza evento raggiunta.',
      isError: true
    };
  }

  const sameGenderCount =
    user.gender === 'male' ? snapshot.maleCount : snapshot.femaleCount;

  if (sameGenderCount >= config.maxPerGender) {
    let nextState: MainEventState = {
      ...state,
      waitingList: [...state.waitingList, { email: user.email, gender: user.gender }]
    };
    nextState = appendHistory(nextState, user.email, 'waitlisted', config);

    return {
      nextState,
      message:
        'Inserito in waiting list. Passerai automaticamente in confermato quando si libera un posto per il tuo genere.',
      isError: false
    };
  }

  let nextState: MainEventState = {
    ...state,
    participants: [...state.participants, { email: user.email, gender: user.gender }]
  };
  nextState = appendHistory(nextState, user.email, 'confirmed', config);

  return {
    nextState,
    message: 'Iscrizione confermata.',
    isError: false
  };
}

export function cancelMainEventRegistration(
  state: MainEventState,
  user: User | null,
  config: MainEventConfig,
  now = new Date()
): EventActionResult {
  if (!user) {
    return {
      nextState: state,
      message: 'Accedi per gestire l iscrizione.',
      isError: true
    };
  }

  const eventDate = new Date(config.date);
  const cancellationLockDate = new Date(eventDate.getTime() - 48 * 60 * 60 * 1000);
  if (now >= cancellationLockDate) {
    return {
      nextState: state,
      message: 'Disdetta non più disponibile (mancano meno di 48h).',
      isError: true
    };
  }

  const flags = getFlags(state, user.email);
  if (!flags.isRegistered && !flags.isWaiting) {
    return {
      nextState: state,
      message: 'Non risulti iscritto a questo evento.',
      isError: true
    };
  }

  const nextState = removeUserFromMainEvent(state, user.email, config);
  return {
    nextState,
    message: flags.isWaiting ? 'Rimosso dalla waiting list.' : 'Iscrizione annullata.',
    isError: false
  };
}
