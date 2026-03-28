import { ChatThread, DiscoverProfile, MainEventState } from '../types/models';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const MAX_PARTICIPANTS = 48;
export const MAX_PER_GENDER = 24;
export const MAIN_EVENT_TITLE = 'Fyre Event';

export function getMainEventDate(): string {
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 10);
  eventDate.setHours(21, 0, 0, 0);
  return eventDate.toISOString();
}

export const MAIN_EVENT_INFO = {
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

export const baseDiscoverProfiles: DiscoverProfile[] = [
  {
    id: crypto.randomUUID(),
    name: 'Giulia',
    age: 24,
    gender: 'female',
    bio: 'Concerti, caffe e weekend improvvisati.',
    imageUrl: '/images/profile-giulia.jpg'
  },
  {
    id: crypto.randomUUID(),
    name: 'Marco',
    age: 27,
    gender: 'male',
    bio: 'Sport, viaggi in moto e cocktail bar.',
    imageUrl: '/images/profile-marco.jpg'
  },
  {
    id: crypto.randomUUID(),
    name: 'Elena',
    age: 25,
    gender: 'female',
    bio: 'Cinema d autore, podcast e passeggiate serali.',
    imageUrl: '/images/profile-elena.jpg'
  },
  {
    id: crypto.randomUUID(),
    name: 'Luca',
    age: 29,
    gender: 'male',
    bio: 'Vinili, aperitivi e road trip last minute.',
    imageUrl: '/images/profile-luca.jpg'
  },
  {
    id: crypto.randomUUID(),
    name: 'Sam',
    age: 26,
    gender: 'nonBinary',
    bio: 'Arte contemporanea, playlist curate e talk sinceri.',
    imageUrl: '/images/profile-sam.jpg'
  }
];

export function createMockThreads(): ChatThread[] {
  const now = new Date();
  return [
    {
      id: crypto.randomUUID(),
      name: 'Giulia',
      avatar: 'G',
      isOnline: true,
      messages: [
        {
          id: crypto.randomUUID(),
          text: 'Ci vediamo dopo cena?',
          isMe: false,
          time: formatTime(new Date(now.getTime() - 40 * FIFTEEN_MINUTES))
        },
        {
          id: crypto.randomUUID(),
          text: 'Perfetto, ci sono.',
          isMe: true,
          time: formatTime(new Date(now.getTime() - 35 * FIFTEEN_MINUTES))
        }
      ]
    },
    {
      id: crypto.randomUUID(),
      name: 'Marco',
      avatar: 'M',
      isOnline: false,
      messages: [
        {
          id: crypto.randomUUID(),
          text: 'Allenamento domani mattina?',
          isMe: false,
          time: formatTime(new Date(now.getTime() - 120 * FIFTEEN_MINUTES))
        }
      ]
    },
    {
      id: crypto.randomUUID(),
      name: 'Elena',
      avatar: 'E',
      isOnline: true,
      messages: [
        {
          id: crypto.randomUUID(),
          text: 'Hai visto il nuovo film in sala?',
          isMe: false,
          time: formatTime(new Date(now.getTime() - 16 * FIFTEEN_MINUTES))
        },
        {
          id: crypto.randomUUID(),
          text: 'Sabato potremmo andare insieme.',
          isMe: true,
          time: formatTime(new Date(now.getTime() - 15 * FIFTEEN_MINUTES))
        }
      ]
    }
  ];
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
