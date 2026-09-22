import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import {
  decodeEvent,
  decodePollRequest,
  deriveKey,
  sign,
  verify,
  ProtocolError,
  type GuardianEvent,
} from './protocol';
import {
  shouldOpenIncident,
  shouldCloseAcknowledged,
  incidentKindFor,
  TRIP_RESOLVING_KINDS,
} from './incident';
import { encryptSecret, decryptSecret } from './secret-crypto';

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
  tripState: true,
  workshopUntil: true,
  lastSeq: true,
  lastSeenAt: true,
  lastLat: true,
  lastLon: true,
  lastFixAt: true,
  lastVehicleMv: true,
  lastReserveMv: true,
  lastPowerSource: true,
  createdAt: true,
  updatedAt: true,
} as const;

// TTL corto del LOCATE_NOW (docs v0.6): sin canal de wake real (diferido a
// firmware), un comando que nadie recoge debe morir pronto y en silencio.
const LOCATE_TTL_MS = 120_000;

// Raiz señuelo para deviceIds desconocidos: verificar contra ella nunca pasa,
// pero iguala el coste HKDF+HMAC del camino valido (anti enumeracion por
// tiempo de respuesta, no solo por mensaje de error).
const DUMMY_ROOT_SECRET = '00'.repeat(32);

