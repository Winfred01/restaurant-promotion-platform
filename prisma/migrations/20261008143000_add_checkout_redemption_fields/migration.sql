-- Existing eligibility-history rows remain nullable; new checkout writes populate these fields.
ALTER TABLE "Redemption"
  ADD COLUMN "claimId" TEXT,
  ADD COLUMN "redeemedByUserId" TEXT,
  ADD COLUMN "receiptNumber" TEXT,
  ADD COLUMN "normalizedReceiptNumber" TEXT,
  ADD COLUMN "billSubtotalCents" INTEGER,
  ADD COLUMN "discountCents" INTEGER,
  ADD COLUMN "netBillCents" INTEGER;

CREATE UNIQUE INDEX "CustomerPromotionClaim_id_organizationId_branchId_customerId_promotionId_key"
  ON "CustomerPromotionClaim"("id", "organizationId", "branchId", "customerId", "promotionId");

CREATE INDEX "Redemption_organizationId_branchId_normalizedReceiptNumber_status_idx"
  ON "Redemption"("organizationId", "branchId", "normalizedReceiptNumber", "status");

CREATE INDEX "Redemption_organizationId_claimId_idx"
  ON "Redemption"("organizationId", "claimId");

ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_claimId_organizationId_branchId_customerId_promotionId_fkey"
  FOREIGN KEY ("claimId", "organizationId", "branchId", "customerId", "promotionId")
  REFERENCES "CustomerPromotionClaim"("id", "organizationId", "branchId", "customerId", "promotionId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_organizationId_redeemedByUserId_fkey"
  FOREIGN KEY ("organizationId", "redeemedByUserId")
  REFERENCES "OrganizationMembership"("organizationId", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
