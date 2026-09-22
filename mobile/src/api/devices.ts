import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from './client';

export type DeviceState = 'ARMED' | 'TRIP' | 'WORKSHOP';

export type Device = {
  id: string;
  name: string;
  ownerId: string;
  state: DeviceState;
  lastSeq: number;
  lastSeenAt: string | null;
  lastLat: number | null;
  lastLon: number | null;
  lastFixAt: string | null;
  lastBatteryMv: number | null;
  createdAt: string;
  updatedAt: string;
  trips?: TripAuthorization[];
};

export type DevicePosition = {
  lat: number;
  lon: number;
  fixAtUtc: string;
  observedAt: string;
  kind: string;
};

export type TripAuthorization = {
  id: string;
  deviceId: string;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
};

export type DeviceEvent = {
  id: string;
  deviceId: string;
  seq: number;
  kind: 'suspected_movement' | 'battery_low' | 'power_lost' | 'heartbeat' | 'gnss_fix';
  observedAt: string;
  receivedAt: string;
  payload: {
    batteryMv: number | null;
    position: { lat: number; lon: number; fixAtUtc: string } | null;
  } | null;
};

export const deviceKeys = {
  all: ['devices'] as const,
  events: (deviceId: string) => ['devices', deviceId, 'events'] as const,
  positions: (deviceId: string) => ['devices', deviceId, 'positions'] as const,
};

export function useDevices(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: deviceKeys.all,
    queryFn: async () => {
      const response = await apiClient.get<Device[]>('/v1/devices');
      return response.data;
    },
    refetchInterval: options?.refetchInterval,
  });
}

export function useDeviceEvents(
  deviceId: string | undefined,
  limit = 50,
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: deviceKeys.events(deviceId ?? 'none'),
    queryFn: async () => {
      const response = await apiClient.get<DeviceEvent[]>(`/v1/devices/${deviceId}/events`, {
        params: { limit },
      });
      return response.data;
    },
    enabled: Boolean(deviceId),
    refetchInterval: options?.refetchInterval,
  });
}

export function useDevicePositions(
  deviceId: string | undefined,
  limit = 50,
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: deviceKeys.positions(deviceId ?? 'none'),
    queryFn: async () => {
      const response = await apiClient.get<DevicePosition[]>(
        `/v1/devices/${deviceId}/positions`,
        { params: { limit } },
      );
      return response.data;
    },
    enabled: Boolean(deviceId),
    refetchInterval: options?.refetchInterval,
  });
}

// Optimistic: cambia el estado del dispositivo en cache al instante para que el
// tap no espere el roundtrip (evita el "salto" perceptible). Rollback si falla.
function useTripToggle(deviceId: string | undefined, path: string, nextState: DeviceState) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/v1/devices/${deviceId}/${path}`);
      return response.data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: deviceKeys.all });
      const previous = queryClient.getQueryData<Device[]>(deviceKeys.all);
      queryClient.setQueryData<Device[]>(deviceKeys.all, (old) =>
        old?.map((d) => (d.id === deviceId ? { ...d, state: nextState } : d)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(deviceKeys.all, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  });
}

export function useStartTrip(deviceId: string | undefined) {
  return useTripToggle(deviceId, 'trip/start', 'TRIP');
}

export function useEndTrip(deviceId: string | undefined) {
  return useTripToggle(deviceId, 'trip/end', 'ARMED');
}
