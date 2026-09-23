import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Retencion de historial: la ubicacion es dato sensible y no se conserva
 * indefinidamente. Purga los `device_events` mas viejos que `RETENTION_DAYS`
 * (con su telemetria y posiciones embebidas). Los incidentes viven en su propia
 * tabla y NO se tocan: un hecho de seguridad persiste aunque caduque su rastro.
 *
 * Corte por `receivedAt` (reloj del servidor), nunca por `observedAt` (reloj del
 * dispositivo, sujeto a skew): la retencion la decide el servidor.
 *
 * Sin dependencia de cron: un intervalo diario + una pasada al arrancar. En
 * tests no se agenda nada; se ejercita el metodo puro `purgeOldEvents`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  /** Dias de retencion desde env; por defecto 90. Valor invalido -> por defecto. */
  retentionDays(): number {
    const d = Number(process.env.RETENTION_DAYS);
    return Number.isFinite(d) && d > 0 ? Math.trunc(d) : DEFAULT_RETENTION_DAYS;
  }

  /** Borra eventos anteriores al corte. Puro y testeable; devuelve cuantos. */
  async purgeOldEvents(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.retentionDays() * DAY_MS);
    const { count } = await this.prisma.deviceEvent.deleteMany({
      where: { receivedAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`Retention: purged ${count} events older than ${this.retentionDays()}d`);
    }
    return count;
  }

  onModuleInit(): void {
    // En tests no agendamos trabajo de fondo.
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    void this.purgeOldEvents().catch((e) => this.logger.warn(`Retention pass failed: ${e}`));
    this.timer = setInterval(
      () => void this.purgeOldEvents().catch((e) => this.logger.warn(`Retention pass failed: ${e}`)),
      DAY_MS,
    );
    // No mantener vivo el proceso solo por este timer.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
