import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import type { PrismaClient } from '@prisma/client';

import { trustedOrigins } from '../config/origins';
import { readTemporaryLoginOtp } from './temporary-login-otp';

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
    getSession: (options: { headers: Headers }) => Promise<{
      session: { id: string; userId: string; token: string };
      user: AuthSessionUser;
    } | null>;
  };
};

export function createAuth(prisma: PrismaClient, baseUrl: string, secret: string): Auth {
  const temporaryLoginOtp =
    process.env.NODE_ENV === 'production' ? readTemporaryLoginOtp() : undefined;

  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    baseURL: baseUrl,
    secret,
    // Fuente unica compartida con CORS (main.ts): en produccion solo el scheme
    // de la app y lo declarado en TRUSTED_ORIGINS; en dev, ademas el bloque local.
    trustedOrigins: trustedOrigins(),
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
        generateOTP: ({ email, type }) => {
          // Dev conserva el codigo conocido para iterar localmente. En prod, el
          // bypass temporal exige email + codigo secretos y solo sirve para login.
          if (process.env.NODE_ENV !== 'production') {
            return '000000';
          }
          if (
            temporaryLoginOtp &&
            type === 'sign-in' &&
            email.trim().toLowerCase() === temporaryLoginOtp.email
          ) {
            return temporaryLoginOtp.code;
          }
          return undefined; // Better Auth genera un OTP aleatorio.
        },
        async sendVerificationOTP({ email, otp, type }) {
          if (process.env.NODE_ENV === 'production') {
            if (
              temporaryLoginOtp &&
              type === 'sign-in' &&
              email.trim().toLowerCase() === temporaryLoginOtp.email &&
              otp === temporaryLoginOtp.code
            ) {
              return;
            }
            // Envio real por email (Resend REST, sin dependencia). Si no hay
            // clave configurada se falla CERRADO: nunca se degrada a consola ni
            // se loguea el codigo en produccion.
            const apiKey = process.env.RESEND_API_KEY;
            if (!apiKey) {
              throw new Error('Production OTP delivery requires RESEND_API_KEY');
            }
            const from = process.env.EMAIL_FROM ?? 'Guardian <onboarding@resend.dev>';
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from,
                to: email,
                subject: 'Tu codigo de acceso Guardian',
                text: `Tu codigo Guardian es ${otp}. Caduca en 10 minutos.`,
              }),
            });
            if (!res.ok) {
              // No incluir el codigo en el error/log.
              throw new Error(`Resend OTP failed with status ${res.status}`);
            }
            return;
          }
          // Development only: fixed OTP and console output keep local iteration cheap.
          // eslint-disable-next-line no-console
          console.log(`[Guardian OTP] ${type} -> ${email}: ${otp}`);
        },
      }),
    ],
  }) as unknown as Auth;
}
