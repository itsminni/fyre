import {
  MainEventConfig,
  MainEventInfo,
  MainEventState
} from '../types/models';

export const MAX_PARTICIPANTS = 48;
export const MAX_PER_GENDER = 24;
export const MAIN_EVENT_TITLE = 'Fyre Event';

export function getMainEventDate(): string {
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 10);
  eventDate.setHours(21, 0, 0, 0);
  return eventDate.toISOString();
}

export function createDefaultMainEventConfig(): MainEventConfig {
  return {
    date: getMainEventDate(),
    title: MAIN_EVENT_TITLE,
    maxParticipants: MAX_PARTICIPANTS,
    maxPerGender: MAX_PER_GENDER
  };
}

export const MAIN_EVENT_INFO: MainEventInfo = {
  venue: 'EVENT_VENUE_REDACTED',
  address: "EVENT_ADDRESS_REDACTED",
  timeLabel: 'Dalle 21:00 alle 03:00',
  contribution: '35EUR a persona',
  contact: 'EVENT_CONTACT_REDACTED',
  dressCode: 'Elegante / sensuale',
  description:
    'Serata esclusiva per coppie e single selezionati, in un ambiente riservato, con buffet e welcome drink inclusi.',
  rules: [
    '24 prive, massimo 48 partecipanti.',
    'La waiting list scatta solo quando i posti del tuo genere sono pieni.',
    'Disdetta consentita fino a 48 ore prima.',
    'Iscrizioni definitive 24 ore prima.'
  ]
};

export function createDefaultMainEventInfo(): MainEventInfo {
  return {
    ...MAIN_EVENT_INFO,
    rules: [...MAIN_EVENT_INFO.rules]
  };
}

export function createInitialMainEventState(): MainEventState {
  return {
    participants: [
      { email: 'alfa@example.com', gender: 'male' },
      { email: 'beta@example.com', gender: 'female' },
      { email: 'gamma@example.com', gender: 'female' },
      { email: 'delta@example.com', gender: 'male' }
    ],
    waitingList: [],
    history: []
  };
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}
