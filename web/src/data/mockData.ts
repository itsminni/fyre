import {
  ChatThread,
  DiscoverProfile,
  MainEventConfig,
  MainEventInfo,
  MainEventState
} from '../types/models';

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

export const baseDiscoverProfiles: DiscoverProfile[] = [
  {
    id: crypto.randomUUID(),
    name: 'Giulia',
    age: 24,
    gender: 'female',
    city: 'Reggio Emilia',
    distanceKm: 4,
    intent: 'relationship',
    bio: 'Concerti, caffe e weekend improvvisati.',
    imageUrl: '/images/profile-giulia.jpg'
  },
  {
    id: crypto.randomUUID(),
    name: 'Marco',
    age: 27,
    gender: 'male',
    city: 'Parma',
    distanceKm: 19,
    intent: 'friendship',
    bio: 'Sport, viaggi in moto e cocktail bar.',
    imageUrl: '/images/profile-marco.jpg'
  },
  {
    id: crypto.randomUUID(),
    name: 'Elena',
    age: 25,
    gender: 'female',
    city: 'Modena',
    distanceKm: 27,
    intent: 'casual',
    bio: 'Cinema d autore, podcast e passeggiate serali.',
    imageUrl: '/images/profile-elena.jpg'
  },
  {
    id: crypto.randomUUID(),
    name: 'Luca',
    age: 29,
    gender: 'male',
    city: 'Bologna',
    distanceKm: 53,
    intent: 'networking',
    bio: 'Vinili, aperitivi e road trip last minute.',
    imageUrl: '/images/profile-luca.jpg'
  },
  {
    id: crypto.randomUUID(),
    name: 'Sam',
    age: 26,
    gender: 'nonBinary',
    city: 'Ferrara',
    distanceKm: 69,
    intent: 'friendship',
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
      isTyping: false,
      unreadCount: 1,
      createdAt: new Date(now.getTime() - 50 * FIFTEEN_MINUTES).toISOString(),
      matchedAt: new Date(now.getTime() - 60 * FIFTEEN_MINUTES).toISOString(),
      lastSeenAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      messages: [
        {
          id: crypto.randomUUID(),
          text: 'Ci vediamo dopo cena?',
          isMe: false,
          time: formatTime(new Date(now.getTime() - 40 * FIFTEEN_MINUTES)),
          createdAt: new Date(now.getTime() - 40 * FIFTEEN_MINUTES).toISOString(),
          deliveryState: 'delivered'
        },
        {
          id: crypto.randomUUID(),
          text: 'Perfetto, ci sono.',
          isMe: true,
          time: formatTime(new Date(now.getTime() - 35 * FIFTEEN_MINUTES)),
          createdAt: new Date(now.getTime() - 35 * FIFTEEN_MINUTES).toISOString(),
          readAt: new Date(now.getTime() - 34 * FIFTEEN_MINUTES).toISOString(),
          deliveryState: 'read'
        }
      ]
    },
    {
      id: crypto.randomUUID(),
      name: 'Marco',
      avatar: 'M',
      isOnline: false,
      isTyping: false,
      unreadCount: 0,
      createdAt: new Date(now.getTime() - 122 * FIFTEEN_MINUTES).toISOString(),
      matchedAt: new Date(now.getTime() - 126 * FIFTEEN_MINUTES).toISOString(),
      lastSeenAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      messages: [
        {
          id: crypto.randomUUID(),
          text: 'Allenamento domani mattina?',
          isMe: false,
          time: formatTime(new Date(now.getTime() - 120 * FIFTEEN_MINUTES)),
          createdAt: new Date(now.getTime() - 120 * FIFTEEN_MINUTES).toISOString(),
          deliveryState: 'delivered'
        }
      ]
    },
    {
      id: crypto.randomUUID(),
      name: 'Elena',
      avatar: 'E',
      isOnline: true,
      isTyping: false,
      unreadCount: 0,
      createdAt: new Date(now.getTime() - 22 * FIFTEEN_MINUTES).toISOString(),
      matchedAt: new Date(now.getTime() - 28 * FIFTEEN_MINUTES).toISOString(),
      lastSeenAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      messages: [
        {
          id: crypto.randomUUID(),
          text: 'Hai visto il nuovo film in sala?',
          isMe: false,
          time: formatTime(new Date(now.getTime() - 16 * FIFTEEN_MINUTES)),
          createdAt: new Date(now.getTime() - 16 * FIFTEEN_MINUTES).toISOString(),
          deliveryState: 'delivered'
        },
        {
          id: crypto.randomUUID(),
          text: 'Sabato potremmo andare insieme.',
          isMe: true,
          time: formatTime(new Date(now.getTime() - 15 * FIFTEEN_MINUTES)),
          createdAt: new Date(now.getTime() - 15 * FIFTEEN_MINUTES).toISOString(),
          deliveryState: 'sent'
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
