-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "claimCodeHash" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "pairingExpiresAt" TIMESTAMP(3),
ALTER COLUMN "ownerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "devices_claimCodeHash_idx" ON "devices"("claimCodeHash");
