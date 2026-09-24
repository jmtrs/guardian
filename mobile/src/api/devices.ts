import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from './client';

export type DeviceState = 'ARMED' | 'TRIP' | 'WORKSHOP';
export type TripState = 'IDLE' | 'REQUESTED' | 'CONFIRMED';
export type PowerSource = 'vehicle' | 'reserve' | 'unknown';

/** Espejo de PowerTelemetry del backend (protocol v2). */
export type PowerTelemetry = {
  vehicleMv: number;
  reserveMv: number | null;
  source: PowerSource;
};

export type Device = {
  id: string;
  name: string;
  // Null solo antes del claim; los devices que llegan a la app ya tienen dueño.
  ownerId: string | null;
  state: DeviceState;
  tripState: TripState;
  workshopUntil: string | null;
  lastSeq: number;
  lastSeenAt: string | null;
  lastLat: number | null;
  lastLon: number | null;
  lastFixAt: string | null;
  /** Telemetria de energia (protocolo v2): rail del vehiculo, reserva
   * interna y cual alimenta ahora. Siempre presente tras el primer evento. */
  lastVehicleMv: number | null;
  lastReserveMv: number | null;
  lastPowerSource: PowerSource | null;
  createdAt: string;
  updatedAt: string;
  trips?: TripAuthorization[];
};

export type IncidentKind = 'suspected_movement' | 'power_lost';
export type IncidentState = 'OPEN' | 'ACKNOWLEDGED' | 'CLOSED';

export type Incident = {
  id: string;
  deviceId: string;
  kind: IncidentKind;
  state: IncidentState;
  openedAt: string;
  acknowledgedAt: string | null;
  closedAt: string | null;
  openedByEventSeq: number;
  /** Evento que cerro por recuperacion observada (null: cierre manual/viaje). */
  closedByEventSeq: number | null;
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
    power: PowerTelemetry;
    /** Solo gnss_fix: comando LOCATE_NOW que pidio el fix. */
    commandId?: string | null;
    position: { lat: number; lon: number; fixAtUtc: string } | null;
  } | null;
};

// ============ Canal de comandos (PR2): LOCATE_NOW ============

export type CommandType = 'LOCATE_NOW';
export type CommandStatus = 'PENDING' | 'ACKED' | 'EXPIRED';

export type Command = {
  id: string;
  deviceId: string;
  type: CommandType;
  status: CommandStatus;
  createdAt: string;
  expiresAt: string;
  ackedAt: string | null;
  resultEventId: string | null;
};

// ============ Historial de energia (v2) ============

export type BatteryBucket = 'hour' | 'day' | 'week';

/** Espejo de BatteryPoint del backend. null = sin lecturas validas en el bucket
 * (offline = hueco, jamas interpolacion). */
export type BatteryPoint = {
  bucketStart: string;
  vehicleMvAvg: number | null;
  vehicleMvMin: number | null;
  vehicleMvMax: number | null;
  reserveMvAvg: number | null;
  samples: number;
};

/** Espejo del DTO estrecho: solo agregados de bateria, nunca payload/position. */
export type BatteryHistory = {
  deviceId: string;
  bucket: BatteryBucket;
  tz: string;
  from: string;
  to: string;
  points: BatteryPoint[];
};

export const deviceKeys = {
  all: ['devices'] as const,
  events: (deviceId: string) => ['devices', deviceId, 'events'] as const,
  positions: (deviceId: string) => ['devices', deviceId, 'positions'] as const,
  incidents: (deviceId: string) => ['devices', deviceId, 'incidents'] as const,
  commands: (deviceId: string) => ['devices', deviceId, 'commands'] as const,
  battery: (deviceId: string, bucket: BatteryBucket) =>
    ['devices', deviceId, 'battery', bucket] as const,
};

/** Acota el rastro de posiciones a un contexto: incidente (desde que abrio)
 * o viaje (entre startedAt/endedAt). El backend rechaza ids ajenos. */
export type PositionsScope = { incidentId?: string; tripId?: string };

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

