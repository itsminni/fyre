import { describe, expect, it } from 'vitest';
import {
  createEmptyUser,
  getDisplayName,
  isProfileComplete,
  isValidEmail,
  normalizeUser,
  preferredGenderMatches,
  preferredGendersFromShowMe
} from './models';

describe('model helpers', () => {
  it('normalizes new users and derives preferred genders', () => {
    const user = createEmptyUser('  TEST@Example.COM ', 'secret');

    expect(user.email).toBe('test@example.com');
    expect(user.showMe).toBe('everyone');
    expect(user.preferredGenders).toEqual(['male', 'female', 'nonBinary', 'other']);
  });

  it('validates email and display name fallbacks', () => {
    expect(isValidEmail('person@example.com')).toBe(true);
    expect(isValidEmail('person@example')).toBe(false);
    expect(getDisplayName({ email: 'fallback@example.com', password: 'x', showMe: 'everyone' }))
      .toBe('fallback@example.com');
  });

  it('checks profile completion requirements', () => {
    const completeUser = normalizeUser({
      email: 'alex@example.com',
      password: 'secret',
      firstName: 'Alex',
      city: 'Roma',
      bio: 'Profilo completo',
      birthDate: '1990-01-01',
      gender: 'male',
      orientation: 'straight',
      showMe: 'women',
      preferredGenders: ['female'],
      latitude: 41.9028,
      longitude: 12.4964
    });

    expect(isProfileComplete(completeUser)).toBe(true);
    expect(isProfileComplete({ ...completeUser, latitude: undefined })).toBe(false);
  });

  it('matches preferred genders consistently', () => {
    expect(preferredGendersFromShowMe('men')).toEqual(['male']);
    expect(preferredGenderMatches(undefined, 'women', 'female')).toBe(true);
    expect(preferredGenderMatches(['male'], 'everyone', 'female')).toBe(false);
  });
});
