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

export function findCityByLabel(label: string): GeocodeResult | null {
  const normalized = label.trim().toLowerCase();
  const match = CITY_DATASET.find(
    (entry) =>
      `${entry.name}, ${entry.region}`.toLowerCase() === normalized ||
      entry.name.toLowerCase() === normalized
  );

  return match ? toResult(match) : null;
}

function toResult(entry: CityEntry): GeocodeResult {
  return {
    label: `${entry.name}, ${entry.region}`,
    city: entry.name,
    lat: entry.lat,
    lng: entry.lng
  };
}
