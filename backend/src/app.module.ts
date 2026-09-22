import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { GeocodeModule } from './geocode/geocode.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    DevicesModule,
    GeocodeModule,
    HealthModule,
    PrismaModule,
  ],
})
export class AppModule {}
