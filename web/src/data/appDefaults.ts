import {
  MainEventConfig,
  MainEventInfo,
  MainEventSnapshot
} from '../types/models';

const EMPTY_EVENT_DATE = new Date(0).toISOString();

export function createEmptyMainEventConfig(): MainEventConfig {
  return {
    date: EMPTY_EVENT_DATE,
    title: '',
    maxParticipants: 1,
    maxPerGender: 1
  };
}

export function createEmptyMainEventInfo(): MainEventInfo {
  return {
    venue: '',
    address: '',
    timeLabel: '',
    contribution: '',
    contact: '',
    dressCode: '',
    description: '',
    registrationClosesAt: null,
    cancellationClosesAt: null,
    rules: []
  };
}

export function createEmptyMainEventSnapshot(): MainEventSnapshot {
  return {
    date: EMPTY_EVENT_DATE,
    title: '',
    maxParticipants: 0,
    maleLimit: 0,
    femaleLimit: 0,
    maleCount: 0,
    femaleCount: 0,
    waitingListCount: 0,
    totalCount: 0,
    remainingMaleSlots: 0,
    remainingFemaleSlots: 0
  };
}
