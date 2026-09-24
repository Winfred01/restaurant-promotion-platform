-- CreateEnum
CREATE TYPE "AcquisitionChannelStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "AcquisitionChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "AcquisitionChannelStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcquisitionChannel_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "acquisitionChannelId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AcquisitionChannel_id_organizationId_key" ON "AcquisitionChannel"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AcquisitionChannel_organizationId_name_key" ON "AcquisitionChannel"("organizationId", "name");

-- CreateIndex
CREATE INDEX "AcquisitionChannel_organizationId_status_sortOrder_idx" ON "AcquisitionChannel"("organizationId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "Customer_organizationId_acquisitionChannelId_idx" ON "Customer"("organizationId", "acquisitionChannelId");

-- AddForeignKey
ALTER TABLE "AcquisitionChannel" ADD CONSTRAINT "AcquisitionChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RestaurantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_acquisitionChannelId_organizationId_fkey" FOREIGN KEY ("acquisitionChannelId", "organizationId") REFERENCES "AcquisitionChannel"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
