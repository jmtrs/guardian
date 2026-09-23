import type { PrismaClient } from '@prisma/client';

import { nextFailureState, withTemporaryOtpLockout } from './otp-login-lockout';

type StoredLockout = {
  email: string;
  generation: string;
  failedAttempts: number;
  pendingAttempts: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
  updatedAt: Date;
};

function fakePrisma() {
  let stored: StoredLockout | null = null;
  let inTransaction = false;
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    otpLoginLockout: {
      findUnique: jest.fn(async () => stored),
      delete: jest.fn(async () => {
        stored = null;
      }),
      update: jest.fn(
        async ({ data }: { data: Partial<Omit<StoredLockout, 'email' | 'updatedAt'>> }) => {
          if (!stored) throw new Error('missing fake lockout');
          stored = { ...stored, ...data, updatedAt: new Date() };
          return stored;
        },
      ),
      upsert: jest.fn(
        async ({
          create,
          update,
        }: {
          create: Omit<StoredLockout, 'updatedAt'>;
          update: Partial<Omit<StoredLockout, 'email' | 'updatedAt'>>;
        }) => {
          stored = {
            ...(stored ? { ...stored, ...update } : create),
            updatedAt: new Date(),
          };
          return stored;
        },
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await operation(tx);
      } finally {
        inTransaction = false;
      }
    }),
  } as unknown as PrismaClient;
  return { prisma, tx, stored: () => stored, inTransaction: () => inTransaction };
}

function signInRequest(email: string, ip: string): Request {
  return new Request('https://gtapi.aggc.dev/api/auth/sign-in/email-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ email, otp: '111111' }),
  });
}

const invalidOtp = () =>
  Response.json({ code: 'INVALID_OTP', message: 'Invalid OTP' }, { status: 400 });

describe('temporary OTP persistent lockout', () => {
  const start = new Date('2026-09-23T10:00:00.000Z');

  it('locks for 15 minutes on the fifth failure', () => {
    let state = nextFailureState(null, start);
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      state = nextFailureState(state, new Date(start.getTime() + attempt * 1_000));
    }

    expect(state.failedAttempts).toBe(5);
    expect(state.lockedUntil).toEqual(new Date(start.getTime() + 5_000 + 15 * 60 * 1_000));
  });

  it('resets the failure window after 15 minutes', () => {
    const previous = {
      failedAttempts: 4,
      windowStartedAt: start,
      lockedUntil: null,
    };
    const afterWindow = new Date(start.getTime() + 15 * 60 * 1_000);

    expect(nextFailureState(previous, afterWindow)).toEqual({
      failedAttempts: 1,
      windowStartedAt: afterWindow,
      lockedUntil: null,
    });
  });

  it('blocks the sixth failure across different IPs without calling Better Auth', async () => {
    const { prisma, tx, stored, inTransaction } = fakePrisma();
    const handler = jest.fn(async () => {
      expect(inTransaction()).toBe(false);
      return invalidOtp();
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await withTemporaryOtpLockout(
        prisma,
        'owner@example.com',
        signInRequest('owner@example.com', `198.51.100.${attempt}`),
        handler,
      );
      expect(response.status).toBe(400);
    }

    const blocked = await withTemporaryOtpLockout(
      prisma,
      'owner@example.com',
      signInRequest('owner@example.com', '203.0.113.200'),
      handler,
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect(handler).toHaveBeenCalledTimes(5);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(11);
    expect(stored()?.failedAttempts).toBe(5);
  });

  it('clears prior failures after a successful login', async () => {
    const { prisma, stored } = fakePrisma();

    await withTemporaryOtpLockout(
      prisma,
      'owner@example.com',
      signInRequest('owner@example.com', '198.51.100.1'),
      async () => invalidOtp(),
    );
    expect(stored()?.failedAttempts).toBe(1);

    const success = await withTemporaryOtpLockout(
      prisma,
      'owner@example.com',
      signInRequest('owner@example.com', '203.0.113.1'),
      async () => Response.json({ token: 'session' }),
    );

    expect(success.status).toBe(200);
    expect(stored()).toBeNull();
  });

  it('does not apply the persistent counter to another email', async () => {
    const { prisma } = fakePrisma();
    const handler = jest.fn(async () => invalidOtp());

    await withTemporaryOtpLockout(
      prisma,
      'owner@example.com',
      signInRequest('other@example.com', '198.51.100.1'),
      handler,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores a late response after reclaiming a stale reservation', async () => {
    jest.useFakeTimers().setSystemTime(start);
    try {
      const { prisma, stored } = fakePrisma();
      let startOldHandler!: () => void;
      const oldHandlerStarted = new Promise<void>((resolve) => {
        startOldHandler = resolve;
      });
      let finishOldHandler!: (response: Response) => void;
      const oldHandlerResponse = new Promise<Response>((resolve) => {
        finishOldHandler = resolve;
      });

      const oldAttempt = withTemporaryOtpLockout(
        prisma,
        'owner@example.com',
        signInRequest('owner@example.com', '198.51.100.1'),
        async () => {
          startOldHandler();
          return oldHandlerResponse;
        },
      );
      await oldHandlerStarted;
      const oldGeneration = stored()?.generation;

      jest.advanceTimersByTime(31_000);
      await withTemporaryOtpLockout(
        prisma,
        'owner@example.com',
        signInRequest('owner@example.com', '203.0.113.1'),
        async () => invalidOtp(),
      );
      const newGeneration = stored()?.generation;
      expect(newGeneration).not.toBe(oldGeneration);
      expect(stored()?.failedAttempts).toBe(1);

      finishOldHandler(Response.json({ token: 'late-success' }));
      await oldAttempt;

      expect(stored()?.generation).toBe(newGeneration);
      expect(stored()?.failedAttempts).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
