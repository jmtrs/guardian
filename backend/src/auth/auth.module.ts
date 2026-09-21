import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

import { AUTH_INSTANCE } from './auth.constants';
import { createAuth } from './auth.config';
import { AuthController } from './auth.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_INSTANCE,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => {
        const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
        const secret = process.env.BETTER_AUTH_SECRET;
        if (!secret) {
          throw new Error('BETTER_AUTH_SECRET is required. Copy backend/.env.example to backend/.env');
        }
        return createAuth(prisma, baseUrl, secret);
      },
    },
  ],
  exports: [AUTH_INSTANCE],
})
export class AuthModule {}
