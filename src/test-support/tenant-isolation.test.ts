import { MembershipRole, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { branchAuthorizationRequest, createTenantIsolationHarness } from "./tenant-isolation";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describeWithLocalDatabase("tenant isolation test harness", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("proves a tenant A actor cannot access tenant B", async () => {
    const tenantA = await harness.createTenantScope({
      tenant: { name: "Tenant A", slug: "tenant-a" },
      branch: { name: "A Branch" },
      user: { emailPrefix: "tenant-a-staff" },
      organizationRole: MembershipRole.STAFF
    });
    const tenantB = await harness.createTenantScope({
      tenant: { name: "Tenant B", slug: "tenant-b" },
      branch: { name: "B Branch" },
      user: { emailPrefix: "tenant-b-staff" },
      organizationRole: MembershipRole.STAFF
    });
    const guard = createPrismaAuthorizationGuard(db);

    await expect(
      guard.requireBranchPermission(tenantA.branchRequest(Permission.CUSTOMER_LOOKUP))
    ).resolves.toMatchObject({
      organizationId: tenantA.organization.id,
      branchId: tenantA.branch.id,
      userId: tenantA.user.id
    });

    await expect(
      guard.requireBranchPermission(
        branchAuthorizationRequest({
          organization: tenantA.organization,
          branch: tenantB.branch,
          user: tenantA.user,
          permission: Permission.CUSTOMER_LOOKUP
        })
      )
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    await expect(
      guard.requireBranchPermission(
        branchAuthorizationRequest({
          organization: tenantB.organization,
          branch: tenantB.branch,
          user: tenantA.user,
          permission: Permission.CUSTOMER_LOOKUP
        })
      )
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await expect(
      guard.requireBranchPermission(tenantB.branchRequest(Permission.CUSTOMER_LOOKUP))
    ).resolves.toMatchObject({
      organizationId: tenantB.organization.id,
      branchId: tenantB.branch.id,
      userId: tenantB.user.id
    });
  });
});
