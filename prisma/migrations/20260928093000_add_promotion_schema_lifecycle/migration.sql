-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PromotionRewardType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE', 'SPEND_THRESHOLD');

-- CreateEnum
CREATE TYPE "PromotionCodeType" AS ENUM ('SHARED', 'UNIQUE');

-- CreateEnum
CREATE TYPE "PromotionCodeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "rewardType" "PromotionRewardType" NOT NULL,
    "discountCents" INTEGER,
    "discountPercent" INTEGER,
    "maxDiscountCents" INTEGER,
    "minimumSpendCents" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "appliesToAllBranches" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Promotion_name_not_blank" CHECK (char_length(btrim("name")) > 0),
    CONSTRAINT "Promotion_valid_window" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" > "validFrom"),
    CONSTRAINT "Promotion_reward_configuration" CHECK (
        ("rewardType" = 'FIXED_AMOUNT' AND "discountCents" > 0 AND "discountPercent" IS NULL AND "maxDiscountCents" IS NULL AND "minimumSpendCents" IS NULL)
        OR
        ("rewardType" = 'PERCENTAGE' AND "discountCents" IS NULL AND "discountPercent" BETWEEN 1 AND 100 AND ("maxDiscountCents" IS NULL OR "maxDiscountCents" > 0) AND "minimumSpendCents" IS NULL)
        OR
        ("rewardType" = 'SPEND_THRESHOLD' AND "discountCents" > 0 AND "discountPercent" IS NULL AND "maxDiscountCents" IS NULL AND "minimumSpendCents" > 0)
    )
);

-- CreateTable
CREATE TABLE "PromotionBranch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeType" "PromotionCodeType" NOT NULL,
    "status" "PromotionCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PromotionCode_code_not_blank" CHECK (char_length(btrim("code")) > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_id_organizationId_key" ON "Promotion"("id", "organizationId");

-- CreateIndex
CREATE INDEX "Promotion_organizationId_status_validFrom_validUntil_idx" ON "Promotion"("organizationId", "status", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "Promotion_organizationId_rewardType_idx" ON "Promotion"("organizationId", "rewardType");

-- CreateIndex
CREATE INDEX "Promotion_organizationId_createdByUserId_idx" ON "Promotion"("organizationId", "createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionBranch_id_organizationId_key" ON "PromotionBranch"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionBranch_promotionId_branchId_key" ON "PromotionBranch"("promotionId", "branchId");

-- CreateIndex
CREATE INDEX "PromotionBranch_organizationId_branchId_idx" ON "PromotionBranch"("organizationId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionCode_id_organizationId_key" ON "PromotionCode"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionCode_organizationId_code_key" ON "PromotionCode"("organizationId", "code");

-- CreateIndex
CREATE INDEX "PromotionCode_organizationId_promotionId_status_idx" ON "PromotionCode"("organizationId", "promotionId", "status");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RestaurantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_organizationId_createdByUserId_fkey" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBranch" ADD CONSTRAINT "PromotionBranch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RestaurantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBranch" ADD CONSTRAINT "PromotionBranch_promotionId_organizationId_fkey" FOREIGN KEY ("promotionId", "organizationId") REFERENCES "Promotion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBranch" ADD CONSTRAINT "PromotionBranch_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCode" ADD CONSTRAINT "PromotionCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RestaurantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionCode" ADD CONSTRAINT "PromotionCode_promotionId_organizationId_fkey" FOREIGN KEY ("promotionId", "organizationId") REFERENCES "Promotion"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
