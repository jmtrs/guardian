import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { decodeEvent, sign, verify, ProtocolError, type GuardianEvent } from './protocol';

export type IngestResult = {
  status: 202;
  sequence: number;
};

// Nunca exponer `secret` fuera de la creacion del dispositivo.
const DEVICE_PUBLIC_FIELDS = {
  id: true,
  name: true,
  ownerId: true,
  state: true,
  lastSeq: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async createDevice(ownerId: string, name: string) {
    const secret = randomBytes(32).toString('hex');
    const device = await this.prisma.device.create({
      data: { name, secret, ownerId },
      select: DEVICE_PUBLIC_FIELDS,
    });
    // El secreto viaja una sola vez, en la creacion.
    return { device, secret };
  }

  listDevices(ownerId: string) {
    return this.prisma.device.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
      select: {
        ...DEVICE_PUBLIC_FIELDS,
        trips: { where: { endedAt: null }, orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });
  }

  async requireOwnedDevice(deviceId: string, ownerId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    if (device.ownerId !== ownerId) {
      throw new ForbiddenException();
    }
    return device;
  }

  listEvents(deviceId: string, ownerId: string, limit = 50) {
    return this.prisma.deviceEvent.findMany({
      where: { device: { id: deviceId, ownerId } },
      orderBy: { observedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /**
   * Ingest del dispositivo: verify HMAC sobre bytes crudos -> decode -> anti-replay.
   * Espejo de guardian/server.py: 202 aceptado, 401 firma, 409 replay,
   * 404 desconocido, 400 envelope invalido.
   */
  async ingest(deviceId: string, rawBody: Buffer, signature: string): Promise<IngestResult> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      // 401 uniforme como server.py: no permitir enumerar deviceIds validos.
      throw new UnauthorizedException('Bad signature');
    }

    if (!verify(rawBody, Buffer.from(device.secret, 'hex'), signature)) {
      throw new UnauthorizedException('Bad signature');
    }

    let event: GuardianEvent;
    try {
      event = decodeEvent(rawBody, deviceId);
    } catch (error) {
      if (error instanceof ProtocolError) {
        // Mismo mapping que guardian/server.py: invalid_event -> 400
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.prisma.$transaction(async (tx) => {
      // Anti-replay atomico: solo avanza lastSeq si el evento es nuevo.
      const advanced = await tx.device.updateMany({
        where: { id: deviceId, lastSeq: { lt: event.sequence } },
        data: { lastSeq: event.sequence, lastSeenAt: new Date() },
      });
      if (advanced.count === 0) {
        throw new ConflictException('Replayed or stale sequence');
      }

      await tx.deviceEvent.create({
        data: {
          deviceId,
          seq: event.sequence,
          kind: event.kind,
          observedAt: new Date(event.observedAtUtc),
          payload: {
            batteryMv: event.batteryMv ?? null,
            position: event.position ?? null,
          } as unknown as Prisma.DeviceEventUpdateInput['payload'],
        },
      });

      return { status: 202 as const, sequence: event.sequence };
    });
  }

  /** Firmar un evento (para tests e2e y simulador TS si hace falta). */
  signForTest(body: Buffer, secretHex: string): string {
    return sign(body, Buffer.from(secretHex, 'hex'));
  }

  async startTrip(deviceId: string, userId: string) {
    await this.requireOwnedDevice(deviceId, userId);
    return this.prisma.$transaction(async (tx) => {
      // Atomico contra starts concurrentes: solo uno gana el update.
      const advanced = await tx.device.updateMany({
        where: { id: deviceId, state: { not: 'TRIP' } },
        data: { state: 'TRIP' },
      });
      if (advanced.count === 0) {
        throw new ConflictException('Trip already active');
      }
      await tx.tripAuthorization.create({ data: { deviceId, startedBy: userId } });
      return tx.device.findUniqueOrThrow({ where: { id: deviceId } });
    });
  }

  async endTrip(deviceId: string, userId: string) {
    await this.requireOwnedDevice(deviceId, userId);
    return this.prisma.$transaction(async (tx) => {
      // Cierra TODOS los trips abiertos: endTrip nunca debe dejar huerfanos
      // activos aunque hubieran varios por una condicion de carrera antigua.
      await tx.tripAuthorization.updateMany({
        where: { deviceId, endedAt: null },
        data: { endedAt: new Date() },
      });
      return tx.device.update({ where: { id: deviceId }, data: { state: 'ARMED' } });
    });
  }
}
