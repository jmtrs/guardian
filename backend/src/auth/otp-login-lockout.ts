import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const RESERVATION_STALE_MS = 30 * 1000;
const SIGN_IN_PATH = '/api/auth/sign-in/email-otp';
const COUNTED_ERROR_CODES = new Set(['INVALID_OTP', 'TOO_MANY_ATTEMPTS']);

type FailureState = {
  failedAttempts: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
};

export function nextFailureState(previous: FailureState | null, now: Date): FailureState {
  const windowExpired =
    previous === null || now.getTime() - previous.windowStartedAt.getTime() >= WINDOW_MS;
  const failedAttempts = windowExpired ? 1 : previous.failedAttempts + 1;

  return {
    failedAttempts,
    windowStartedAt: windowExpired ? now : previous.windowStartedAt,
    lockedUntil: failedAttempts >= MAX_FAILURES ? new Date(now.getTime() + WINDOW_MS) : null,
  };
}

async function guardedEmail(request: Request, targetEmail: string): Promise<string | undefined> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== SIGN_IN_PATH) {
    return undefined;
  }

  try {
    const body = (await request.clone().json()) as { email?: unknown };
    if (typeof body.email !== 'string') {
      return undefined;
    }
    const email = body.email.trim().toLowerCase();
    return email === targetEmail ? email : undefined;
  } catch {
    return undefined;
  }
}

async function isCountedFailure(response: Response): Promise<boolean> {
  if (response.ok) {
    return false;
  }
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body.code === 'string' && COUNTED_ERROR_CODES.has(body.code);
  } catch {
    return false;
  }
}

function blockedResponse(retryAfter: number): Response {
  return Response.json(
    {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many invalid codes. Try again later.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-Retry-After': String(retryAfter),
      },
    },
  );
}

type Reservation = { generation: string };
type ReservationResult =
  { reservation: Reservation; retryAfter?: never } | { reservation?: never; retryAfter: number };

async function withEmailLock<T>(
  prisma: PrismaClient,
  email: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`;
      return operation(tx);
    },
    { maxWait: 5_000, timeout: 5_000 },
  );
}

async function reserveAttempt(prisma: PrismaClient, email: string): Promise<ReservationResult> {
  return withEmailLock(prisma, email, async (tx) => {
    const now = new Date();
    const previous = await tx.otpLoginLockout.findUnique({ where: { email } });
    if (previous?.lockedUntil && previous.lockedUntil.getTime() > now.getTime()) {
      return {
        retryAfter: Math.max(1, Math.ceil((previous.lockedUntil.getTime() - now.getTime()) / 1000)),
      };
    }

    const windowExpired =
      previous === null || now.getTime() - previous.windowStartedAt.getTime() >= WINDOW_MS;
    const pendingExpired =
      previous !== null &&
      previous.pendingAttempts > 0 &&
      now.getTime() - previous.updatedAt.getTime() >= RESERVATION_STALE_MS;
    const generation = windowExpired || pendingExpired ? randomUUID() : previous.generation;
    const failedAttempts = windowExpired ? 0 : previous.failedAttempts;
    const pendingAttempts = windowExpired || pendingExpired ? 0 : previous.pendingAttempts;

    // Cinco verificaciones como maximo pueden estar fallando o en vuelo. Una
    // reserva en vuelo solo bloquea brevemente; un quinto fallo bloquea 15 min.
    if (failedAttempts + pendingAttempts >= MAX_FAILURES) {
      return { retryAfter: 1 };
    }

    await tx.otpLoginLockout.upsert({
      where: { email },
      create: {
        email,
        generation,
        failedAttempts,
        pendingAttempts: 1,
        windowStartedAt: now,
        lockedUntil: null,
      },
      update: {
        generation,
        failedAttempts,
        pendingAttempts: pendingAttempts + 1,
        windowStartedAt: windowExpired ? now : previous.windowStartedAt,
        lockedUntil: null,
      },
    });
    return { reservation: { generation } };
  });
}

type AttemptOutcome = 'success' | 'failure' | 'release';

async function finalizeAttempt(
  prisma: PrismaClient,
  email: string,
  reservation: Reservation,
  outcome: AttemptOutcome,
): Promise<void> {
  await withEmailLock(prisma, email, async (tx) => {
    const previous = await tx.otpLoginLockout.findUnique({ where: { email } });
    if (!previous || previous.generation !== reservation.generation) {
      return;
    }

    if (outcome === 'success') {
      await tx.otpLoginLockout.delete({ where: { email } });
      return;
    }

    const pendingAttempts = Math.max(0, previous.pendingAttempts - 1);
    if (outcome === 'release') {
      await tx.otpLoginLockout.update({
        where: { email },
        data: { pendingAttempts },
      });
      return;
    }

    const now = new Date();
    const next = nextFailureState(previous, now);
    await tx.otpLoginLockout.update({
      where: { email },
      data: {
        ...next,
        pendingAttempts,
      },
    });
  });
}

async function runReservedAttempt(
  prisma: PrismaClient,
  email: string,
  reservation: Reservation,
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  let response: Response;
  try {
    response = await handler(request);
  } catch (error) {
    await finalizeAttempt(prisma, email, reservation, 'release');
    throw error;
  }

  if (response.ok) {
    await finalizeAttempt(prisma, email, reservation, 'success');
  } else if (await isCountedFailure(response)) {
    await finalizeAttempt(prisma, email, reservation, 'failure');
  } else {
    await finalizeAttempt(prisma, email, reservation, 'release');
  }
  return response;
}

export async function withTemporaryOtpLockout(
  prisma: PrismaClient,
  targetEmail: string,
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  const email = await guardedEmail(request, targetEmail);
  if (!email) {
    return handler(request);
  }

  const result = await reserveAttempt(prisma, email);
  if (!result.reservation) {
    return blockedResponse(result.retryAfter);
  }
  return runReservedAttempt(prisma, email, result.reservation, request, handler);
}
