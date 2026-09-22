import { useQuery } from '@tanstack/react-query';

// Reverse geocoding libre via Nominatim (OpenStreetMap). Sin API key.
// Politica de uso: 1 req/s y User-Agent identificable — respetado por el
// staleTime del hook (no repite mientras la posicion no cambie).
export type ReverseGeocode = {
  label: string; // calle + numero (o nombre del sitio)
  detail: string; // ciudad, pais — desambigua calles repetidas
};

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocode> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'GuardianApp/1.0 (anti-theft)',
      'Accept-Language': 'es',
    },
  });
  if (!res.ok) {
    throw new Error(`geocode ${res.status}`);
  }
  const json = (await res.json()) as {
    name?: string;
    display_name?: string;
    address?: Record<string, string>;
  };
  const a = json.address ?? {};
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? '';
  const num = a.house_number ? ` ${a.house_number}` : '';
  const city =
    a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? '';
  const country = a.country ?? '';
  const label = road ? `${road}${num}` : json.name || city || '';
  const detail = [city, country].filter(Boolean).join(', ');
  return { label, detail: detail || json.display_name || '' };
}

export function useReverseGeocode(lat?: number | null, lon?: number | null) {
  return useQuery({
    queryKey: ['geocode', lat?.toFixed(4), lon?.toFixed(4)],
    queryFn: () => reverseGeocode(lat!, lon!),
    enabled: lat != null && lon != null,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
