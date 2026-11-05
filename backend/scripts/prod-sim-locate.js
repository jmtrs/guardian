/**
 * Simula la RESPUESTA de la placa a un LOCATE_NOW: postea un `gnss_fix` firmado
 * (K_root real, dentro del contenedor) con el `commandId` del comando PENDING,
 * de modo que el backend lo correlacione -> comando ACKED y aterrice una
 * posicion nueva. Cierra el bucle app(pide) -> back -> dispositivo(responde).
 *
 * Requiere un LOCATE_NOW PENDING vivo; sin él no altera el dispositivo.
 * Uso: SIM_DEVICE_ID=<cuid-o-uuid> node prod-sim-locate.js
 */
const { createDecipheriv, hkdfSync, createHmac } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.SIM_BASE ?? 'http://localhost:3000';
const DEVICE_ID = process.env.SIM_DEVICE_ID;

if (!DEVICE_ID || !/^[A-Za-z0-9_-]{20,64}$/.test(DEVICE_ID)) {
  throw new Error('SIM_DEVICE_ID obligatorio (CUID/UUID)');
}

function masterKey() {
  const raw = process.env.GUARDIAN_SECRET_KEY;
  if (!raw) throw new Error('GUARDIAN_SECRET_KEY no esta en el entorno');
  return /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
}
function decryptSecret(stored, key) {
  if (!stored.startsWith('enc:v1:')) return stored;
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

    const cmd = await prisma.command.findFirst({
      where: {
        deviceId: device.id,
        type: 'LOCATE_NOW',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!cmd) throw new Error('no hay LOCATE_NOW PENDING vivo; no se enviará ningún fix');
    console.log(
      `device=${device.id} lastSeq=${device.lastSeq} commandPendiente=${cmd ? cmd.id : 'ninguno'}`,
    );

    const key = deriveEventKey(decryptSecret(device.secret, masterKey()), device.id);
    const seq = device.lastSeq + 1;
    // Nueva posicion: nudge desde la ultima conocida (o centro Madrid).
    const lat = Number(((device.lastLat ?? 40.4168) + 0.0009).toFixed(6));
    const lon = Number(((device.lastLon ?? -3.7038) + 0.0013).toFixed(6));
    const now = new Date().toISOString();
    const envelope = {
      schemaVersion: 2,
      deviceId: device.id,
      sequence: seq,
      kind: 'gnss_fix',
      observedAtUtc: now,
      power: { vehicleMv: 13900, reserveMv: 4110, source: 'vehicle' },
      position: { lat, lon, fixAtUtc: now },
    };
    envelope.commandId = cmd.id;

    const r = await post(device.id, key, envelope);
    console.log(
      `gnss_fix seq=${seq} lat=${lat} lon=${lon} commandId=${cmd ? cmd.id : '-'} -> HTTP ${r.status} ${r.text}`,
    );

    if (r.status < 200 || r.status >= 300)
      throw new Error(`ingesta rechazada: HTTP ${r.status} ${r.text}`);
    const after = await prisma.command.findUnique({ where: { id: cmd.id } });
    if (!after || after.status !== 'ACKED' || !after.resultEventId) {
      throw new Error(
        `LOCATE_NOW no quedo ACKED tras la ingesta (estado=${after?.status ?? 'ausente'})`,
      );
    }
    console.log(
      `comando ahora: ${after.status}${after.ackedAt ? ` ackedAt=${after.ackedAt.toISOString()}` : ''} resultEventId=${after.resultEventId ?? '-'}`,
    );
    const d2 = await prisma.device.findUnique({
      where: { id: device.id },
      select: { lastLat: true, lastLon: true, lastFixAt: true, lastSeq: true },
    });
    console.log(
      `device ahora: lastSeq=${d2.lastSeq} lastLat=${d2.lastLat} lastLon=${d2.lastLon} lastFixAt=${d2.lastFixAt?.toISOString()}`,
    );
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(String((e && e.message) || e));
  process.exit(1);
});
