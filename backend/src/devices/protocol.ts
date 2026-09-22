import { createHmac, hkdfSync, timingSafeEqual } from 'crypto';

/**
 * Envelope firmado del dispositivo: JSON canonico + HMAC-SHA256 sobre los
 * bytes exactos del cuerpo.
 *
 * schemaVersion 2 es el UNICO contrato: `commandId` (correlacion LOCATE_NOW ->
 * fix, solo en gnss_fix) y telemetria de energia `power` {vehicleMv,
 * reserveMv?, source} OBLIGATORIA en todo evento. No hay versiones anteriores
 * que mantener — sistema nuevo, un solo contrato, fail-closed sobre lo demas.
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

export type PowerSource = 'vehicle' | 'reserve' | 'unknown';

// Semantica fisica de la telemetria: bateria del VEHICULO (cualquier tipo —
// turismo, moto, bici, avion...) vs bateria de reserva interna del Guardian,
// y cual alimenta ahora. source='unknown' es honestidad del firmware cuando
// no puede determinar el rail activo — nunca se inventa la procedencia.
export interface PowerTelemetry {
  vehicleMv: number;
  reserveMv: number | null;
  source: PowerSource;
}

export interface GuardianEvent {
  schemaVersion: number;
  deviceId: string;
  sequence: number;
  kind: EventKind;
  observedAtUtc: string;
  /** Obligatorio: el dispositivo siempre mide sus rails antes de emitir. */
  power: PowerTelemetry;
  /** Solo gnss_fix: correlaciona el fix con el comando que lo pidio. */
  commandId?: string | null;
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

// ============ Derivacion de claves por contexto (PR2) ============
// Una clave por canal, jamas reutilizada (docs v0.6 S6 R1). K_root es el
// secreto del dispositivo; cada contexto deriva via HKDF-SHA256 con
// salt=deviceId e info propia. El evento nunca firma con la clave del canal
// de comandos ni con la de BLE, y viceversa.

export type KeyContext = 'event' | 'command' | 'ble';

const KEY_INFO: Record<KeyContext, string> = {
  event: 'guardian/event/v1',
  command: 'guardian/command/v1',
  ble: 'guardian/ble/v1',
};

/** K_context = HKDF-SHA256(K_root, salt=deviceId, info="guardian/<ctx>/v1"). */
export function deriveKey(rootSecretHex: string, deviceId: string, context: KeyContext): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(rootSecretHex, 'hex'),
      Buffer.from(deviceId, 'utf8'),
      Buffer.from(KEY_INFO[context], 'utf8'),
      32,
    ),
  );
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

// ISO 8601 con zona horaria obligatoria (Z o ±HH:MM): nunca aceptar hora
// local ambigua.
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

  // v2 es la unica version. Cualquier otra (1 incluida) es contrato
  // desconocido: fail-closed, sin "mejor esfuerzo".
  const schemaVersion = data.schemaVersion;
  if (schemaVersion !== 2) {
    throw new ProtocolError('Unsupported event version');
  }
  if (data.deviceId !== expectedDeviceId) {
    throw new ProtocolError('Device mismatch');
  }
  const sequence: unknown = data.sequence;
  // Number.isInteger(false) === false: `sequence: true` no pasa.
  // Techo 2^31: la columna Prisma es int4 y
  // JSON.parse pierde precision sobre 2^53. Un contador que llegue a 2^31
  // (siglos de heartbeats) indica un dispositivo roto: 400 es respuesta segura.
  if (
    typeof sequence !== 'number' ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence >= 2 ** 31
  ) {
    throw new ProtocolError('Invalid sequence');
  }
  const kind: unknown = data.kind;
  if (typeof kind !== 'string' || !ALLOWED_TYPES.includes(kind as EventKind)) {
    throw new ProtocolError('Unknown event type');
  }

  const observedAtUtc = parseTzTimestamp(data.observedAtUtc, 'timestamp');

  // Energia: power OBLIGATORIO. batteryMv ya no existe en el contrato — si
  // aparece (aunque venga null, como hacia el firmware viejo), es un
  // dispositivo desalineado: rechazo explicito, no silencio.
  if (data.batteryMv !== undefined) {
    throw new ProtocolError('batteryMv is not part of the protocol; use power');
  }
  const rawPower: unknown = data.power ?? null;
  if (rawPower === null) {
    throw new ProtocolError('Missing power telemetry');
  }
  let power: PowerTelemetry;
  {
    if (typeof rawPower !== 'object' || Array.isArray(rawPower)) {
      throw new ProtocolError('Invalid power');
    }
    const p = rawPower as Record<string, unknown>;
    // Campos exactos como en position: ni extra ni faltan. reserveMv opcional.
    const keys = Object.keys(p).sort().join(',');
    if (keys !== 'source,vehicleMv' && keys !== 'reserveMv,source,vehicleMv') {
      throw new ProtocolError('Invalid power');
    }
    const validMv = (v: unknown): v is number | null =>
      v === null ||
      (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 60000);
    if (!validMv(p.vehicleMv) || p.vehicleMv === null) {
      throw new ProtocolError('Invalid power');
    }
    if (p.reserveMv !== undefined && !validMv(p.reserveMv)) {
      throw new ProtocolError('Invalid power');
    }
    if (p.source !== 'vehicle' && p.source !== 'reserve' && p.source !== 'unknown') {
      throw new ProtocolError('Invalid power source');
    }
    power = {
      vehicleMv: p.vehicleMv,
      reserveMv: (p.reserveMv ?? null) as number | null,
      source: p.source,
    };
  }

  // Correlacion comando->fix: solo en gnss_fix. Un heartbeat con commandId es
  // un dispositivo confundido o un canal mal usado: 400.
  let commandId: string | null = null;
  const rawCommandId: unknown = data.commandId ?? null;
  if (rawCommandId !== null) {
    if (kind !== 'gnss_fix') {
      throw new ProtocolError('commandId only valid on gnss_fix');
    }
    if (typeof rawCommandId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(rawCommandId)) {
      throw new ProtocolError('Invalid commandId');
    }
    commandId = rawCommandId;
  }

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

  // Un gnss_fix sin coordenadas no significa nada: que fix hizo? Fail-closed
  // — y evita ACKar un LOCATE_NOW con un fix vacio (confirmacion fabricada).
  if (kind === 'gnss_fix' && position === null) {
    throw new ProtocolError('gnss_fix requires position');
  }

  return {
    schemaVersion,
    deviceId: expectedDeviceId,
    sequence,
    kind: kind as EventKind,
    observedAtUtc,
    power,
    commandId,
    position,
  };
}

// ============ Poll de comandos (canal dispositivo -> backend, PR2) ============
// El dispositivo despierto pregunta si hay comandos. Mismo estilo que el
// evento: JSON canonico minimo, campos exactos, zona horaria obligatoria.

export interface PollRequest {
  deviceId: string;
  polledAtUtc: string;
}

export function decodePollRequest(body: Buffer, expectedDeviceId: string): PollRequest {
  if (body.length > MAX_BODY) {
    throw new ProtocolError('Event too large');
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ProtocolError('Invalid JSON');
  }
  if (Object.keys(data).sort().join(',') !== 'deviceId,polledAtUtc') {
    throw new ProtocolError('Invalid poll');
  }
  if (data.deviceId !== expectedDeviceId) {
    throw new ProtocolError('Device mismatch');
  }
  const polledAtUtc = parseTzTimestamp(data.polledAtUtc, 'timestamp');
  return { deviceId: expectedDeviceId, polledAtUtc };
}
