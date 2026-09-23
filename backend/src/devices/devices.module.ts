import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  DeviceCommandsController,
  DevicesController,
  IncidentsController,
  IngestController,
} from './ingest.controller';
import { DevicesService } from './devices.service';
import { RetentionService } from './retention.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [IngestController, DevicesController, IncidentsController, DeviceCommandsController],
  providers: [DevicesService, RetentionService],
})
export class DevicesModule {}
