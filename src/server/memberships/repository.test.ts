import { randomUUID } from "node:crypto";

import { MembershipRole, MembershipStatus, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createBranch, createRestaurantOrganization } from "@/server/organizations/repository";
import {
  createBranchMembership,
  createOrganizationMembership,
  getActiveBranchMembership,
  getActiveOrganizationMembership,
  setBranchMembershipRole,
  setBranchMembershipStatus,
  setOrganizationMembershipRole,
  setOrganizationMembershipStatus
} from "./repository";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describeWithLocalDatabase("organization and branch memberships", () => {
  const db = new PrismaClient();
  const fixtureNamespace = randomUUID();
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  let fixtureSequence = 0;

  function uniqueValue(base: string) {
    fixtureSequence += 1;
    return `${base}-${fixtureNamespace}-${fixtureSequence}`;
  }

  async function createOrganization(name: string, slug: string) {
    const organization = await createRestaurantOrganization(db, {
      name,
      slug: uniqueValue(slug)
    });
    organizationIds.push(organization.id);
    return organization;
  }

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await db.branchMembership.deleteMany({
      where: { organizationId: { in: organizationIds } }
    });
    await db.organizationMembership.deleteMany({
      where: { organizationId: { in: organizationIds } }
    });
    await db.branch.deleteMany({
      where: { organizationId: { in: organizationIds } }
    });
    await db.user.deleteMany({
      where: { id: { in: userIds } }
    });
    await db.restaurantOrganization.deleteMany({
      where: { id: { in: organizationIds } }
    });
    organizationIds.length = 0;
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function createUser(emailPrefix: string) {
    const email = `${uniqueValue(emailPrefix)}@example.com`;
    const user = await db.user.create({
      data: {
        email,
        name: email,
        passwordHash: "test-password-hash"
      }
    });
    userIds.push(user.id);
    return user;
  }

  it("assigns one organization role per user and supports tenant-scoped role changes", async () => {
    const organization = await createOrganization("Tenant A", "tenant-a");
    const user = await createUser("manager");

    const membership = await createOrganizationMembership(db, {
      organizationId: organization.id,
      userId: user.id,
      role: MembershipRole.MANAGER
    });

    expect(membership).toMatchObject({
      organizationId: organization.id,
      userId: user.id,
      role: MembershipRole.MANAGER,
      status: MembershipStatus.ACTIVE
    });

    await expect(
      createOrganizationMembership(db, {
        organizationId: organization.id,
        userId: user.id,
        role: MembershipRole.STAFF
      })
    ).rejects.toMatchObject({
      code: "P2002"
    });

    await expect(
      setOrganizationMembershipRole(db, {
        organizationId: "another-tenant",
        userId: user.id,
        role: MembershipRole.OWNER
      })
    ).resolves.toMatchObject({ count: 0 });

    await expect(
      setOrganizationMembershipRole(db, {
        organizationId: organization.id,
        userId: user.id,
        role: MembershipRole.STAFF
      })
    ).resolves.toMatchObject({ count: 1 });

    await expect(
      getActiveOrganizationMembership(db, {
        organizationId: organization.id,
        userId: user.id
      })
    ).resolves.toMatchObject({ role: MembershipRole.STAFF });
  });

  it("requires branch memberships to match an organization membership and branch tenant", async () => {
    const organizationA = await createOrganization("Tenant A", "tenant-a");
    const organizationB = await createOrganization("Tenant B", "tenant-b");
    const branchB = await createBranch(db, {
      organizationId: organizationB.id,
      name: "B Branch"
    });
    const user = await createUser("staff");

    await createOrganizationMembership(db, {
      organizationId: organizationA.id,
      userId: user.id,
      role: MembershipRole.STAFF
    });

    await expect(
      createBranchMembership(db, {
        organizationId: organizationA.id,
        branchId: branchB.id,
        userId: user.id,
        role: MembershipRole.STAFF
      })
    ).rejects.toMatchObject({
      code: "P2003"
    });

    await expect(
      createBranchMembership(db, {
        organizationId: organizationB.id,
        branchId: branchB.id,
        userId: user.id,
        role: MembershipRole.STAFF
      })
    ).rejects.toMatchObject({
      code: "P2003"
    });
  });

  it("enforces one membership per user and branch and keeps updates tenant-scoped", async () => {
    const organization = await createOrganization("Tenant A", "tenant-a");
    const branch = await createBranch(db, {
      organizationId: organization.id,
      name: "Downtown"
    });
    const user = await createUser("branch-manager");

    await createOrganizationMembership(db, {
      organizationId: organization.id,
      userId: user.id,
      role: MembershipRole.MANAGER
    });
    await createBranchMembership(db, {
      organizationId: organization.id,
      branchId: branch.id,
      userId: user.id,
      role: MembershipRole.MANAGER
    });

    await expect(
      createBranchMembership(db, {
        organizationId: organization.id,
        branchId: branch.id,
        userId: user.id,
        role: MembershipRole.STAFF
      })
    ).rejects.toMatchObject({ code: "P2002" });

    await expect(
      setBranchMembershipRole(db, {
        organizationId: "another-tenant",
        branchId: branch.id,
        userId: user.id,
        role: MembershipRole.STAFF
      })
    ).resolves.toMatchObject({ count: 0 });

    await expect(
      setBranchMembershipRole(db, {
        organizationId: organization.id,
        branchId: branch.id,
        userId: user.id,
        role: MembershipRole.STAFF
      })
    ).resolves.toMatchObject({ count: 1 });

    await expect(
      getActiveBranchMembership(db, {
        organizationId: organization.id,
        branchId: branch.id,
        userId: user.id
      })
    ).resolves.toMatchObject({ role: MembershipRole.STAFF });
  });

  it("denies access when either organization or branch membership is disabled", async () => {
    const organization = await createOrganization("Tenant A", "tenant-a");
    const branch = await createBranch(db, {
      organizationId: organization.id,
      name: "Downtown"
    });
    const user = await createUser("disabled");
    const identity = {
      organizationId: organization.id,
      branchId: branch.id,
      userId: user.id
    };

    await createOrganizationMembership(db, {
      organizationId: organization.id,
      userId: user.id,
      role: MembershipRole.MANAGER
    });
    await createBranchMembership(db, {
      ...identity,
      role: MembershipRole.MANAGER
    });

    await expect(getActiveBranchMembership(db, identity)).resolves.toBeTruthy();

    await setOrganizationMembershipStatus(db, {
      organizationId: organization.id,
      userId: user.id,
      status: MembershipStatus.DISABLED
    });

    await expect(
      getActiveOrganizationMembership(db, {
        organizationId: organization.id,
        userId: user.id
      })
    ).resolves.toBeNull();
    await expect(getActiveBranchMembership(db, identity)).resolves.toBeNull();

    await setOrganizationMembershipStatus(db, {
      organizationId: organization.id,
      userId: user.id,
      status: MembershipStatus.ACTIVE
    });
    await setBranchMembershipStatus(db, {
      ...identity,
      status: MembershipStatus.DISABLED
    });

    await expect(getActiveBranchMembership(db, identity)).resolves.toBeNull();
  });

  it("does not expose a branch membership through another tenant", async () => {
    const organizationA = await createOrganization("Tenant A", "tenant-a");
    const organizationB = await createOrganization("Tenant B", "tenant-b");
    const branchB = await createBranch(db, {
      organizationId: organizationB.id,
      name: "B Branch"
    });
    const user = await createUser("multi-tenant");

    await createOrganizationMembership(db, {
      organizationId: organizationB.id,
      userId: user.id,
      role: MembershipRole.STAFF
    });
    await createBranchMembership(db, {
      organizationId: organizationB.id,
      branchId: branchB.id,
      userId: user.id,
      role: MembershipRole.STAFF
    });

    await expect(
      getActiveBranchMembership(db, {
        organizationId: organizationA.id,
        branchId: branchB.id,
        userId: user.id
      })
    ).resolves.toBeNull();
  });
});
