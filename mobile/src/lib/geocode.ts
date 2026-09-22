import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/api/client';

// Reverse geocoding via proxy del backend (GET /v1/geocode/reverse). La app YA
// NO llama a Nominatim directamente: era una peticion por fila del historial,
// rompia la politica de OSM (1 req/s) y filtraba la ubicacion del vehiculo a un
// tercero desde cada movil. El backend cachea, serializa a <=1 req/s y pone su
// User-Agent; ademas el staleTime del hook evita repetir mientras no cambie la
// posicion.
export type ReverseGeocode = {
  label: string; // calle + numero (o nombre del sitio)
  detail: string; // ciudad, pais — desambigua calles repetidas
};

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocode> {
  const res = await apiClient.get<ReverseGeocode>('/v1/geocode/reverse', {
    params: { lat, lon },
  });
  return res.data;
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
