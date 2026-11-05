import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const MINUTE_MS = 60_000;
const DEFAULT_MISSED_HEARTBEATS = 3;

type LivenessCandidate = {
  id: string;
  heartbeatIntervalSec: number | null;
  lastSeenAt: Date | null;
};

/**
 * Server-clock watchdog for devices that explicitly declare a heartbeat
 * cadence. A null cadence stays disabled, so rollout cannot create false
 * alarms before production firmware is installed.
 */
@Injectable()
export class LivenessService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LivenessService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  missedHeartbeatLimit(): number {
    const configured = Number(process.env.LIVENESS_MISSED_HEARTBEATS);
    return Number.isInteger(configured) && configured >= 1 && configured <= 20
      ? configured
      : DEFAULT_MISSED_HEARTBEATS;
  }

  /** Open one signal_lost incident for every device past its server-time bound. */
  async detectSilentDevices(now: Date = new Date()): Promise<number> {
    const candidates = await this.prisma.device.findMany({
      where: {
        heartbeatIntervalSec: { not: null },
        lastSeenAt: { not: null },
        incidents: {
          none: { kind: 'signal_lost', state: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        },
      },
      select: { id: true, heartbeatIntervalSec: true, lastSeenAt: true },
    });
    const missed = this.missedHeartbeatLimit();
    let opened = 0;
    for (const candidate of candidates) {
      if (!this.isSilent(candidate, now, missed)) continue;
      // Serializa con ingest sobre la fila del device y relee lastSeenAt bajo
      // lock. Sin esto, una recuperacion entre findMany y create dejaria una
      // alerta falsa abierta despues de que el evento ya hubiera pasado.
      const created = await this.prisma.$transaction(async (tx) => {
        const [fresh] = await tx.$queryRaw<LivenessCandidate[]>`
          SELECT "id", "heartbeatIntervalSec", "lastSeenAt"
          FROM "devices"
          WHERE "id" = ${candidate.id}
          FOR UPDATE
        `;
        if (!fresh || !this.isSilent(fresh, now, missed)) return false;
        const active = await tx.incident.findFirst({
          where: {
            deviceId: fresh.id,
            kind: 'signal_lost',
            state: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
          select: { id: true },
        });
        if (active) return false;
        await tx.incident.create({
          data: {
            deviceId: fresh.id,
            kind: 'signal_lost',
            openedAt: now,
            openedByEventSeq: null,
          },
        });
        return true;
      });
      if (created) opened += 1;
    }
    if (opened > 0) this.logger.warn(`Liveness: opened ${opened} signal_lost incident(s)`);
    return opened;
  }

  private isSilent(device: LivenessCandidate, now: Date, missed: number): boolean {
    const { heartbeatIntervalSec: cadence, lastSeenAt } = device;
    return (
      cadence !== null &&
      lastSeenAt !== null &&
      now.getTime() > lastSeenAt.getTime() + cadence * missed * 1000
    );
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    void this.detectSilentDevices().catch((error) =>
      this.logger.warn(`Liveness pass failed: ${String(error)}`),
    );
    this.timer = setInterval(
      () =>
        void this.detectSilentDevices().catch((error) =>
          this.logger.warn(`Liveness pass failed: ${String(error)}`),
        ),
      MINUTE_MS,
    );
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
