import { describe, expect, it } from 'vitest';
import { MainEventConfig, MainEventState, User } from '../types/models';
import {
  cancelMainEventRegistration,
  getFlags,
  getSnapshot,
  registerForMainEvent,
  removeUserFromMainEvent,
  willLoseMainEventRegistrations
} from './eventEngine';

const config: MainEventConfig = {
  title: 'Fyre Party',
  date: '2030-05-20T20:00:00.000Z',
  maxParticipants: 4,
  maxPerGender: 1
};

function baseState(): MainEventState {
  return {
    participants: [{ email: 'marco@example.com', gender: 'male' }],
    waitingList: [{ email: 'luca@example.com', gender: 'male' }],
    history: []
  };
}

function user(patch: Partial<User>): User {
  return {
    email: 'giulia@example.com',
    password: 'secret',
    showMe: 'everyone',
    ...patch
  };
}

describe('event engine', () => {
  it('builds event snapshots and registration flags', () => {
    const state = baseState();

    expect(getSnapshot(state, config)).toMatchObject({
      totalCount: 1,
      maleCount: 1,
      femaleCount: 0,
      waitingListCount: 1,
      remainingMaleSlots: 0,
      remainingFemaleSlots: 1
    });
    expect(getFlags(state, 'marco@example.com')).toEqual({ isRegistered: true, isWaiting: false });
    expect(getFlags(state, 'luca@example.com')).toEqual({ isRegistered: false, isWaiting: true });
  });

  it('confirms eligible users and waitlists users when gender capacity is full', () => {
    const femaleResult = registerForMainEvent(
      baseState(),
      user({ gender: 'female', orientation: 'straight' }),
      config,
      new Date('2030-05-01T12:00:00.000Z')
    );

    expect(femaleResult.isError).toBe(false);
    expect(femaleResult.nextState.participants).toContainEqual({
      email: 'giulia@example.com',
      gender: 'female'
    });

    const maleResult = registerForMainEvent(
      baseState(),
      user({ email: 'andrea@example.com', gender: 'male', orientation: 'straight' }),
      config,
      new Date('2030-05-01T12:00:00.000Z')
    );

    expect(maleResult.isError).toBe(false);
    expect(maleResult.nextState.waitingList).toContainEqual({
      email: 'andrea@example.com',
      gender: 'male'
    });
  });

  it('cancels registrations and promotes compatible waitlisted users', () => {
    const nextState = removeUserFromMainEvent(baseState(), 'marco@example.com', config);

    expect(nextState.participants).toContainEqual({ email: 'luca@example.com', gender: 'male' });
    expect(nextState.waitingList).toEqual([]);
    expect(nextState.history.map((item) => item.status)).toEqual(['cancelled', 'promoted']);
  });

  it('blocks late cancellation and detects profile changes that affect registrations', () => {
    const state = baseState();
    const registeredUser = user({
      email: 'marco@example.com',
      gender: 'male',
      orientation: 'straight'
    });

    const result = cancelMainEventRegistration(
      state,
      registeredUser,
      config,
      new Date('2030-05-19T12:00:00.000Z')
    );

    expect(result.isError).toBe(true);
    expect(willLoseMainEventRegistrations(state, registeredUser, 'female', 'straight')).toBe(true);
    expect(willLoseMainEventRegistrations(state, registeredUser, 'male', 'straight')).toBe(false);
  });
});
