import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './devices/devices.module';
import { GeocodeModule } from './geocode/geocode.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limit por IP. Default generoso (el canal del dispositivo va aparte,
    // con @SkipThrottle: un antirrobo nunca debe descartar una alerta). El
    // endpoint de claim lleva un limite estricto propio (anti brute-force).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    DevicesModule,
    GeocodeModule,
    HealthModule,
    PrismaModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
