import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findCityByLabel,
  findCityInResults,
  mergeCityResults,
  resolveCityInput,
  searchCities,
  searchCitiesRemote
} from './geocode';

describe('geocode helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the local Italian suggestions available', () => {
    expect(searchCities('reg')[0]).toMatchObject({
      city: 'Reggio Emilia',
      label: 'Reggio Emilia, Emilia-Romagna'
    });
    expect(findCityByLabel('Roma')).toMatchObject({ city: 'Roma' });
  });

  it('matches selected remote labels without forcing partial manual input', () => {
    const suggestions = [
      { city: 'Paris', label: 'Paris, Ile-de-France, France', lat: 48.8566, lng: 2.3522 }
    ];

    expect(findCityInResults('Paris, Ile-de-France, France', suggestions)).toMatchObject({ city: 'Paris' });
    expect(findCityInResults('Par', suggestions)).toBeNull();
  });

  it('deduplicates merged local and remote suggestions', () => {
    const local = [{ city: 'Roma', label: 'Roma, Lazio', lat: 41.9028, lng: 12.4964 }];
    const remote = [
      { city: 'Roma', label: 'Roma, Lazio', lat: 41.9028, lng: 12.4964 },
      { city: 'Rome', label: 'Rome, Georgia, United States', lat: 34.257, lng: -85.1647 }
    ];

    expect(mergeCityResults(local, remote)).toHaveLength(2);
  });

  it('maps Photon city results into app suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('lang')).toBeNull();

      return {
        ok: true,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: [2.3522, 48.8566] },
              properties: {
                name: 'Paris',
                state: 'Ile-de-France',
                country: 'France'
              }
            }
          ]
        })
      };
    }));

    await expect(searchCitiesRemote('Paris')).resolves.toEqual([
      {
        city: 'Paris',
        label: 'Paris, Ile-de-France, France',
        lat: 48.8566,
        lng: 2.3522
      }
    ]);
  });

  it('rejects manual city input when the geocoder has no result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ features: [] })
    })));

    await expect(resolveCityInput('xxxyyyzzz')).resolves.toBeNull();
  });
});