export type DevicePosition = {
  lat: number;
  lon: number;
  fixAtUtc: string;
  observedAt: Date;
  kind: string;
};

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async createDevice(ownerId: string, name: string) {
    const secret = randomBytes(32).toString('hex');
    const device = await this.prisma.device.create({
      // Cifrado en reposo: en la BD nunca queda el K_root en claro (con master
      // key configurada). El secreto en claro solo se devuelve aqui, una vez.
      data: { name, secret: encryptSecret(secret), ownerId },
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
   * Rastro de posiciones para el mapa: eventos recientes que traen `position`.
   * Prisma no filtra bien dentro del JSON payload, asi que traemos los ultimos
   * eventos y filtramos en memoria (volumen acotado por `limit`). Se devuelve
   * en orden cronologico ascendente para dibujar la polyline del viaje.
   *
   * Ambito (PR2): con incidentId/tripId el rastro se acota a ese hecho
   * concreto, no a "las ultimas N posiciones mezcladas" — el mapa de un
   * incidente muestra el movimiento desde ese incidente, nada anterior.
   */
  async listPositions(
    deviceId: string,
    ownerId: string,
    limit = 50,
    scope?: { incidentId?: string; tripId?: string },
  ): Promise<DevicePosition[]> {
    const take = Math.min(Math.max(limit, 1), 200);
    const where: Prisma.DeviceEventWhereInput = { device: { id: deviceId, ownerId } };
    if (scope?.incidentId) {
      const incident = await this.prisma.incident.findFirst({
        where: { id: scope.incidentId, device: { id: deviceId, ownerId } },
      });
      if (!incident) {
        throw new NotFoundException('Incident not found');
      }
      // Cota por secuencia, no por reloj: openedByEventSeq viene del propio
      // canal del dispositivo, inmune al skew entre reloj del vehiculo y servidor.
      where.seq = { gte: incident.openedByEventSeq };
    } else if (scope?.tripId) {
      const trip = await this.prisma.tripAuthorization.findFirst({
        where: { id: scope.tripId, deviceId },
      });
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }
      where.observedAt = { gte: trip.startedAt, lte: trip.endedAt ?? undefined };
    }
    const events = await this.prisma.deviceEvent.findMany({
      where,
      orderBy: { observedAt: 'desc' },
      take,
    });
    const positions: DevicePosition[] = [];
    for (const event of events) {
      const payload = event.payload as { position?: DevicePosition | null } | null;
      const pos = payload?.position;
      if (pos && typeof pos.lat === 'number' && typeof pos.lon === 'number') {
        positions.push({
          lat: pos.lat,
          lon: pos.lon,
          fixAtUtc: pos.fixAtUtc,
          observedAt: event.observedAt,
          kind: event.kind,
        });
      }
    }
    return positions.reverse();
  }

  /**
   * Ingest del dispositivo: verify HMAC sobre bytes crudos -> decode -> anti-replay.
   * 202 aceptado, 401 firma, 409 replay,
   * 404 desconocido, 400 envelope invalido.
   */
  async ingest(deviceId: string, rawBody: Buffer, signature: string): Promise<IngestResult> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    // Coste uniforme: un deviceId desconocido paga el mismo HKDF+HMAC que uno
    // valido (clave señuelo), para que la 401 tampoco enumere por tiempo. El
    // secreto se descifra en memoria; el señuelo (sin prefijo) pasa tal cual.
    const key = deriveKey(decryptSecret(device?.secret ?? DUMMY_ROOT_SECRET), deviceId, 'event');
    if (!device || !verify(rawBody, key, signature)) {
      // 401 uniforme: no permitir enumerar deviceIds validos.
      throw new UnauthorizedException('Bad signature');
    }

    let event: GuardianEvent;
    try {
      event = decodeEvent(rawBody, deviceId);
    } catch (error) {
      if (error instanceof ProtocolError) {
        // ProtocolError -> 400 (invalid_event)
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.prisma.$transaction(async (tx) => {
      // Denormaliza el ultimo estado conocido junto al avance de secuencia:
      // como va en el mismo updateMany guardado por `lastSeq < sequence`,
      // solo se escribe con eventos nuevos (respeta anti-replay, ignora replays).
      const deviceUpdate: Prisma.DeviceUpdateManyMutationInput = {
        lastSeq: event.sequence,
        lastSeenAt: new Date(),
      };
      if (event.position) {
        deviceUpdate.lastLat = event.position.lat;
        deviceUpdate.lastLon = event.position.lon;
        deviceUpdate.lastFixAt = new Date(event.position.fixAtUtc);
      }
      // Telemetria de energia: siempre presente (contrato v2), con semantica
      // fisica — rail del vehiculo vs reserva interna del Guardian.
      deviceUpdate.lastVehicleMv = event.power.vehicleMv;
      deviceUpdate.lastReserveMv = event.power.reserveMv;
      deviceUpdate.lastPowerSource = event.power.source;

      // Anti-replay atomico: solo avanza lastSeq si el evento es nuevo.
      const advanced = await tx.device.updateMany({
        where: { id: deviceId, lastSeq: { lt: event.sequence } },
        data: deviceUpdate,
      });
      if (advanced.count === 0) {
        throw new ConflictException('Replayed or stale sequence');
      }

      const createdEvent = await tx.deviceEvent.create({
        data: {
          deviceId,
          seq: event.sequence,
          kind: event.kind,
          observedAt: new Date(event.observedAtUtc),
          payload: {
            power: event.power,
            commandId: event.commandId ?? null,
            position: event.position ?? null,
          } as unknown as Prisma.DeviceEventUpdateInput['payload'],
        },
      });

      // ACK del comando: el gnss_fix llega con el commandId que lo pidio.
      // Solo resucita un PENDING no expirado y solo del tipo que espera un
      // fix como ACK — un fix tardio sobre un comando ya muerto guarda la
      // posicion (vale por si misma) pero no correlaciona. Sin posicion no
      // hay ACK: seria confirmar una localizacion que no existe.
      if (event.commandId && event.position) {
        await tx.command.updateMany({
          where: {
            id: event.commandId,
            deviceId,
            type: 'LOCATE_NOW',
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
          data: { status: 'ACKED', ackedAt: new Date(), resultEventId: createdEvent.id },
        });
      }

      // Alerta como hecho persistente: si el evento es de alerta y el
      // dispositivo esta ARMED, abrimos incidente. Idempotente: un unico
      // incidente OPEN por (deviceId, kind). Esta tx es de escritor unico por
      // dispositivo (guardada por lastSeq), asi que el findFirst+create no
      // compite consigo mismo. Un incidente OPEN nunca se cierra aqui: un
      // heartbeat posterior no borra la alerta (ver incident.ts).
      // El estado se releer bajo el lock de la fila (ya retenido por el
      // updateMany de lastSeq): un startTrip/endTrip concurrente puede haber
      // cambiado state entre la lectura inicial y esta tx, y con un snapshot
      // obsoleto un movimiento re-abriria el incidente que el "fui yo" acaba
      // de cerrar.
      const locked = await tx.device.findUnique({
        where: { id: deviceId },
        select: { state: true },
      });
      if (shouldOpenIncident(locked?.state ?? device.state, event.kind)) {
        const open = await tx.incident.findFirst({
          where: { deviceId, kind: incidentKindFor(event.kind), state: 'OPEN' },
          select: { id: true },
        });
        if (!open) {
          await tx.incident.create({
            data: {
              deviceId,
              kind: incidentKindFor(event.kind),
              openedByEventSeq: event.sequence,
            },
          });
        }
      }

      // Recuperacion observada de energia: un incidente power_lost YA REVISADO
      // (ACKNOWLEDGED) se cierra cuando un evento posterior re-observa la
      // alimentacion del vehiculo (source='vehicle'). La regla vive en
      // shouldCloseAcknowledged; el where materializa estado y kind. Nunca
      // toca un OPEN (eso exige Revisado). Cierre trazado con su seq.
      if (shouldCloseAcknowledged('ACKNOWLEDGED', 'power_lost', event.power.source)) {
        await tx.incident.updateMany({
          where: { deviceId, state: 'ACKNOWLEDGED', kind: 'power_lost' },
          data: { state: 'CLOSED', closedAt: new Date(), closedByEventSeq: event.sequence },
        });
      }

      return { status: 202 as const, sequence: event.sequence };
    });
  }

  /** Firmar un evento con K_event (para tests e2e y simulador TS si hace falta). */
  signForTest(body: Buffer, secretHex: string, deviceId: string): string {
    return sign(body, deriveKey(secretHex, deviceId, 'event'));
  }

  async startTrip(deviceId: string, userId: string) {
    await this.requireOwnedDevice(deviceId, userId);
    return this.prisma.$transaction(async (tx) => {
      // Atomico contra starts concurrentes: solo uno gana el update.
      // tripState=CONFIRMED de forma explicita: hoy NO hay canal ACK con el
      // dispositivo, asi que el backend auto-confirma el desarme. Cuando exista
      // el ACK fisico (PR futuro), este write pasara a REQUESTED y la
      // confirmacion vendra del dispositivo. No se finge una confirmacion
      // fisica que no existe: se documenta que la autoridad es el backend.
      const advanced = await tx.device.updateMany({
        where: { id: deviceId, state: { not: 'TRIP' } },
        data: { state: 'TRIP', tripState: 'CONFIRMED' },
      });
      if (advanced.count === 0) {
        throw new ConflictException('Trip already active');
      }
      await tx.tripAuthorization.create({ data: { deviceId, startedBy: userId } });
      // Autorizar viaje = presencia del dueno ("fui yo"): resuelve los incidentes
      // que un arranque legitimo explica (ver TRIP_RESOLVING_KINDS). power_lost
      // NO se cierra aqui. Sustituto software del reto BLE (diferido a firmware).
      await tx.incident.updateMany({
        where: { deviceId, state: { not: 'CLOSED' }, kind: { in: TRIP_RESOLVING_KINDS } },
        data: { state: 'CLOSED', closedAt: new Date() },
      });
      return tx.device.findUniqueOrThrow({ where: { id: deviceId }, select: DEVICE_PUBLIC_FIELDS });
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
      return tx.device.update({
        where: { id: deviceId },
        data: { state: 'ARMED', tripState: 'IDLE' },
        select: DEVICE_PUBLIC_FIELDS,
      });
    });
  }

  listIncidents(deviceId: string, ownerId: string) {
    return this.prisma.incident.findMany({
      where: { device: { id: deviceId, ownerId } },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });
  }

  /**
   * "Revisado": OPEN -> ACKNOWLEDGED. Guardado atomico por estado (mismo patron
   * que startTrip). NO desarma ni cambia DeviceState: reconocer una alerta no
   * es autorizarla. Solo actua sobre incidentes propios y aun abiertos.
   */
  async acknowledgeIncident(incidentId: string, ownerId: string) {
    const advanced = await this.prisma.incident.updateMany({
      where: { id: incidentId, state: 'OPEN', device: { ownerId } },
      data: { state: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
    });
    if (advanced.count === 0) {
      // No existe, no es suyo, o ya no estaba OPEN.
      throw new NotFoundException('Open incident not found');
    }
    return this.prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
  }

  /** Cierre explicito del incidente. OPEN|ACKNOWLEDGED -> CLOSED. */
  async closeIncident(incidentId: string, ownerId: string) {
    const advanced = await this.prisma.incident.updateMany({
      where: { id: incidentId, state: { not: 'CLOSED' }, device: { ownerId } },
      data: { state: 'CLOSED', closedAt: new Date() },
    });
    if (advanced.count === 0) {
      throw new NotFoundException('Open incident not found');
    }
    return this.prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
  }

  // ============ Canal de comandos backend -> dispositivo (PR2) ============

  /** Expiracion lazy: los PENDING caducados mueren al leerse, sin cron. */
  private async expireStaleCommands(deviceId: string) {
    await this.prisma.command.updateMany({
      where: { deviceId, status: 'PENDING', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
  }

  /**
   * LOCATE_NOW: pide una posicion fresca. Reutiliza el PENDING vivo en vez de
   * encolar otro (la UI ademas deshabilita el boton mientras espera). El
   * get-or-create va en transaccion serializable: dos requestLocate
   * concurrentes no pueden colarse entre el read y el create — uno aborta
   * (P2034), reintenta y se encuentra el PENDING del ganador.
   */
  async requestLocate(deviceId: string, ownerId: string) {
    await this.requireOwnedDevice(deviceId, ownerId);
    await this.expireStaleCommands(deviceId);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Solo cuenta como vivo el que no ha expirado ya: uno que vencio
            // entre el expireStale y esta lectura es un muerto, no se reutiliza.
            const existing = await tx.command.findFirst({
              where: {
                deviceId,
                type: 'LOCATE_NOW',
                status: 'PENDING',
                expiresAt: { gt: new Date() },
              },
              orderBy: { createdAt: 'desc' },
            });
            if (existing) {
              return existing;
            }
            return tx.command.create({
              data: {
                deviceId,
                type: 'LOCATE_NOW',
                expiresAt: new Date(Date.now() + LOCATE_TTL_MS),
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        // Conflicto de serializacion (get-or-create corrido): reintenta una
        // vez y encuentra el comando del ganador; a la segunda, error real.
        if (
          attempt === 0 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  /** Vista del dueño: historial de comandos con expiracion lazy aplicada. */
  async listCommands(deviceId: string, ownerId: string) {
    await this.requireOwnedDevice(deviceId, ownerId);
    await this.expireStaleCommands(deviceId);
    return this.prisma.command.findMany({
      where: { device: { id: deviceId, ownerId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * Poll del dispositivo: que comandos tengo pendientes. Autenticado con
   * K_command (el canal de eventos usa K_event; jamas se comparte clave).
   * El wake best-effort es diferido a firmware: aqui el dispositivo ya esta
   * despierto y pregunta — despertar nunca fue autorizar (docs v0.6 S8).
   */
  async pollCommands(deviceId: string, rawBody: Buffer, signature: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    // Mismo coste uniforme que ingest: la 401 no enumera por mensaje ni por tiempo.
    const key = deriveKey(decryptSecret(device?.secret ?? DUMMY_ROOT_SECRET), deviceId, 'command');
    if (!device || !verify(rawBody, key, signature)) {
      // 401 uniforme como ingest: no permitir enumerar deviceIds validos.
      throw new UnauthorizedException('Bad signature');
    }
    try {
      decodePollRequest(rawBody, deviceId);
    } catch (error) {
      if (error instanceof ProtocolError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    await this.expireStaleCommands(deviceId);
    return this.prisma.command.findMany({
      where: { deviceId, status: 'PENDING', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
