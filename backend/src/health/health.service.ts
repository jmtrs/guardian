import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  async check(): Promise<{ status: string; database: string; timestamp: string }> {
    let databaseStatus = 'disconnected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'connected';
    } catch {
      databaseStatus = 'disconnected';
    }

    return {
      status: databaseStatus === 'connected' ? 'ok' : 'error',
      database: databaseStatus,
      timestamp: new Date().toISOString(),
    };
  }
}