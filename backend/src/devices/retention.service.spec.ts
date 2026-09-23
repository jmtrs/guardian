import { RetentionService } from './retention.service';
import type { PrismaService } from '../prisma/prisma.service';

// Mock fino de Prisma: solo deviceEvent.deleteMany, para asertar el corte.
function makePrisma() {
  const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
  return { prisma: { deviceEvent: { deleteMany } } as unknown as PrismaService, deleteMany };
}

describe('RetentionService', () => {
  const prev = process.env.RETENTION_DAYS;
  afterEach(() => {
    process.env.RETENTION_DAYS = prev;
  });

  it('purga por receivedAt con el corte = now - retentionDays', async () => {
    process.env.RETENTION_DAYS = '30';
    const { prisma, deleteMany } = makePrisma();
    const svc = new RetentionService(prisma);
    const now = new Date('2026-09-23T00:00:00Z');
    const count = await svc.purgeOldEvents(now);
    expect(count).toBe(3);
    const arg = deleteMany.mock.calls[0][0];
    // 30 dias antes de now.
    expect(arg.where.receivedAt.lt).toEqual(new Date('2026-08-24T00:00:00Z'));
  });

  it('retentionDays: por defecto 90; ignora valores invalidos', () => {
    const { prisma } = makePrisma();
    const svc = new RetentionService(prisma);
    delete process.env.RETENTION_DAYS;
    expect(svc.retentionDays()).toBe(90);
    process.env.RETENTION_DAYS = '0';
    expect(svc.retentionDays()).toBe(90);
    process.env.RETENTION_DAYS = 'abc';
    expect(svc.retentionDays()).toBe(90);
    process.env.RETENTION_DAYS = '45';
    expect(svc.retentionDays()).toBe(45);
  });

  it('nunca toca incidentes: solo deviceEvent.deleteMany', async () => {
    const { prisma, deleteMany } = makePrisma();
    const svc = new RetentionService(prisma);
    await svc.purgeOldEvents(new Date());
    expect(deleteMany).toHaveBeenCalledTimes(1);
    // El mock no expone incident.*: si el servicio lo tocara, reventaria aqui.
  });
});
