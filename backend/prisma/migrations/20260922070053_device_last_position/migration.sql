-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "lastBatteryMv" INTEGER,
ADD COLUMN     "lastFixAt" TIMESTAMP(3),
ADD COLUMN     "lastLat" DOUBLE PRECISION,
ADD COLUMN     "lastLon" DOUBLE PRECISION;
