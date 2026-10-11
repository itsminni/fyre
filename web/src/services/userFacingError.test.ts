import { describe, expect, it } from 'vitest';
import { AppwriteServiceError } from './appwriteError';
import { mapAppwriteError } from './userFacingError';

describe('localized errors', () => {
  it('distinguishes profile conflicts from existing accounts', () => {
    const conflict = new AppwriteServiceError('Internal detail', 409);
    expect(mapAppwriteError(conflict, '', 'en')).toBe('The data has changed. Refresh and try again.');
    expect(mapAppwriteError(conflict, '', 'en', true)).toBe('An account with this email already exists.');
  });
  it('translates connectivity and upload errors without exposing server details', () => {
    expect(mapAppwriteError(new TypeError('Secret endpoint'), '', 'en')).not.toContain('Secret');
    expect(mapAppwriteError(new AppwriteServiceError('Internal detail', 400, 'upload_size'), '', 'en')).toBe('The file is empty or exceeds the size limit.');
    expect(mapAppwriteError(new AppwriteServiceError('Internal detail', 400, 'upload_format'), '', 'it')).toBe('Formato del file non supportato.');
  });
});
