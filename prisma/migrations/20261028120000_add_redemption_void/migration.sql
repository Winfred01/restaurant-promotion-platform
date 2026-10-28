-- Preserve the original redemption while recording one append-only void decision.
ALTER TABLE "Redemption"
  ADD COLUMN "voidedAt" TIMESTAMP(3);

CREATE TABLE "RedemptionVoid" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "voidedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionVoid_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RedemptionVoid_reason_not_blank" CHECK (char_length(btrim("reason")) > 0)
);

CREATE UNIQUE INDEX "RedemptionVoid_id_organizationId_key"
  ON "RedemptionVoid"("id", "organizationId");

CREATE UNIQUE INDEX "RedemptionVoid_redemptionId_organizationId_key"
  ON "RedemptionVoid"("redemptionId", "organizationId");

CREATE INDEX "RedemptionVoid_organizationId_createdAt_idx"
  ON "RedemptionVoid"("organizationId", "createdAt");

CREATE INDEX "RedemptionVoid_organizationId_voidedByUserId_createdAt_idx"
  ON "RedemptionVoid"("organizationId", "voidedByUserId", "createdAt");

ALTER TABLE "RedemptionVoid" ADD CONSTRAINT "RedemptionVoid_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "RestaurantOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RedemptionVoid" ADD CONSTRAINT "RedemptionVoid_redemptionId_organizationId_fkey"
  FOREIGN KEY ("redemptionId", "organizationId") REFERENCES "Redemption"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RedemptionVoid" ADD CONSTRAINT "RedemptionVoid_organizationId_voidedByUserId_fkey"
  FOREIGN KEY ("organizationId", "voidedByUserId") REFERENCES "OrganizationMembership"("organizationId", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
