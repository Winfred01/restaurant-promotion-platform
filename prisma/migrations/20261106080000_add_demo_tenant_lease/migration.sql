CREATE TYPE "DemoTenantLeaseStatus" AS ENUM ('AVAILABLE', 'CLAIMED');

CREATE TABLE "DemoTenantLease" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "DemoTenantLeaseStatus" NOT NULL DEFAULT 'AVAILABLE',
    "selectedRole" "MembershipRole",
    "selectedUserId" TEXT,
    "ticketHash" TEXT,
    "ticketExpiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DemoTenantLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemoTenantLease_organizationId_key" ON "DemoTenantLease"("organizationId");
CREATE UNIQUE INDEX "DemoTenantLease_ticketHash_key" ON "DemoTenantLease"("ticketHash");
CREATE INDEX "DemoTenantLease_status_createdAt_idx" ON "DemoTenantLease"("status", "createdAt");

ALTER TABLE "DemoTenantLease" ADD CONSTRAINT "DemoTenantLease_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "RestaurantOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
