import { useQuery } from '@tanstack/react-query';

import { healthCheck } from './client';

type HealthResponse = { status?: string };

/** Estado del backend para el panel de sistemas. Un fallo de red o un status
 * distinto de 'ok' cuenta como caido (ok=false), nunca lanza hacia la UI. */
export function useServerHealth(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      try {
        const data = (await healthCheck()) as HealthResponse;
        return { ok: data?.status === 'ok' };
      } catch {
        // Red caida o 5xx: el indicador lo muestra como caido, no como error.
        return { ok: false };
      }
    },
    retry: false,
    refetchInterval: options?.refetchInterval ?? 15_000,
  });
}
