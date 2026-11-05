/**
 * Backfill de telemetria de energia de UN DIA para PROD (homelab). Se ejecuta
 * DENTRO del contenedor backend (via ssh + docker, igual que prod-sim.js): el
 * K_root nunca sale del homelab. Firma como la placa y hace POST a
 * localhost:3000 (salta el bloqueo de UA de Cloudflare y el rate-limit no
 * aplica: /v1/events va con @SkipThrottle).
 *
 * A diferencia de prod-sim.js (que manda eventos en `now`), este reparte
 * `heartbeat` cada 30 min a lo largo de las ultimas 24 h con una curva de
 * tension de vehiculo 12 V realista (reposo nocturno ~12.5 V, carga en trayecto
 * ~14.2 V), para que la battery-history (bucket 'hour', ventana 24 h) dibuje un
 * dia completo. observedAtUtc va en el pasado; la secuencia es monotonica.
 *
 * Uso (dentro del contenedor, cwd = /app/backend):
 *   SIM_DEVICE_ID=<cuid-o-uuid> node prod-sim-day.js [hours] [stepMin]
 */
const { createDecipheriv, hkdfSync, createHmac } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const HOURS = Number(process.argv[2] ?? 24);
const STEP_MIN = Number(process.argv[3] ?? 30);
const BASE = process.env.SIM_BASE ?? 'http://localhost:3000';
const DEVICE_ID = process.env.SIM_DEVICE_ID;
const TZ_OFFSET_H = 2; // Europe/Madrid CEST (verano) para la forma de la curva

if (!DEVICE_ID || !/^[A-Za-z0-9_-]{20,64}$/.test(DEVICE_ID)) {
  throw new Error('SIM_DEVICE_ID obligatorio (CUID/UUID)');
}
if (!Number.isFinite(HOURS) || HOURS <= 0 || HOURS > 168)
  throw new Error('hours debe estar entre 0 y 168');
if (!Number.isFinite(STEP_MIN) || STEP_MIN < 1 || STEP_MIN > 1440) {
  throw new Error('stepMin debe estar entre 1 y 1440');
}
if (Math.ceil((HOURS * 60) / STEP_MIN) + 1 > 500)
  throw new Error('maximo 500 eventos por ejecucion');

function masterKey() {
  const raw = process.env.GUARDIAN_SECRET_KEY;
  if (!raw) throw new Error('GUARDIAN_SECRET_KEY no esta en el entorno');
  return /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
}
function decryptSecret(stored, key) {
  if (!stored.startsWith('enc:v1:')) return stored; // dev sin cifrar
  const [, , iv, tag, ct] = stored.split(':');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
function deriveEventKey(rootHex, deviceId) {
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(rootHex, 'hex'),
      Buffer.from(deviceId, 'utf8'),
      Buffer.from('guardian/event/v1', 'utf8'),
      32,
    ),
  );
}

// Tension del rail del vehiculo (mV) segun la hora local: reposo vs carga.
function vehicleMvForHour(h, jitter) {
  let base;
  if (h >= 7 && h < 9)
    base = 14200; // trayecto de manana (alternador)
  else if (h >= 9 && h < 13)
    base = 12650; // aparcado, reposo lento
  else if (h >= 13 && h < 14)
    base = 14050; // recado mediodia
  else if (h >= 14 && h < 18)
    base = 12600; // aparcado tarde
  else if (h >= 18 && h < 20)
    base = 14300; // trayecto de tarde
  else base = 12500; // noche en reposo
  return Math.round(base + jitter);
}

async function post(deviceId, key, envelope) {
  const body = Buffer.from(JSON.stringify(envelope), 'utf8');
  const signature = createHmac('sha256', key).update(body).digest('hex');
  const res = await fetch(`${BASE}/v1/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Guardian-Device/2',
      'x-device-id': deviceId,
      'x-guardian-signature': signature,
    },
    body,
  });
  return { status: res.status, text: await res.text() };
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const device = await prisma.device.findUnique({ where: { id: DEVICE_ID } });
    if (!device) throw new Error(`simulador ${DEVICE_ID} no existe`);
    if (device.kind !== 'SIMULATOR') throw new Error(`rechazado: ${DEVICE_ID} no es SIMULATOR`);
    console.log(
      `device=${device.id} name=${device.name ?? ''} owner=${device.ownerId ?? 'null'} lastSeq=${device.lastSeq}`,
    );

    const key = deriveEventKey(decryptSecret(device.secret, masterKey()), device.id);
    let seq = device.lastSeq;

    const now = Date.now();
    const stepMs = STEP_MIN * 60 * 1000;
    const start = now - HOURS * 60 * 60 * 1000;
    let ok = 0;
    let fail = 0;

    for (let t = start; t <= now; t += stepMs) {
      seq += 1;
      const localH = (new Date(t).getUTCHours() + TZ_OFFSET_H) % 24;
      const jitter = (Math.random() - 0.5) * 120; // +/- 60 mV
      const vehicleMv = vehicleMvForHour(localH, jitter);
      const reserveMv = Math.round(4100 + (Math.random() - 0.5) * 80); // 4060-4140
      const iso = new Date(t).toISOString();
      const envelope = {
        schemaVersion: 2,
        deviceId: device.id,
        sequence: seq,
        kind: 'heartbeat',
        observedAtUtc: iso,
        power: { vehicleMv, reserveMv, source: 'vehicle' },
        position: null,
      };
      const r = await post(device.id, key, envelope);
      if (r.status >= 200 && r.status < 300) ok += 1;
      else {
        fail += 1;
        throw new Error(`ingesta rechazada en seq=${seq}: HTTP ${r.status} ${r.text}`);
      }
    }
    console.log(`hecho: ${ok} ok, ${fail} fail, ${HOURS}h cada ${STEP_MIN}min, seq final=${seq}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(String((e && e.message) || e));
  process.exit(1);
});
