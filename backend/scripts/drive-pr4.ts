/**
 * Drive PR4 contra Postgres real: claim/pairing con presencia (en software).
 * Provision sin dueño -> claim con codigo -> quema del codigo -> rechazos.
 * Uso: npx ts-node scripts/drive-pr4.ts
 */
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { DevicesService } from '../src/devices/devices.service';

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

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const svc = new DevicesService(prisma);

  const user = await prisma.user.create({
    data: { id: randomUUID(), name: 'drive4', email: `${randomUUID()}@drive.test` },
  });
  const other = await prisma.user.create({
    data: { id: randomUUID(), name: 'drive4b', email: `${randomUUID()}@drive.test` },
  });

  try {
    // 1) Provision: nace sin dueño, en ventana de pairing.
    const { device, claimCode } = await svc.createDevice('drive4-veh');
    const provisioned = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    assert(provisioned.ownerId === null, 'aprovisionado sin dueño');
    assert(provisioned.claimCodeHash !== null, 'tiene hash de claim (no el codigo)');
    assert(provisioned.pairingExpiresAt !== null, 'tiene ventana de pairing');

    // 2) Codigo equivocado: rechazo uniforme.
    await expectReject(svc.claimDevice('0000-0000', user.id), 'codigo equivocado rechazado');

    // 3) Claim correcto: liga dueño y quema el codigo.
    const claimed = await svc.claimDevice(claimCode, user.id);
    assert(claimed.ownerId === user.id, 'claim liga al dueño');
    const afterClaim = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    assert(afterClaim.claimCodeHash === null, 'codigo quemado (hash null)');
    assert(afterClaim.pairingExpiresAt === null, 'ventana cerrada tras claim');
    assert(afterClaim.claimedAt !== null, 'claimedAt registrado');

    // 4) Segundo claim con el mismo codigo: ya no vale (un solo uso).
    await expectReject(svc.claimDevice(claimCode, other.id), 'codigo ya usado no revalida');

    // 5) Ventana caducada: un codigo fuera de plazo no vale.
    const { device: d2, claimCode: code2 } = await svc.createDevice('drive4-veh2');
    await prisma.device.update({
      where: { id: d2.id },
      data: { pairingExpiresAt: new Date(Date.now() - 1000) },
    });
    await expectReject(svc.claimDevice(code2, user.id), 'codigo con ventana caducada rechazado');

    console.log('\nPR4 drive: TODO OK');
  } finally {
    // Limpieza: dispositivos de los usuarios de prueba + usuarios.
    await prisma.device.deleteMany({ where: { ownerId: { in: [user.id, other.id] } } });
    await prisma.device.deleteMany({ where: { claimedAt: null, name: { startsWith: 'drive4' } } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
