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

function makeProfileArtwork(
  label: string,
  title: string,
  subtitle: string,
  startColor: string,
  endColor: string
): string {
  const initials = label.slice(0, 1).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 920">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      </defs>
      <rect width="720" height="920" fill="url(#g)" />
      <circle cx="590" cy="190" r="150" fill="rgba(255,255,255,0.12)" />
      <circle cx="150" cy="760" r="180" fill="rgba(255,255,255,0.10)" />
      <text x="72" y="126" font-family="Arial, sans-serif" font-size="42" fill="rgba(255,255,255,0.78)">${title}</text>
      <text x="72" y="180" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.72)">${subtitle}</text>
      <text x="78" y="764" font-family="Arial, sans-serif" font-size="300" font-weight="700" fill="rgba(255,255,255,0.22)">${initials}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
    imageUrl: makeProfileArtwork('Giulia', 'Live music', 'Caffe and city lights', '#ff8a5c', '#9b2f7f'),
    photos: [
      makeProfileArtwork('Giulia', 'Live music', 'Caffe and city lights', '#ff8a5c', '#9b2f7f'),
      makeProfileArtwork('Giulia', 'Golden hour', 'Aperitivo energy', '#ffb86f', '#f43f5e')
    ],
    compatibilityScore: 93,
    commonInterests: ['Concerti', 'Weekend fuori porta', 'Aperitivi'],
    relationshipState: 'none'
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
    imageUrl: makeProfileArtwork('Marco', 'Road trip', 'Moto and cocktail bar', '#5b8cff', '#14213d'),
    photos: [
      makeProfileArtwork('Marco', 'Road trip', 'Moto and cocktail bar', '#5b8cff', '#14213d'),
      makeProfileArtwork('Marco', 'Training day', 'Sunrise run', '#3bb2b8', '#1d3557')
    ],
    compatibilityScore: 78,
    commonInterests: ['Sport', 'Viaggi', 'Cocktail bar'],
    relationshipState: 'none'
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
    imageUrl: makeProfileArtwork('Elena', 'Cinema night', 'Podcast and moonwalks', '#9c89ff', '#312244'),
    photos: [
      makeProfileArtwork('Elena', 'Cinema night', 'Podcast and moonwalks', '#9c89ff', '#312244'),
      makeProfileArtwork('Elena', 'Late talks', 'Books and city corners', '#d16ba5', '#5f0f40')
    ],
    compatibilityScore: 88,
    commonInterests: ['Cinema', 'Podcast', 'Passeggiate'],
    relationshipState: 'none'
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
    imageUrl: makeProfileArtwork('Luca', 'Vinyl session', 'Road trip planner', '#ffb703', '#9b2226'),
    photos: [
      makeProfileArtwork('Luca', 'Vinyl session', 'Road trip planner', '#ffb703', '#9b2226'),
      makeProfileArtwork('Luca', 'Afterwork', 'Jazz and orange lights', '#fb8500', '#6d597a')
    ],
    compatibilityScore: 74,
    commonInterests: ['Aperitivi', 'Road trip'],
    relationshipState: 'none'
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
    imageUrl: makeProfileArtwork('Sam', 'Gallery day', 'Playlists and honest talks', '#6dd3ce', '#3a506b'),
    photos: [
      makeProfileArtwork('Sam', 'Gallery day', 'Playlists and honest talks', '#6dd3ce', '#3a506b'),
      makeProfileArtwork('Sam', 'Studio session', 'Moodboard and coffee', '#84dcc6', '#2d3142')
    ],
    compatibilityScore: 84,
    commonInterests: ['Arte', 'Playlist', 'Talk sinceri'],
    relationshipState: 'none'
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
