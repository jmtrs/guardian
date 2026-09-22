import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import type { PrismaClient } from '@prisma/client';

/**
 * Tipo estructural: solo exponemos lo que usamos (handler Web + api).
 * Evita TS2742 al inferir el tipo completo de betterAuth (arrastra zod interno).
 */
export type AuthSessionUser = {
  id: string;
  email: string;
  name: string;
};

export type Auth = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (options: { headers: Headers }) => Promise<
      | {
          session: { id: string; userId: string; token: string };
          user: AuthSessionUser;
        }
      | null
    >;
  };
};

export function createAuth(prisma: PrismaClient, baseUrl: string, secret: string): Auth {
  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    baseURL: baseUrl,
    secret,
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:8081',
      'http://127.0.0.1:8081',
      // Dev build (dev-client / produccion): el fetch nativo manda Origin
      // con el scheme de la app (app.json -> expo.scheme). El plugin expo()
      // no siempre lo registra, asi que lo listamos explicitamente.
      'guardian://',
      // Expo Go via adb reverse: Origin es exp://127.0.0.1:8081.
      'exp://127.0.0.1:8081',
      'exp://localhost:8081',
      // Expo Go en LAN: exp://IP:8081 — pasar por TRUSTED_ORIGINS (coma-separado).
      ...(process.env.TRUSTED_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ],
    emailAndPassword: {
      // Sin password: entrada solo por codigo OTP al email.
      enabled: false,
    },
    plugins: [
      // Marca el scheme guardian:// como origen de confianza para la app Expo.
      expo(),
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10, // 10 minutos
        allowedAttempts: 5,
        // Solo dev: OTP fijo 000000 para iterar rapido sin abrir el log.
        // En produccion no se define generateOTP → aleatorio.
        ...(process.env.NODE_ENV !== 'production'
          ? { generateOTP: () => '000000' }
          : {}),
        async sendVerificationOTP({ email, otp, type }) {
          if (process.env.NODE_ENV === 'production') {
            // Fail closed until a real mail transport is implemented. Never put
            // authentication codes in production logs, even if a provider key
            // happens to be configured.
            throw new Error('Production OTP delivery is not implemented');
          }
          // Development only: fixed OTP and console output keep local iteration cheap.
          // eslint-disable-next-line no-console
          console.log(`[Guardian OTP] ${type} -> ${email}: ${otp}`);
        },
      }),
    ],
  }) as unknown as Auth;
}
