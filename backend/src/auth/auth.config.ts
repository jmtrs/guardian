import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import type { PrismaClient } from '@prisma/client';

/**
 * Tipo estructural: solo exponemos lo que usamos (el handler Web).
 * Evita TS2742 al inferir el tipo completo de betterAuth (arrastra zod interno).
 */
export type Auth = {
  handler: (request: Request) => Promise<Response>;
};

export function createAuth(prisma: PrismaClient, baseUrl: string, secret: string): Auth {
  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    baseURL: baseUrl,
    secret,
    emailAndPassword: {
      // Sin password: entrada solo por codigo OTP al email.
      enabled: false,
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 10, // 10 minutos
        allowedAttempts: 5,
        async sendVerificationOTP({ email, otp, type }) {
          // Dev: codigo por consola (sin coste).
          // Produccion: TODO enviar via Resend cuando RESEND_API_KEY este listo.
          // eslint-disable-next-line no-console
          console.log(`[Guardian OTP] ${type} -> ${email}: ${otp}`);
        },
      }),
    ],
  });
}
