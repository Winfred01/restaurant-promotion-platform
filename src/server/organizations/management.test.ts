import { BranchStatus, MembershipRole, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import {
  BranchUnavailableError,
  createBranchManagementService,
  LastActiveBranchError
} from "./management";

describe("branch management input validation", () => {
  it("rejects invalid names and timezones before opening a transaction", async () => {
    const service = createBranchManagementService({} as PrismaClient);
    const base = { organizationId: "org", actorUserId: "user" };
    await expect(
      service.create({ ...base, name: " ", timezone: "America/Toronto" })
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      service.create({ ...base, name: "Downtown", timezone: "Bad/Zone" })
    ).rejects.toThrow("Enter a valid IANA timezone.");
  });
});

const databaseUrl = process.env.DATABASE_URL ?? "";
const describeWithLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl)
  ? describe
  : describe.skip;

describeWithLocalDatabase("branch management persistence", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);
  const service = createBranchManagementService(db);

  beforeAll(async () => {
    await db.$connect();
  });
  afterEach(async () => {
    await harness.cleanup();
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  it("lets an Owner create, edit and archive a branch while retaining audit history", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const base = { organizationId: scope.organization.id, actorUserId: scope.user.id };
    const created = await service.create({
      ...base,
      name: "Riverside",
      timezone: "America/Toronto"
    });
    expect(created.status).toBe(BranchStatus.ACTIVE);
    const edited = await service.edit({
      ...base,
      branchId: created.id,
      name: "Riverside East",
      timezone: "America/Vancouver"
    });
    expect(edited.name).toBe("Riverside East");
    const archived = await service.archive({ ...base, branchId: created.id });
    expect(archived.status).toBe(BranchStatus.ARCHIVED);
    await expect(
      db.branch.findFirst({ where: { id: created.id, organizationId: scope.organization.id } })
    ).resolves.toMatchObject({ status: BranchStatus.ARCHIVED });
    const audits = await db.auditLog.findMany({
      where: { organizationId: scope.organization.id, entityType: "Branch", entityId: created.id },
      orderBy: { createdAt: "asc" }
    });
    expect(audits.map(({ action }) => action)).toEqual([
      "BRANCH_CREATED",
      "BRANCH_UPDATED",
      "BRANCH_ARCHIVED"
    ]);
    expect(
      audits.every(
        ({ actorUserId, actorRole }) =>
          actorUserId === scope.user.id && actorRole === MembershipRole.OWNER
      )
    ).toBe(true);
  });

  it("denies Manager writes and cross-tenant branch IDs", async () => {
    const owner = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const manager = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const ownerBase = { organizationId: owner.organization.id, actorUserId: owner.user.id };
    await expect(
      service.create({
        organizationId: manager.organization.id,
        actorUserId: manager.user.id,
        name: "Denied",
        timezone: "America/Toronto"
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.edit({
        ...ownerBase,
        branchId: manager.branch.id,
        name: "Changed",
        timezone: "America/Toronto"
      })
    ).rejects.toBeInstanceOf(BranchUnavailableError);
    await expect(
      service.archive({ ...ownerBase, branchId: manager.branch.id })
    ).rejects.toBeInstanceOf(BranchUnavailableError);
    await expect(db.branch.findUnique({ where: { id: manager.branch.id } })).resolves.toMatchObject(
      { status: BranchStatus.ACTIVE }
    );
  });

  it("retains the last active branch so its Owner can still reach the workspace", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    await expect(
      service.archive({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: scope.branch.id
      })
    ).rejects.toBeInstanceOf(LastActiveBranchError);
    await expect(db.branch.findUnique({ where: { id: scope.branch.id } })).resolves.toMatchObject({
      status: BranchStatus.ACTIVE
    });
  });
});
