import { ProtocolError } from './protocol';

// Agregacion de la telemetria de energia v2 (payload.power) en cubos temporales.
// El dato ya se persiste crudo en device_events; aqui solo se resuelve la ventana
// y el bucketing. Whitelist estricta: nada del input llega al SQL sin pasar por
// aqui (trunc/stepInterval jamas son input crudo; tz se valida y la bindea PG).

export type BatteryBucket = 'hour' | 'day' | 'week';

export interface BatteryQueryInput {
  bucket?: string;
  from?: string; // ISO; basura -> ignorado (cae al default)
  to?: string; // ISO; basura -> ignorado (default = now)
  tz?: string;
}

export interface ResolvedBatteryQuery {
  from: Date;
  to: Date;
  trunc: 'hour' | 'day' | 'week'; // whitelist, nunca input crudo
  stepInterval: '1 hour' | '1 day' | '1 week';
  tz: string;
  bucket: BatteryBucket;
}

// Punto agregado de un bucket. avg redondeado a int (mV); null = sin lecturas
// validas en el bucket (offline = hueco, jamas interpolacion).
export interface BatteryPoint {
  bucketStart: string; // ISO (wall-clock local del tz pedido)
  vehicleMvAvg: number | null;
  vehicleMvMin: number | null;
  vehicleMvMax: number | null;
  reserveMvAvg: number | null;
  samples: number;
}

export interface BatteryHistoryDto {
  deviceId: string;
  bucket: BatteryBucket;
  tz: string;
  from: string;
  to: string;
  points: BatteryPoint[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Ventana default adaptativa por granularidad + interval de la serie continua.
const BUCKET_CONFIG: Record<
  BatteryBucket,
  { stepInterval: ResolvedBatteryQuery['stepInterval']; windowMs: number }
> = {
  hour: { stepInterval: '1 hour', windowMs: DAY_MS }, // 24h
  day: { stepInterval: '1 day', windowMs: 30 * DAY_MS }, // 30d
  week: { stepInterval: '1 week', windowMs: 84 * DAY_MS }, // 12 semanas
};

// IANA basica: acota basura antes de bindear; PG da el veredicto final.
const TZ_RE = /^[A-Za-z0-9_+\-/]+$/;

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function resolveBucket(raw?: string): BatteryBucket {
  return raw === 'hour' || raw === 'week' ? raw : 'day';
}

function resolveTz(raw?: string): string {
  return raw && raw.length <= 64 && TZ_RE.test(raw) ? raw : 'UTC';
}

/**
 * Resuelve la ventana y el bucketing de forma pura y determinista.
 * - bucket fuera de whitelist -> 'day'.
 * - from/to invalidos -> ausentes (to default = now, from default = to - ventana).
 * - Clamp de from a now - retentionDays (nunca consultar datos ya purgados).
 * - from < to o ProtocolError (el service lo traduce a 400).
 */
export function resolveBatteryQuery(
  input: BatteryQueryInput,
  now: Date,
  retentionDays: number,
): ResolvedBatteryQuery {
  const bucket = resolveBucket(input.bucket);
  const cfg = BUCKET_CONFIG[bucket];

  const to = parseDate(input.to) ?? now;
  let from = parseDate(input.from) ?? new Date(to.getTime() - cfg.windowMs);

  // Nunca por debajo del corte de retencion: esos eventos ya no existen.
  const earliest = new Date(now.getTime() - retentionDays * DAY_MS);
  if (from < earliest) {
    from = earliest;
  }

  if (!(from < to)) {
    throw new ProtocolError('from must be before to');
  }

  return {
    from,
    to,
    trunc: bucket,
    stepInterval: cfg.stepInterval,
    tz: resolveTz(input.tz),
    bucket,
  };
}
