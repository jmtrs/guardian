-- CreateTable
CREATE TABLE "otp_login_lockouts" (
    "email" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otp_login_lockouts_pkey" PRIMARY KEY ("email")
);
