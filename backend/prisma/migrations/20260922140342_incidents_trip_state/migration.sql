-- CreateEnum
CREATE TYPE "TripState" AS ENUM ('IDLE', 'REQUESTED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "IncidentKind" AS ENUM ('suspected_movement', 'power_lost');

-- CreateEnum
CREATE TYPE "IncidentState" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'CLOSED');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "tripState" "TripState" NOT NULL DEFAULT 'IDLE',
ADD COLUMN     "workshopUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "kind" "IncidentKind" NOT NULL,
    "state" "IncidentState" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "openedByEventSeq" INTEGER NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidents_deviceId_state_idx" ON "incidents"("deviceId", "state");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
