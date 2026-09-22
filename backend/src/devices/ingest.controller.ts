import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import type { AuthenticatedRequest } from '../auth/auth.guard';
import { BetterAuthGuard } from '../auth/auth.guard';
import { DevicesService } from './devices.service';

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;
}

/**
 * Endpoint del dispositivo. Recibe el envelope crudo (la firma HMAC va sobre
 * los bytes exactos, asi que leemos req.rawBody — ver rawBody en main.ts).
 * Endpoint de ingesta de eventos del dispositivo.
 */
@Controller()
export class IngestController {
  constructor(private readonly devices: DevicesService) {}

  @Post('v1/events')
  @HttpCode(202)
  async ingest(@Req() req: Request) {
    // rawBody lo inyecta Nest con { rawBody: true } en main.ts
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const deviceId = req.headers['x-device-id'];
    const signature = req.headers['x-guardian-signature'];

    if (!rawBody || !deviceId || !signature) {
      throw new BadRequestException('Missing raw body, X-Device-Id or X-Guardian-Signature');
    }

    const result = await this.devices.ingest(
      Array.isArray(deviceId) ? deviceId[0] : deviceId,
      rawBody,
      Array.isArray(signature) ? signature[0] : signature,
    );
    return result;
  }
}

@Controller('v1/devices')
@UseGuards(BetterAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateDeviceDto) {
    return this.devices.createDevice(req.user!.id, body.name);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.devices.listDevices(req.user!.id);
  }

  @Get(':id/events')
  events(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('limit') limit?: string) {
    const parsed = limit !== undefined ? Number(limit) : NaN;
    const safeLimit = Number.isFinite(parsed) ? Math.trunc(parsed) : 50;
    return this.devices.listEvents(id, req.user!.id, safeLimit);
  }

  @Get(':id/positions')
  positions(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('incidentId') incidentId?: string,
    @Query('tripId') tripId?: string,
  ) {
    const parsed = limit !== undefined ? Number(limit) : NaN;
    const safeLimit = Number.isFinite(parsed) ? Math.trunc(parsed) : 50;
    return this.devices.listPositions(id, req.user!.id, safeLimit, {
      incidentId: incidentId || undefined,
      tripId: tripId || undefined,
    });
  }

  @Get(':id/incidents')
  incidents(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.devices.listIncidents(id, req.user!.id);
  }

  @Post(':id/trip/start')
  startTrip(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.devices.startTrip(id, req.user!.id);
  }

  @Post(':id/trip/end')
  endTrip(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.devices.endTrip(id, req.user!.id);
  }

  @Post(':id/commands/locate')
  requestLocate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.devices.requestLocate(id, req.user!.id);
  }

  @Get(':id/commands')
  commands(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.devices.listCommands(id, req.user!.id);
  }
}

// Canal dispositivo: poll de comandos pendientes. Misma autenticacion HMAC
// que /v1/events pero con K_command (contexto propio, nunca K_event).
@Controller()
export class DeviceCommandsController {
  constructor(private readonly devices: DevicesService) {}

  @Post('v1/commands/poll')
  @HttpCode(200)
  async poll(@Req() req: Request) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const deviceId = req.headers['x-device-id'];
    const signature = req.headers['x-guardian-signature'];
    if (!rawBody || !deviceId || !signature) {
      throw new BadRequestException('Missing raw body, X-Device-Id or X-Guardian-Signature');
    }
    return this.devices.pollCommands(
      Array.isArray(deviceId) ? deviceId[0] : deviceId,
      rawBody,
      Array.isArray(signature) ? signature[0] : signature,
    );
  }
}

// Incidentes: acciones sobre un incidente concreto. Reconocer NO desarma.
@Controller('v1/incidents')
@UseGuards(BetterAuthGuard)
export class IncidentsController {
  constructor(private readonly devices: DevicesService) {}

  @Post(':id/acknowledge')
  acknowledge(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.devices.acknowledgeIncident(id, req.user!.id);
  }

  @Post(':id/close')
  close(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.devices.closeIncident(id, req.user!.id);
  }
}
