-- Keep successful redemption uniqueness independent of promotion codes and branches.
-- VOIDED rows remain as history and do not block a corrected redemption.
CREATE UNIQUE INDEX "Redemption_one_completed_per_customer_promotion"
  ON "Redemption"("organizationId", "customerId", "promotionId")
  WHERE "status" = 'COMPLETED';

-- Legacy eligibility-history rows have no receipt; PostgreSQL permits those NULLs.
-- A receipt is unique only within its branch's active redemption context.
CREATE UNIQUE INDEX "Redemption_one_completed_per_branch_receipt"
  ON "Redemption"("organizationId", "branchId", "normalizedReceiptNumber")
  WHERE "status" = 'COMPLETED' AND "normalizedReceiptNumber" IS NOT NULL;
