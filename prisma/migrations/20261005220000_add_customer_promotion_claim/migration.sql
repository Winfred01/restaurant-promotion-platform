-- CreateEnum
CREATE TYPE "PromotionClaimStatus" AS ENUM ('CLAIMED', 'REDEEMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PromotionClaimSource" AS ENUM ('STAFF', 'QR');

-- CreateTable
CREATE TABLE "CustomerPromotionClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "promotionCodeId" TEXT,
    "claimedByUserId" TEXT NOT NULL,
    "source" "PromotionClaimSource" NOT NULL DEFAULT 'STAFF',
    "status" "PromotionClaimStatus" NOT NULL DEFAULT 'CLAIMED',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPromotionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPromotionClaim_id_organizationId_key" ON "CustomerPromotionClaim"("id", "organizationId");

-- CreateIndex
CREATE INDEX "CustomerPromotionClaim_organizationId_customerId_status_idx" ON "CustomerPromotionClaim"("organizationId", "customerId", "status");

-- CreateIndex
CREATE INDEX "CustomerPromotionClaim_organizationId_promotionId_status_idx" ON "CustomerPromotionClaim"("organizationId", "promotionId", "status");

-- Only one active claim per customer and promotion, including concurrent attempts.
CREATE UNIQUE INDEX "CustomerPromotionClaim_one_active_per_customer_promotion"
    ON "CustomerPromotionClaim"("organizationId", "customerId", "promotionId")
    WHERE "status" = 'CLAIMED';

-- AddForeignKey
ALTER TABLE "CustomerPromotionClaim" ADD CONSTRAINT "CustomerPromotionClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RestaurantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPromotionClaim" ADD CONSTRAINT "CustomerPromotionClaim_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPromotionClaim" ADD CONSTRAINT "CustomerPromotionClaim_customerId_organizationId_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPromotionClaim" ADD CONSTRAINT "CustomerPromotionClaim_promotionId_organizationId_fkey" FOREIGN KEY ("promotionId", "organizationId") REFERENCES "Promotion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPromotionClaim" ADD CONSTRAINT "CustomerPromotionClaim_promotionCodeId_organizationId_promotionId_fkey" FOREIGN KEY ("promotionCodeId", "organizationId", "promotionId") REFERENCES "PromotionCode"("id", "organizationId", "promotionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPromotionClaim" ADD CONSTRAINT "CustomerPromotionClaim_organizationId_claimedByUserId_fkey" FOREIGN KEY ("organizationId", "claimedByUserId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
