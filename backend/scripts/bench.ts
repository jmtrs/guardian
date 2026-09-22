/**
 * Bench de banco para probar PR1 a mano contra el backend en marcha.
 *
 *   npx ts-node scripts/bench.ts provision <email> [nombre]
 *       Crea (o reutiliza) un dispositivo del usuario con ese email e imprime
 *       id + secret. El usuario debe haber iniciado sesion antes en la app.
 *
 *   npx ts-node scripts/bench.ts send <email> <kind>
 *       Firma un evento y lo POSTea a http://localhost:3000/v1/events con la
 *       secuencia correcta (lastSeq+1). kind: suspected_movement | heartbeat |
 *       power_lost | gnss_fix | battery_low
 *
 *   npx ts-node scripts/bench.ts status <email>
 *       Imprime estado del dispositivo e incidentes.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { sign } from '../src/devices/protocol';

const BASE = process.env.BENCH_BASE ?? 'http://localhost:3000';

async function firstDevice(prisma: PrismaService, email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No hay usuario con email ${email}. Inicia sesion en la app primero.`);
  const device = await prisma.device.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' } });
  return { user, device };
}

async function main() {
  const [cmd, email, arg] = process.argv.slice(2);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    if (cmd === 'provision') {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new Error(`No hay usuario con email ${email}. Inicia sesion en la app primero.`);
      let device = await prisma.device.findFirst({ where: { ownerId: user.id } });
      if (!device) {
        const { randomBytes } = await import('crypto');
        device = await prisma.device.create({
          data: { name: arg ?? 'Coche', secret: randomBytes(32).toString('hex'), ownerId: user.id },
        });
        console.log('Dispositivo creado.');
      } else {
        console.log('Ya existia un dispositivo; reutilizo.');
      }
      console.log(`  deviceId: ${device.id}`);
      console.log(`  secret:   ${device.secret}`);
      return;
    }

    if (cmd === 'send') {
      const { device } = await firstDevice(prisma, email);
      if (!device) throw new Error('El usuario no tiene dispositivo. Ejecuta provision primero.');
      const seq = device.lastSeq + 1;
      const body = Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          deviceId: device.id,
          sequence: seq,
          kind: arg,
          observedAtUtc: new Date().toISOString(),
          batteryMv: arg === 'battery_low' ? 11200 : null,
          position:
            arg === 'gnss_fix'
              ? { lat: 40.4168, lon: -3.7038, fixAtUtc: new Date().toISOString() }
              : null,
        }),
        'utf8',
      );
      const signature = sign(body, Buffer.from(device.secret, 'hex'));
      const res = await fetch(`${BASE}/v1/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-device-id': device.id,
          'x-guardian-signature': signature,
        },
        body,
      });
      console.log(`send ${arg} seq=${seq} -> HTTP ${res.status} ${await res.text()}`);
      return;
    }

    if (cmd === 'status') {
      const { device } = await firstDevice(prisma, email);
      if (!device) throw new Error('El usuario no tiene dispositivo.');
      const incidents = await prisma.incident.findMany({
        where: { deviceId: device.id },
        orderBy: { openedAt: 'desc' },
      });
      console.log(`device: state=${device.state} tripState=${device.tripState} lastSeq=${device.lastSeq}`);
      for (const i of incidents) {
        console.log(`  incident ${i.kind} ${i.state} (openedBySeq=${i.openedByEventSeq})`);
      }
      if (incidents.length === 0) console.log('  (sin incidentes)');
      return;
    }

    console.error('Comando desconocido. Usa: provision | send | status');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
