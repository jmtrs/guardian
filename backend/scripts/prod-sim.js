/**
 * Simulador de eventos v2 para PROD, pensado para ejecutarse DENTRO del
 * contenedor backend (via scripts/prod-sim.sh). El K_root nunca sale del
 * homelab: se descifra aqui con GUARDIAN_SECRET_KEY y se firma como la placa
 * (K_event = HKDF(K_root, salt=deviceId, info="guardian/event/v1")). El POST
 * va a localhost:3000 para saltar el bloqueo de UA de Cloudflare.
 *
 * Uso (dentro del contenedor, cwd = /app/backend por el node_modules):
 *   node prod-sim.js gnss_fix [n]        # n fixes desplazandose (default 3)
 *   node prod-sim.js heartbeat           # un latido (refresca lastSeen + power)
 *   node prod-sim.js suspected_movement  # abre incidente de movimiento
 *   node prod-sim.js power_lost          # abre incidente de corte
 *   node prod-sim.js battery_low         # aviso de bateria baja
 *
 * Requiere-solo built-ins + @prisma/client (ya en la imagen). Sin deps del repo.
 */
const { createDecipheriv, hkdfSync, createHmac } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const ALLOWED = ['suspected_movement', 'battery_low', 'power_lost', 'heartbeat', 'gnss_fix'];
const kind = process.argv[2] ?? 'gnss_fix';
const count = kind === 'gnss_fix' ? Number(process.argv[3] ?? 3) : 1;
const BASE = process.env.SIM_BASE ?? 'http://localhost:3000';

if (!ALLOWED.includes(kind)) {
  console.error(`kind invalido: ${kind}. Usa: ${ALLOWED.join(' | ')}`);
  process.exit(1);
}

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
    hkdfSync('sha256', Buffer.from(rootHex, 'hex'), Buffer.from(deviceId, 'utf8'),
      Buffer.from('guardian/event/v1', 'utf8'), 32),
  );
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
  return `HTTP ${res.status} ${await res.text()}`;
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const device = await prisma.device.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!device) throw new Error('no hay dispositivo');
    const key = deriveEventKey(decryptSecret(device.secret, masterKey()), device.id);
    let seq = device.lastSeq;
    let lat = device.lastLat ?? 40.4168;
    let lon = device.lastLon ?? -3.7038;

    for (let i = 0; i < count; i++) {
      seq += 1;
      const now = new Date().toISOString();
      const vehicleMv = kind === 'battery_low' ? 11200 : 13600;
      const envelope = {
        schemaVersion: 2,
        deviceId: device.id,
        sequence: seq,
        kind,
        observedAtUtc: now,
        power: { vehicleMv, reserveMv: 4100, source: 'vehicle' },
        position: null,
      };
      if (kind === 'gnss_fix') {
        lat += 0.0016 * (i % 2 === 0 ? 1 : 0.6);
        lon += 0.0022;
        envelope.position = { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)), fixAtUtc: now };
      }
      const result = await post(device.id, key, envelope);
      const where = kind === 'gnss_fix' ? ` lat=${envelope.position.lat} lon=${envelope.position.lon}` : '';
      console.log(`${kind} ${i + 1}/${count} seq=${seq}${where} -> ${result}`);
      if (count > 1) await new Promise((r) => setTimeout(r, 800));
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