// Historial paginado por cursor (pantalla de eventos). Primera pagina = los
// `pageSize` mas recientes; el scroll pide la siguiente con el seq del ultimo
// visto. Pull-to-refresh recarga solo la primera pagina (novedades arriba), no
// vuelve a bajar todo lo ya cargado. Distinto de useDeviceEvents (lista corta
// fija del dashboard).
export function useDeviceEventsInfinite(deviceId: string | undefined, pageSize = 20) {
  return useInfiniteQuery({
    queryKey: [...deviceKeys.events(deviceId ?? 'none'), 'infinite', pageSize],
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<DeviceEvent[]>(`/v1/devices/${deviceId}/events`, {
        params: { limit: pageSize, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      return response.data;
    },
    initialPageParam: undefined as number | undefined,
    // Hay mas si la ultima pagina vino llena; el cursor es el seq del ultimo.
    getNextPageParam: (lastPage) =>
      lastPage.length === pageSize ? lastPage[lastPage.length - 1].seq : undefined,
    enabled: Boolean(deviceId),
  });
}

export function useDevicePositions(
  deviceId: string | undefined,
  limit = 50,
  options?: { refetchInterval?: number },
  scope?: PositionsScope,
) {
  const scopeKey = scope?.incidentId ?? scope?.tripId ?? 'all';
  return useQuery({
    queryKey: [...deviceKeys.positions(deviceId ?? 'none'), scopeKey],
    queryFn: async () => {
      const response = await apiClient.get<DevicePosition[]>(
        `/v1/devices/${deviceId}/positions`,
        { params: { limit, ...(scope?.incidentId && { incidentId: scope.incidentId }), ...(scope?.tripId && { tripId: scope.tripId }) } },
      );
      return response.data;
    },
    enabled: Boolean(deviceId),
    refetchInterval: options?.refetchInterval,
  });
}

// Zona del dispositivo: para que Dia/Semana cuadren con el reloj del usuario
// (el backend bucketea en esta tz). Fallback UTC si el runtime no la expone.
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Historial de energia agregado por bucket. Serie continua (buckets vacios con
// samples:0). Mismo idiom que useDevicePositions.
export function useBatteryHistory(
  deviceId: string | undefined,
  bucket: BatteryBucket,
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: deviceKeys.battery(deviceId ?? 'none', bucket),
    queryFn: async () => {
      const response = await apiClient.get<BatteryHistory>(`/v1/devices/${deviceId}/battery`, {
        params: { bucket, tz: deviceTimeZone() },
      });
      return response.data;
    },
    enabled: Boolean(deviceId),
    refetchInterval: options?.refetchInterval,
  });
}

// Incidentes de seguridad: alerta persistente (no derivada del ultimo evento).
export function useIncidents(deviceId: string | undefined, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: deviceKeys.incidents(deviceId ?? 'none'),
    queryFn: async () => {
      const response = await apiClient.get<Incident[]>(`/v1/devices/${deviceId}/incidents`);
      return response.data;
    },
    enabled: Boolean(deviceId),
    refetchInterval: options?.refetchInterval,
  });
}

// Historial de comandos (LOCATE_NOW). Mientras haya un PENDING vivo el refetch
// es rapido: es la unica forma de ver el ACK del dispositivo (llega como fix).
export function useDeviceCommands(deviceId: string | undefined, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: deviceKeys.commands(deviceId ?? 'none'),
    queryFn: async () => {
      const response = await apiClient.get<Command[]>(`/v1/devices/${deviceId}/commands`);
      return response.data;
    },
    enabled: Boolean(deviceId),
    refetchInterval: options?.refetchInterval,
  });
}

// "Actualizar ubicacion": pide un LOCATE_NOW. El backend reutiliza un PENDING
// vivo (idempotente), asi que doubles-tap no spamea comandos. El ACK no ocurre
// aqui: llega cuando el dispositivo manda el gnss_fix con commandId; invalidamos
// devices+commands para que el polling los recoja.
export function useRequestLocate(deviceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<Command>(`/v1/devices/${deviceId}/commands/locate`);
      return response.data;
    },
    onSettled: () => {
      if (deviceId) {
        queryClient.invalidateQueries({ queryKey: deviceKeys.commands(deviceId) });
        queryClient.invalidateQueries({ queryKey: deviceKeys.all });
      }
    },
  });
}

// Reclamar un dispositivo con su codigo de claim (presencia fisica en
// software). Exito -> invalida la lista para que el device recien ligado
// aparezca. El backend rechaza codigo invalido/caducado/ya usado (404 uniforme).
export function useClaimDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const response = await apiClient.post<Device>('/v1/devices/claim', { code });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  });
}

// "Revisado": OPEN -> ACKNOWLEDGED. NO desarma. Refresca incidentes tras el ack.
export function useAcknowledgeIncident(deviceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (incidentId: string) => {
      const response = await apiClient.post(`/v1/incidents/${incidentId}/acknowledge`);
      return response.data;
    },
    onSettled: () => {
      if (deviceId) queryClient.invalidateQueries({ queryKey: deviceKeys.incidents(deviceId) });
    },
  });
}

// Optimistic: cambia el estado del dispositivo en cache al instante para que el
// tap no espere el roundtrip (evita el "salto" perceptible). Rollback si falla.
// El tripState optimista significa "solicitud iniciada" (REQUESTED al arrancar):
// el estado fisico final lo confirma el backend en el roundtrip.
function useTripToggle(
  deviceId: string | undefined,
  path: string,
  nextState: DeviceState,
  nextTripState: TripState,
) {
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
        old?.map((d) =>
          d.id === deviceId ? { ...d, state: nextState, tripState: nextTripState } : d,
        ),
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
  // Optimista: SOLICITANDO (REQUESTED). El backend responde CONFIRMED.
  return useTripToggle(deviceId, 'trip/start', 'TRIP', 'REQUESTED');
}

export function useEndTrip(deviceId: string | undefined) {
  return useTripToggle(deviceId, 'trip/end', 'ARMED', 'IDLE');
}
