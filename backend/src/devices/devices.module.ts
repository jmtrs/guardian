import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DevicesController, IngestController } from './ingest.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [IngestController, DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
