import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Port fiel de guardian/protocol.py (envelope firmado del dispositivo).
 * El dispositivo envia JSON canonico + HMAC-SHA256 sobre los bytes exactos.
 * Los tests espejan tests/test_protocol.py.
 */

export const ALLOWED_TYPES = [
  'suspected_movement',
  'battery_low',
  'power_lost',
  'heartbeat',
  'gnss_fix',
] as const;

export type EventKind = (typeof ALLOWED_TYPES)[number];

export const MAX_BODY = 4096;

export interface GpsPosition {
  lat: number;
  lon: number;
  fixAtUtc: string;
}

export interface GuardianEvent {
  schemaVersion: number;
  deviceId: string;
  sequence: number;
  kind: EventKind;
  observedAtUtc: string;
  batteryMv?: number | null;
  position?: GpsPosition | null;
}

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export function sign(body: Buffer, key: Buffer): string {
  return createHmac('sha256', key).update(body).digest('hex');
}

export function verify(body: Buffer, key: Buffer, signature: string): boolean {
  if (typeof signature !== 'string' || signature.length !== 64) {
    return false;
  }
  const expected = sign(body, key);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ISO 8601 con zona horaria obligatoria (Z o ±HH:MM). fromisoformat de Python
// acepta ambos; aqui exigimos lo mismo: nunca aceptar hora local ambigua.
const ISO_TZ_RE = /(?:Z|[+-]\d{2}:\d{2})$/;

function parseTzTimestamp(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length > 64 || !ISO_TZ_RE.test(value)) {
    throw new ProtocolError(`Bad ${what}`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new ProtocolError(`Bad ${what}`);
  }
  return value;
}

export function decodeEvent(body: Buffer, expectedDeviceId: string): GuardianEvent {
  if (body.length > MAX_BODY) {
    throw new ProtocolError('Event too large');
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ProtocolError('Invalid JSON');
  }

  if (data.schemaVersion !== 1) {
    throw new ProtocolError('Unsupported event version');
  }
  if (data.deviceId !== expectedDeviceId) {
    throw new ProtocolError('Device mismatch');
  }
  const sequence: unknown = data.sequence;
  // Number.isInteger(false) === false: cubre el caso `sequence: true` de Python.
  if (
    typeof sequence !== 'number' ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence >= 2 ** 63
  ) {
    throw new ProtocolError('Invalid sequence');
  }
  const kind: unknown = data.kind;
  if (typeof kind !== 'string' || !ALLOWED_TYPES.includes(kind as EventKind)) {
    throw new ProtocolError('Unknown event type');
  }

  const observedAtUtc = parseTzTimestamp(data.observedAtUtc, 'timestamp');

  const rawBattery: unknown = data.batteryMv ?? null;
  if (
    rawBattery !== null &&
    (typeof rawBattery !== 'number' ||
      !Number.isInteger(rawBattery) ||
      rawBattery < 0 ||
      rawBattery > 60000)
  ) {
    throw new ProtocolError('Invalid battery reading');
  }
  const battery = rawBattery as number | null;

  let position: GpsPosition | null = null;
  const rawPosition: unknown = data.position ?? null;
  if (rawPosition !== null) {
    if (typeof rawPosition !== 'object' || Array.isArray(rawPosition)) {
      throw new ProtocolError('Invalid position');
    }
    const pos = rawPosition as Record<string, unknown>;
    const keys = Object.keys(pos).sort();
    if (keys.join(',') !== 'fixAtUtc,lat,lon') {
      throw new ProtocolError('Invalid position');
    }
    const { lat, lon } = pos;
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new ProtocolError('Invalid coordinates');
    }
    const fixAtUtc = parseTzTimestamp(pos.fixAtUtc, 'fix timestamp');
    position = { lat, lon, fixAtUtc };
  }

  return {
    schemaVersion: 1,
    deviceId: expectedDeviceId,
    sequence,
    kind: kind as EventKind,
    observedAtUtc,
    batteryMv: battery,
    position,
  };
}
