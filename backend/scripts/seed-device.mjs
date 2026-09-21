#!/usr/bin/env node
/**
 * Seed bench: usuario + dispositivo guardian-lab-01 para el simulador Python.
 *
 *   node scripts/seed-device.mjs           # crea si falta, no rota secreto
 *   node scripts/seed-device.mjs --rotate  # secreto nuevo + lastSeq=0
 *                                           (borra guardian-counter.sqlite3 despues)
 *
 * Requiere DATABASE_URL y `prisma generate` previo.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEVICE_ID = process.env.SEED_DEVICE_ID ?? 'guardian-lab-01';
const OWNER_EMAIL = 'bench@guardian.local';
const rotate = process.argv.includes('--rotate');

async function main() {
  const user = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    create: { id: randomUUID(), email: OWNER_EMAIL, name: 'Bench', emailVerified: true },
    update: {},
  });

  const existing = await prisma.device.findUnique({ where: { id: DEVICE_ID } });
  const secret = rotate || !existing ? randomBytes(32).toString('hex') : existing.secret;

  const device = await prisma.device.upsert({
    where: { id: DEVICE_ID },
    create: { id: DEVICE_ID, name: 'Guardian Lab 01', secret, ownerId: user.id },
    update: rotate ? { secret, lastSeq: 0 } : {},
  });

  console.log(`device=${device.id} owner=${OWNER_EMAIL} state=${device.state}`);
  console.log(`export GUARDIAN_DEVICE_ID="${device.id}"`);
  console.log(`export GUARDIAN_DEVICE_KEY_HEX="${secret}"`);
  if (rotate) {
    console.log('# secreto rotado: borra guardian-counter.sqlite3 del simulador');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
