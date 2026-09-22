/**
 * Drive PR2 contra Postgres real: canal de comandos LOCATE_NOW + protocolo v2
 * (power obligatorio, v1 muerto) + separacion de claves por contexto.
 * Uso: npx ts-node scripts/drive-pr2.ts
 */
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { DevicesService } from '../src/devices/devices.service';
import { deriveKey, sign } from '../src/devices/protocol';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function expectReject(p: Promise<unknown>, msg: string) {
  try {
    await p;
  } catch {
    console.log(`  ok: ${msg}`);
    return;
  }
  throw new Error(`FAIL (no lanzo): ${msg}`);
}

function v2(
  deviceId: string,
  sequence: number,
  kind: string,
  extra: Record<string, unknown> = {},
): Buffer {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      deviceId,
      sequence,
      kind,
      observedAtUtc: new Date().toISOString(),
      power: { vehicleMv: 13600, reserveMv: 4100, source: 'vehicle' },
      position: null,
      ...extra,
    }),
    'utf8',
  );
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const svc = new DevicesService(prisma);

  const user = await prisma.user.create({
    data: { id: randomUUID(), name: 'drive2', email: `${randomUUID()}@drive.test` },
  });
  const { device, secret } = await svc.createDevice(user.id, 'drive-veh');
  const id = device.id;
  const post = (body: Buffer) => svc.ingest(id, body, svc.signForTest(body, secret, id));

  try {
    let seq = 0;
    const next = () => ++seq;

    // 1) Protocolo: v1 muerto, power obligatorio, batteryMv fuera.
    const v1 = JSON.parse(v2(id, next(), 'heartbeat').toString());
    v1.schemaVersion = 1;
    await expectReject(post(Buffer.from(JSON.stringify(v1))), 'v1 rechazado (unico contrato: v2)');
    const noPower = JSON.parse(v2(id, next(), 'heartbeat').toString());
    delete noPower.power;
    await expectReject(post(Buffer.from(JSON.stringify(noPower))), 'evento sin power rechazado');
    await expectReject(post(v2(id, next(), 'heartbeat', { batteryMv: 13000 })), 'batteryMv rechazado');

    // 2) v2 valido: denormaliza energia en el dispositivo.
    await post(v2(id, next(), 'heartbeat'));
    let dev = await prisma.device.findUniqueOrThrow({ where: { id } });
    assert(
      dev.lastVehicleMv === 13600 && dev.lastReserveMv === 4100 && dev.lastPowerSource === 'vehicle',
      'power denormalizado (vehicleMv/reserveMv/source)',
    );

    // 3) LOCATE_NOW: PENDING + idempotente.
    const cmd = await svc.requestLocate(id, user.id);
    assert(cmd.status === 'PENDING', 'locate crea PENDING');
    const again = await svc.requestLocate(id, user.id);
    assert(again.id === cmd.id, 'segundo locate reutiliza el PENDING vivo');

    // 4) Poll: K_command ve el comando; K_event NO (separacion real de claves).
    const pollBody = Buffer.from(
      JSON.stringify({ deviceId: id, polledAtUtc: new Date().toISOString() }),
      'utf8',
    );
    const polled = await svc.pollCommands(
      id,
      pollBody,
      sign(pollBody, deriveKey(secret, id, 'command')),
    );
    assert(polled.length === 1 && polled[0].id === cmd.id, 'poll con K_command devuelve el PENDING');
    await expectReject(
      svc.pollCommands(id, pollBody, sign(pollBody, deriveKey(secret, id, 'event'))),
      'poll con K_event rechazado',
    );

    // 5) Fix con commandId -> ACKED + correlacion + posicion fresca.
    await post(
      v2(id, next(), 'gnss_fix', {
        position: { lat: 40.4168, lon: -3.7038, fixAtUtc: new Date().toISOString() },
        commandId: cmd.id,
      }),
    );
    const acked = await prisma.command.findUniqueOrThrow({ where: { id: cmd.id } });
    dev = await prisma.device.findUniqueOrThrow({ where: { id } });
    assert(acked.status === 'ACKED' && acked.resultEventId != null, 'fix ACKea el comando');
    assert(dev.lastLat === 40.4168 && dev.lastFixAt != null, 'posicion fresca denormalizada');

    // 6) Fix tardio sobre comando expirado: guarda la posicion, NO correla.
    const cmd2 = await svc.requestLocate(id, user.id);
    await prisma.command.update({
      where: { id: cmd2.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await svc.listCommands(id, user.id); // expiracion lazy -> EXPIRED
    await post(
      v2(id, next(), 'gnss_fix', {
        position: { lat: 41.0, lon: -4.0, fixAtUtc: new Date().toISOString() },
        commandId: cmd2.id,
      }),
    );
    const expired = await prisma.command.findUniqueOrThrow({ where: { id: cmd2.id } });
    dev = await prisma.device.findUniqueOrThrow({ where: { id } });
    assert(expired.status === 'EXPIRED' && expired.ackedAt == null, 'fix tardio NO ackea');
    assert(dev.lastLat === 41.0, 'fix tardio SI guarda la posicion (dato valioso)');

    console.log('\nPR2 drive: TODO OK');
  } finally {
    await prisma.user.delete({ where: { id: user.id } }); // cascade
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
