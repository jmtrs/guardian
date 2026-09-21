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
  createdAt: string;
  updatedAt: string;
  trips?: TripAuthorization[];
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
};

export function useDevices() {
  return useQuery({
    queryKey: deviceKeys.all,
    queryFn: async () => {
      const response = await apiClient.get<Device[]>('/v1/devices');
      return response.data;
    },
  });
}

export function useDeviceEvents(deviceId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: deviceKeys.events(deviceId ?? 'none'),
    queryFn: async () => {
      const response = await apiClient.get<DeviceEvent[]>(`/v1/devices/${deviceId}/events`, {
        params: { limit },
      });
      return response.data;
    },
    enabled: Boolean(deviceId),
  });
}

export function useStartTrip(deviceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/v1/devices/${deviceId}/trip/start`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  });
}

export function useEndTrip(deviceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/v1/devices/${deviceId}/trip/end`);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  });
}
