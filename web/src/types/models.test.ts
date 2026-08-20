import { describe, expect, it } from 'vitest';
import {
  getDisplayName,
  isProfileComplete,
  isValidEmail,
  normalizeUser,
  preferredGenderMatches
} from './models';

describe('model helpers', () => {
  it('normalizes new users without retaining unknown fields', () => {
    const candidateUser = {
      email: '  TEST@Example.COM ',
      password: 'not-part-of-the-profile'
    };
    const user = normalizeUser(candidateUser);

    expect(user.email).toBe('test@example.com');
    expect(user.preferredGenders).toEqual([]);
    expect(user).not.toHaveProperty('password');
  });

  it('validates email and display name fallbacks', () => {
    expect(isValidEmail('person@example.com')).toBe(true);
    expect(isValidEmail('person@example')).toBe(false);
    expect(getDisplayName({ email: 'fallback@example.com' }))
      .toBe('fallback@example.com');
  });

  it('checks profile completion requirements', () => {
    const completeUser = normalizeUser({
      email: 'alex@example.com',
      firstName: 'Alex',
      city: 'Roma',
      bio: 'Profilo completo',
      birthDate: '1990-01-01',
      gender: 'male',
      orientation: 'straight',
      preferredGenders: ['female'],
      latitude: 41.9028,
      longitude: 12.4964
    });

    expect(isProfileComplete(completeUser)).toBe(true);
    expect(isProfileComplete({ ...completeUser, latitude: undefined, longitude: undefined })).toBe(true);
    expect(isProfileComplete({ ...completeUser, orientation: undefined })).toBe(false);
    expect(isProfileComplete({ ...completeUser, preferredGenders: [] })).toBe(false);
  });

  it('matches preferred genders consistently', () => {
    expect(preferredGenderMatches(undefined, 'female')).toBe(true);
    expect(preferredGenderMatches([], 'female')).toBe(true);
    expect(preferredGenderMatches(['male'], 'female')).toBe(false);
  });
});
