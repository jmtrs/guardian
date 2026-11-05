import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeviceKind } from '@prisma/client';

import { DevicesService } from '../src/devices/devices.service';
import { LivenessService } from '../src/devices/liveness.service';
import { RetentionService } from '../src/devices/retention.service';
import { PrismaService } from '../src/prisma/prisma.service';

function eventBody(deviceId: string, sequence: number, kind = 'heartbeat'): Buffer {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      deviceId,
      sequence,
      kind,
      observedAtUtc: new Date().toISOString(),
      power: { vehicleMv: 13_600, reserveMv: 4_100, source: 'vehicle' },
      position: null,
    }),
  );
}

describe('Devices + liveness (real PostgreSQL)', () => {
  const prisma = new PrismaService();
  const devices = new DevicesService(prisma, new RetentionService(prisma));
  const liveness = new LivenessService(prisma);
  const createdDeviceIds: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    const databaseName = databaseUrl ? new URL(databaseUrl).pathname.slice(1) : '';
    if (!databaseName.endsWith('_test')) {
      throw new Error('Refusing e2e cleanup: DATABASE_URL database name must end in _test');
    }
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdDeviceIds.length > 0) {
      await prisma.device.deleteMany({ where: { id: { in: createdDeviceIds } } });
    }
    await prisma.$disconnect();
  });

  it('persiste identidad y valida la cadencia del watchdog', async () => {
    const provisioned = await devices.createDevice(`e2e-sim-${randomUUID()}`, DeviceKind.SIMULATOR);
    createdDeviceIds.push(provisioned.device.id);

    expect(provisioned.device.kind).toBe(DeviceKind.SIMULATOR);
    await expect(devices.configureLiveness(provisioned.device.id, 59)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const configured = await devices.configureLiveness(provisioned.device.id, 300);
    expect(configured.heartbeatIntervalSec).toBe(300);
  });

  it('protege en PostgreSQL el origen de apertura de cada incidente', async () => {
    const provisioned = await devices.createDevice(`e2e-invariant-${randomUUID()}`);
    const deviceId = provisioned.device.id;
    createdDeviceIds.push(deviceId);

    await expect(
      prisma.incident.create({
        data: { deviceId, kind: 'power_lost', openedByEventSeq: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.incident.create({
        data: { deviceId, kind: 'signal_lost', openedByEventSeq: 1 },
      }),
    ).rejects.toThrow();
  });

  it('abre signal_lost y lo cierra solo al volver un evento autenticado', async () => {
    const provisioned = await devices.createDevice(`e2e-physical-${randomUUID()}`);
    const id = provisioned.device.id;
    createdDeviceIds.push(id);
    const now = new Date('2026-11-05T12:10:00Z');
    await prisma.device.update({
      where: { id },
      data: { heartbeatIntervalSec: 60, lastSeenAt: new Date('2026-11-05T12:06:59Z') },
    });

    expect(await liveness.detectSilentDevices(now)).toBe(1);
    const opened = await prisma.incident.findFirstOrThrow({
      where: { deviceId: id, kind: 'signal_lost' },
    });
    expect(opened.openedByEventSeq).toBeNull();
    expect(await liveness.detectSilentDevices(now)).toBe(0);

    const body = eventBody(id, 1);
    const signature = devices.signForTest(body, provisioned.secret, id);
    await expect(devices.ingest(id, body, signature)).resolves.toEqual({
      status: 202,
      sequence: 1,
    });

    const closed = await prisma.incident.findUniqueOrThrow({ where: { id: opened.id } });
    expect(closed.state).toBe('CLOSED');
    expect(closed.closedByEventSeq).toBe(1);
    await expect(devices.ingest(id, body, signature)).rejects.toBeInstanceOf(ConflictException);
  });
});
