/**
 * Drive PR1 contra Postgres real: ejercita DevicesService.ingest / acknowledge
 * por el mismo camino que produccion (sin HTTP/auth). Prueba las invariantes
 * de seguridad de estado. Uso: npx ts-node scripts/drive-pr1.ts
 */
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { DevicesService } from '../src/devices/devices.service';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok: ${msg}`);
}

function envelope(
  deviceId: string,
  sequence: number,
  kind: string,
  source: 'vehicle' | 'reserve' = 'vehicle',
): Buffer {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      deviceId,
      sequence,
      kind,
      observedAtUtc: new Date().toISOString(),
      power: { vehicleMv: 13600, reserveMv: 4100, source },
      position: null,
    }),
    'utf8',
  );
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const svc = new DevicesService(prisma);

  // Usuario + dispositivo desechables.
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: 'drive', email: `${randomUUID()}@drive.test` },
  });
  const { secret, claimCode } = await svc.createDevice('drive-veh');
  const device = await svc.claimDevice(claimCode, user.id); // presencia -> dueño
  const id = device.id;
  const post = (seq: number, kind: string, source: 'vehicle' | 'reserve' = 'vehicle') => {
    const body = envelope(id, seq, kind, source);
    return svc.ingest(id, body, svc.signForTest(body, secret, id));
  };

  try {
    // 1) suspected_movement con ARMED -> abre 1 incidente OPEN.
    await post(1, 'suspected_movement');
    let open = await prisma.incident.findMany({ where: { deviceId: id, state: 'OPEN' } });
    assert(open.length === 1 && open[0].kind === 'suspected_movement', 'movimiento abre incidente OPEN');

    // 2) heartbeat posterior NO cierra ni duplica -> sigue 1 OPEN.
    await post(2, 'heartbeat');
    open = await prisma.incident.findMany({ where: { deviceId: id, state: 'OPEN' } });
    assert(open.length === 1, 'heartbeat NO cierra la alerta (sigue OPEN)');

    // 3) otro suspected_movement -> idempotente, NO crea otro OPEN del mismo kind.
    await post(3, 'suspected_movement');
    open = await prisma.incident.findMany({ where: { deviceId: id, kind: 'suspected_movement', state: 'OPEN' } });
    assert(open.length === 1, 'movimiento repetido es idempotente (1 OPEN por kind)');

    // 4) power_lost -> incidente OPEN distinto (otro kind).
    await post(4, 'power_lost');
    open = await prisma.incident.findMany({ where: { deviceId: id, state: 'OPEN' } });
    assert(open.length === 2, 'power_lost abre incidente propio (2 OPEN, uno por kind)');

    // 5) "Revisado": ACKNOWLEDGED y el dispositivo NO se desarma.
    const target = open.find((i) => i.kind === 'suspected_movement')!;
    await svc.acknowledgeIncident(target.id, user.id);
    const acked = await prisma.incident.findUniqueOrThrow({ where: { id: target.id } });
    const dev = await prisma.device.findUniqueOrThrow({ where: { id } });
    assert(acked.state === 'ACKNOWLEDGED', 'ack pasa a ACKNOWLEDGED');
    assert(dev.state === 'ARMED', 'ack NO desarma (state sigue ARMED)');

    // 6) Recuperacion de energia NO toca un power_lost OPEN: exige Revisado.
    //    (y el movimiento ACKNOWLEDGED tampoco se cierra por telemetria).
    await post(5, 'heartbeat');
    let pl = open.find((i) => i.kind === 'power_lost')!;
    pl = await prisma.incident.findUniqueOrThrow({ where: { id: pl.id } });
    assert(pl.state === 'OPEN', 'power_lost OPEN sobrevive a heartbeat con source=vehicle');
    assert(acked.state === 'ACKNOWLEDGED', 'movimiento ACKNOWLEDGED no se cierra por telemetria');

    // 7) Revisado del corte + sigue en reserva -> NO cierra (sin restauracion).
    await svc.acknowledgeIncident(pl.id, user.id);
    await post(6, 'heartbeat', 'reserve');
    pl = await prisma.incident.findUniqueOrThrow({ where: { id: pl.id } });
    assert(pl.state === 'ACKNOWLEDGED', 'en reserva no hay restauracion: sigue ACKNOWLEDGED');

    // 8) Alimentacion restablecida -> CLOSED con el seq que lo cerro.
    await post(7, 'heartbeat');
    pl = await prisma.incident.findUniqueOrThrow({ where: { id: pl.id } });
    assert(pl.state === 'CLOSED', 'source=vehicle cierra el power_lost revisado');
    assert(pl.closedByEventSeq === 7, 'cierre trazado con closedByEventSeq');

    console.log('\nPR1 drive: TODO OK');
  } finally {
    await prisma.user.delete({ where: { id: user.id } }); // cascade borra device/incidents
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
