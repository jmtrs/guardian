-- Device identities used by simulators must never share a sequence domain with
-- physical firmware.
CREATE TYPE "DeviceKind" AS ENUM ('PHYSICAL', 'SIMULATOR');

ALTER TABLE "devices"
ADD COLUMN "kind" "DeviceKind" NOT NULL DEFAULT 'PHYSICAL',
ADD COLUMN "heartbeatIntervalSec" INTEGER;

ALTER TABLE "devices"
ADD CONSTRAINT "devices_heartbeat_interval_bounds"
CHECK (
  "heartbeatIntervalSec" IS NULL
  OR "heartbeatIntervalSec" BETWEEN 60 AND 604800
);

-- Silence is an incident caused by absence, so it has no opening event seq.
ALTER TYPE "IncidentKind" ADD VALUE 'signal_lost';

ALTER TABLE "incidents"
ALTER COLUMN "openedByEventSeq" DROP NOT NULL;

-- Enforce the invariant documented by DevicesService across processes too.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "incidents"
    WHERE "state" = 'OPEN'
    GROUP BY "deviceId", "kind"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate OPEN incidents must be resolved before this migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "incidents_one_open_kind_per_device"
ON "incidents" ("deviceId", "kind")
WHERE "state" = 'OPEN';
