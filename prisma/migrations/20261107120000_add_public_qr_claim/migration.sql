ALTER TABLE "CustomerPromotionClaim" ALTER COLUMN "claimedByUserId" DROP NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "actorUserId" DROP NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "actorRole" DROP NOT NULL;

ALTER TABLE "CustomerPromotionClaim" ADD CONSTRAINT "CustomerPromotionClaim_source_actor_match"
  CHECK (("source" = 'QR' AND "claimedByUserId" IS NULL) OR ("source" = 'STAFF' AND "claimedByUserId" IS NOT NULL));
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_pair_match"
  CHECK (("actorUserId" IS NULL AND "actorRole" IS NULL) OR ("actorUserId" IS NOT NULL AND "actorRole" IS NOT NULL));
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_anonymous_qr_only"
  CHECK ("actorUserId" IS NOT NULL OR ("action" = 'PROMOTION_CLAIM_CREATED' AND "entityType" = 'CustomerPromotionClaim' AND COALESCE("afterJson"->>'source', '') = 'QR'));

CREATE TABLE "PublicClaimRateLimit" (
  "key" CHAR(64) NOT NULL,
  "organizationId" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PublicClaimRateLimit_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "PublicClaimRateLimit_count_positive" CHECK ("count" >= 0)
);

CREATE INDEX "PublicClaimRateLimit_expiresAt_idx" ON "PublicClaimRateLimit"("expiresAt");
CREATE INDEX "PublicClaimRateLimit_organizationId_expiresAt_idx" ON "PublicClaimRateLimit"("organizationId", "expiresAt");
