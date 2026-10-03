-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "promotionCodeId" TEXT,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'COMPLETED',
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromotionCode_id_organizationId_promotionId_key" ON "PromotionCode"("id", "organizationId", "promotionId");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_id_organizationId_key" ON "Redemption"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Redemption_organizationId_customerId_promotionId_status_idx" ON "Redemption"("organizationId", "customerId", "promotionId", "status");

-- CreateIndex
CREATE INDEX "Redemption_organizationId_branchId_status_idx" ON "Redemption"("organizationId", "branchId", "status");

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RestaurantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_promotionId_organizationId_fkey" FOREIGN KEY ("promotionId", "organizationId") REFERENCES "Promotion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_promotionCodeId_organizationId_promotionId_fkey" FOREIGN KEY ("promotionCodeId", "organizationId", "promotionId") REFERENCES "PromotionCode"("id", "organizationId", "promotionId") ON DELETE RESTRICT ON UPDATE CASCADE;
