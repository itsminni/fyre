interface CityEntry {
  name: string;
  lat: number;
  lng: number;
  region: string;
}

export interface GeocodeResult {
  label: string;
  city: string;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  geometry?: {
    coordinates?: unknown;
  };
  properties?: {
    city?: unknown;
    country?: unknown;
    county?: unknown;
    name?: unknown;
    state?: unknown;
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

const PHOTON_BASE_URL = (import.meta.env.VITE_PHOTON_BASE_URL ?? 'https://photon.komoot.io').replace(/\/$/, '');
const REMOTE_CACHE = new Map<string, GeocodeResult[]>();

const CITY_DATASET: CityEntry[] = [
  { name: 'Reggio Emilia', lat: 44.6983, lng: 10.6318, region: 'Emilia-Romagna' },
  { name: 'Parma', lat: 44.8015, lng: 10.3279, region: 'Emilia-Romagna' },
  { name: 'Modena', lat: 44.6471, lng: 10.9252, region: 'Emilia-Romagna' },
  { name: 'Bologna', lat: 44.4949, lng: 11.3426, region: 'Emilia-Romagna' },
  { name: 'Ferrara', lat: 44.8381, lng: 11.6198, region: 'Emilia-Romagna' },
  { name: 'Milano', lat: 45.4642, lng: 9.19, region: 'Lombardia' },
  { name: 'Torino', lat: 45.0703, lng: 7.6869, region: 'Piemonte' },
  { name: 'Firenze', lat: 43.7696, lng: 11.2558, region: 'Toscana' },
  { name: 'Roma', lat: 41.9028, lng: 12.4964, region: 'Lazio' },
  { name: 'Napoli', lat: 40.8518, lng: 14.2681, region: 'Campania' }
];

export function searchCities(query: string): GeocodeResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return CITY_DATASET.slice(0, 5).map(toResult);
  }

  return CITY_DATASET.filter(
    (entry) =>
      entry.name.toLowerCase().includes(normalized) ||
      entry.region.toLowerCase().includes(normalized)
  )
    .slice(0, 8)
    .map(toResult);
}

export async function searchCitiesRemote(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const normalized = query.trim();
  const cacheKey = normalized.toLowerCase();
  if (normalized.length < 2) {
    return [];
  }

  const cached = REMOTE_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    q: normalized,
    limit: '8'
  });
  params.append('layer', 'city');
  params.append('layer', 'locality');
  params.append('layer', 'district');

  const response = await fetch(`${PHOTON_BASE_URL}/api/?${params.toString()}`, { signal });
  if (!response.ok) {
    return [];
  }

  const data = await response.json() as PhotonResponse;
  const results = dedupeResults((data.features ?? []).map(toPhotonResult).filter(isGeocodeResult));
  REMOTE_CACHE.set(cacheKey, results);
  return results;
}

export async function resolveCityInput(
  input: string,
  knownResults: GeocodeResult[] = []
): Promise<GeocodeResult | null> {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const localMatch = findCityByLabel(trimmed);
  if (localMatch) {
    return localMatch;
  }

  const knownMatch = findCityInResults(trimmed, knownResults);
  if (knownMatch) {
    return knownMatch;
  }

  const remoteResults = await searchCitiesRemote(trimmed);
  const remoteMatch = findCityInResults(trimmed, remoteResults);
  return remoteMatch ?? remoteResults[0] ?? null;
}

export function findCityByLabel(label: string): GeocodeResult | null {
  const normalized = label.trim().toLowerCase();
  const match = CITY_DATASET.find(
    (entry) =>
      `${entry.name}, ${entry.region}`.toLowerCase() === normalized ||
      entry.name.toLowerCase() === normalized
  );

  return match ? toResult(match) : null;
}

export function findCityInResults(label: string, results: GeocodeResult[]): GeocodeResult | null {
  const normalized = normalizeLabel(label);
  const match = results.find(
    (entry) =>
      normalizeLabel(entry.label) === normalized ||
      normalizeLabel(entry.city) === normalized
  );

  return match ?? null;
}

export function mergeCityResults(...groups: GeocodeResult[][]): GeocodeResult[] {
  return dedupeResults(groups.flat()).slice(0, 8);
}

function toResult(entry: CityEntry): GeocodeResult {
  return {
    label: `${entry.name}, ${entry.region}`,
    city: entry.name,
    lat: entry.lat,
    lng: entry.lng
  };
}

function toPhotonResult(feature: PhotonFeature): GeocodeResult | null {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const [lng, lat] = coordinates;
  const name = asString(feature.properties?.name ?? feature.properties?.city);
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  const areaParts = [
    asString(feature.properties?.state),
    asString(feature.properties?.county),
    asString(feature.properties?.country)
  ].filter(isNonEmptyString);

  return {
    label: [name, ...areaParts].join(', '),
    city: name,
    lat,
    lng
  };
}

function dedupeResults(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  const deduped: GeocodeResult[] = [];

  for (const result of results) {
    const key = `${normalizeLabel(result.label)}:${result.lat.toFixed(4)}:${result.lng.toFixed(4)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(result);
  }

  return deduped;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isNonEmptyString(value: string | null): value is string {
  return Boolean(value);
}

function isGeocodeResult(value: GeocodeResult | null): value is GeocodeResult {
  return value !== null;
}
