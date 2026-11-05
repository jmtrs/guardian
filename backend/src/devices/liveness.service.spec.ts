import type { PrismaService } from '../prisma/prisma.service';
import { LivenessService } from './liveness.service';

function makePrisma(
  candidates: Array<{ id: string; heartbeatIntervalSec: number | null; lastSeenAt: Date | null }>,
  freshCandidates = candidates,
) {
  const findMany = jest.fn().mockResolvedValue(candidates);
  const queryRaw = jest
    .fn()
    .mockImplementation((_query, deviceId: string) =>
      Promise.resolve(freshCandidates.filter((candidate) => candidate.id === deviceId)),
    );
  const findFirst = jest.fn().mockResolvedValue(null);
  const create = jest.fn().mockResolvedValue({ id: 'incident' });
  const transaction = jest.fn().mockImplementation((callback) =>
    callback({
      $queryRaw: queryRaw,
      incident: { findFirst, create },
    }),
  );
  return {
    prisma: { device: { findMany }, $transaction: transaction } as unknown as PrismaService,
    findMany,
    transaction,
    create,
  };
}

describe('LivenessService', () => {
  const previous = process.env.LIVENESS_MISSED_HEARTBEATS;

  afterEach(() => {
    process.env.LIVENESS_MISSED_HEARTBEATS = previous;
  });

  it('abre signal_lost usando reloj de servidor tras tres intervalos', async () => {
    delete process.env.LIVENESS_MISSED_HEARTBEATS;
    const now = new Date('2026-11-05T12:10:01Z');
    const { prisma, create } = makePrisma([
      { id: 'silent', heartbeatIntervalSec: 120, lastSeenAt: new Date('2026-11-05T12:04:00Z') },
      { id: 'alive', heartbeatIntervalSec: 120, lastSeenAt: new Date('2026-11-05T12:04:01Z') },
    ]);

    const count = await new LivenessService(prisma).detectSilentDevices(now);

    expect(count).toBe(1);
    expect(create).toHaveBeenCalledWith({
      data: { deviceId: 'silent', kind: 'signal_lost', openedAt: now, openedByEventSeq: null },
    });
  });

  it('no escribe si nadie ha superado el limite', async () => {
    const now = new Date('2026-11-05T12:10:00Z');
    const { prisma, transaction } = makePrisma([
      { id: 'boundary', heartbeatIntervalSec: 120, lastSeenAt: new Date('2026-11-05T12:04:00Z') },
    ]);

    expect(await new LivenessService(prisma).detectSilentDevices(now)).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('relee bajo lock y no abre si ingest recupero el device tras la seleccion', async () => {
    const now = new Date('2026-11-05T12:10:01Z');
    const stale = {
      id: 'racing',
      heartbeatIntervalSec: 120,
      lastSeenAt: new Date('2026-11-05T12:04:00Z'),
    };
    const recovered = { ...stale, lastSeenAt: new Date('2026-11-05T12:10:00Z') };
    const { prisma, create } = makePrisma([stale], [recovered]);

    expect(await new LivenessService(prisma).detectSilentDevices(now)).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('excluye incidentes activos en la consulta e ignora limites invalidos', async () => {
    process.env.LIVENESS_MISSED_HEARTBEATS = '0';
    const { prisma, findMany } = makePrisma([]);
    const service = new LivenessService(prisma);

    expect(service.missedHeartbeatLimit()).toBe(3);
    await service.detectSilentDevices();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          incidents: { none: { kind: 'signal_lost', state: { in: ['OPEN', 'ACKNOWLEDGED'] } } },
        }),
      }),
    );
  });
});
