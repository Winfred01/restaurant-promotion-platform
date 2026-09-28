import { MembershipRole, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { type EmployeeSession } from "@/server/auth/session";
import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import { AcquisitionChannelRequiredError } from "./creation";
import { InvalidPhoneNumberError } from "./phone";
import { createStaffCustomerWorkflow } from "./staff-workflow";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

function employeeSession(userId: string): EmployeeSession {
  return {
    user: {
      id: userId,
      email: "staff@example.com",
      name: "Staff User"
    }
  };
}

describe("staff customer workflow authentication", () => {
  it("denies an unauthenticated request before accessing persistence", async () => {
    const workflow = createStaffCustomerWorkflow({
      db: {} as PrismaClient,
      loadSession: async () => null
    });

    await expect(
      workflow.lookup({
        organizationId: "organization-1",
        branchId: "branch-1",
        phoneNumber: "416-555-0100"
      })
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });
});

describeWithLocalDatabase("staff customer workflow authorization", () => {
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

  function workflowFor(userId: string) {
    return createStaffCustomerWorkflow({
      db,
      loadSession: async () => employeeSession(userId)
    });
  }

  it("allows authorized Staff to look up an organization customer", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.STAFF
    });
    const customer = await harness.createCustomer(scope.organization, {
      phoneNumber: "416-555-0101",
      phoneNumberDisplay: "(***) ***-0101"
    });

    await expect(
      workflowFor(scope.user.id).lookup({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        phoneNumber: "+1 416 555 0101"
      })
    ).resolves.toEqual({
      customer: {
        id: customer.id,
        phoneNumberDisplay: "(***) ***-0101",
        acquisitionChannelId: null,
        firstSeenAt: customer.firstSeenAt,
        lastSeenAt: customer.lastSeenAt
      }
    });
  });

  it("allows authorized Staff to create a new customer without exposing raw phone fields", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.STAFF
    });
    const channel = await harness.createAcquisitionChannel(scope.organization);
    const result = await workflowFor(scope.user.id).create({
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      phoneNumber: "416-555-0102",
      phoneNumberDisplay: "(***) ***-0102",
      acquisitionChannelId: channel.id
    });

    expect(result.isNewCustomer).toBe(true);
    expect(result.customer).toMatchObject({
      phoneNumberDisplay: "(***) ***-0102",
      acquisitionChannelId: channel.id
    });
    expect(result.customer).not.toHaveProperty("phoneNumberRaw");
    expect(result.customer).not.toHaveProperty("phoneNumberNormalized");
  });

  it("requires an acquisition channel only when a new customer must be created", async () => {
    const scope = await harness.createTenantScope();
    const workflow = workflowFor(scope.user.id);

    await expect(
      workflow.create({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        phoneNumber: "416-555-0103"
      })
    ).rejects.toBeInstanceOf(AcquisitionChannelRequiredError);

    const existing = await harness.createCustomer(scope.organization, {
      phoneNumber: "416-555-0103"
    });
    await expect(
      workflow.create({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        phoneNumber: "+1 416 555 0103"
      })
    ).resolves.toMatchObject({
      customer: { id: existing.id },
      isNewCustomer: false
    });
  });

  it("does not overwrite the acquisition channel of a returning customer", async () => {
    const scope = await harness.createTenantScope();
    const originalChannel = await harness.createAcquisitionChannel(scope.organization, {
      name: "Original"
    });
    const laterChannel = await harness.createAcquisitionChannel(scope.organization, {
      name: "Later"
    });
    const customer = await harness.createCustomer(scope.organization, {
      phoneNumber: "416-555-0104",
      acquisitionChannelId: originalChannel.id
    });

    const result = await workflowFor(scope.user.id).create({
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      phoneNumber: "+1 416 555 0104",
      acquisitionChannelId: laterChannel.id
    });

    expect(result).toMatchObject({
      customer: { id: customer.id, acquisitionChannelId: originalChannel.id },
      isNewCustomer: false
    });
  });

  it("denies disabled users and disabled memberships", async () => {
    const disabledUserScope = await harness.createTenantScope({
      user: { status: "DISABLED" }
    });
    const disabledMembershipScope = await harness.createTenantScope({
      organizationMembershipStatus: "DISABLED"
    });

    for (const scope of [disabledUserScope, disabledMembershipScope]) {
      await expect(
        workflowFor(scope.user.id).lookup({
          organizationId: scope.organization.id,
          branchId: scope.branch.id,
          phoneNumber: "416-555-0105"
        })
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    }
  });

  it("denies a branch where Staff has no active membership", async () => {
    const scope = await harness.createTenantScope();
    const unauthorizedBranch = await harness.createBranch(scope.organization, {
      name: "Unauthorized Branch"
    });

    await expect(
      workflowFor(scope.user.id).lookup({
        organizationId: scope.organization.id,
        branchId: unauthorizedBranch.id,
        phoneNumber: "416-555-0106"
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("denies cross-organization lookup even with client-supplied tenant and branch ids", async () => {
    const tenantA = await harness.createTenantScope({ tenant: { name: "A", slug: "a" } });
    const tenantB = await harness.createTenantScope({ tenant: { name: "B", slug: "b" } });
    await harness.createCustomer(tenantB.organization, { phoneNumber: "416-555-0107" });

    await expect(
      workflowFor(tenantA.user.id).lookup({
        organizationId: tenantB.organization.id,
        branchId: tenantB.branch.id,
        phoneNumber: "416-555-0107"
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("denies cross-organization creation and leaves the target tenant unchanged", async () => {
    const tenantA = await harness.createTenantScope({ tenant: { name: "A", slug: "a" } });
    const tenantB = await harness.createTenantScope({ tenant: { name: "B", slug: "b" } });
    const channelB = await harness.createAcquisitionChannel(tenantB.organization);

    await expect(
      workflowFor(tenantA.user.id).create({
        organizationId: tenantB.organization.id,
        branchId: tenantB.branch.id,
        phoneNumber: "416-555-0108",
        acquisitionChannelId: channelB.id
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      db.customer.count({ where: { organizationId: tenantB.organization.id } })
    ).resolves.toBe(0);
  });

  it("rejects invalid input without exposing the raw phone value", async () => {
    const scope = await harness.createTenantScope();
    const rawPhone = "416-PRIVATE";

    try {
      await workflowFor(scope.user.id).lookup({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        phoneNumber: rawPhone
      });
      throw new Error("Expected customer lookup to reject invalid input.");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPhoneNumberError);
      expect((error as Error).message).not.toContain(rawPhone);
    }
  });
});
