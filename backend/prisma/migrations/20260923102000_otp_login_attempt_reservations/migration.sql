-- AlterTable
ALTER TABLE "otp_login_lockouts"
ADD COLUMN "generation" TEXT NOT NULL DEFAULT '',
ADD COLUMN "pendingAttempts" INTEGER NOT NULL DEFAULT 0;

-- Existing rows can only come from a pre-release local migration. Give each
-- one a stable generation before removing the temporary default.
UPDATE "otp_login_lockouts"
SET "generation" = md5(random()::text || clock_timestamp()::text)
WHERE "generation" = '';

ALTER TABLE "otp_login_lockouts"
ALTER COLUMN "generation" DROP DEFAULT;
