import { BranchStatus, PrismaClient, RestaurantOrganizationStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  archiveBranchForOrganization,
  createBranch,
  createRestaurantOrganization,
  getBranchForOrganization,
  listBranchesForOrganization
} from "./repository";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describeWithLocalDatabase("organization and branch persistence", () => {
  const db = new PrismaClient();

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await db.branch.deleteMany();
    await db.restaurantOrganization.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("creates an organization with default status and unique slug", async () => {
    const organization = await createRestaurantOrganization(db, {
      name: "Tenant A",
      slug: "tenant-a",
      timezone: "America/Toronto",
      currency: "CAD"
    });

    expect(organization.status).toBe(RestaurantOrganizationStatus.ACTIVE);
    expect(organization.slug).toBe("tenant-a");

    await expect(
      createRestaurantOrganization(db, {
        name: "Duplicate Tenant",
        slug: "tenant-a"
      })
    ).rejects.toMatchObject({
      code: "P2002"
    });
  });

  it("creates branches that belong to exactly one organization", async () => {
    const organization = await createRestaurantOrganization(db, {
      name: "Tenant A",
      slug: "tenant-a"
    });

    const branch = await createBranch(db, {
      organizationId: organization.id,
      name: "Downtown",
      timezone: "America/Toronto"
    });

    expect(branch.organizationId).toBe(organization.id);

    const branches = await listBranchesForOrganization(db, {
      organizationId: organization.id,
      status: BranchStatus.ACTIVE
    });

    expect(branches).toHaveLength(1);
    expect(branches[0]?.id).toBe(branch.id);
  });

  it("requires branch names to be unique inside an organization", async () => {
    const organization = await createRestaurantOrganization(db, {
      name: "Tenant A",
      slug: "tenant-a"
    });

    await createBranch(db, {
      organizationId: organization.id,
      name: "Downtown"
    });

    await expect(
      createBranch(db, {
        organizationId: organization.id,
        name: "Downtown"
      })
    ).rejects.toMatchObject({
      code: "P2002"
    });
  });

  it("denies cross-tenant branch lookup without exposing the other branch", async () => {
    const organizationA = await createRestaurantOrganization(db, {
      name: "Tenant A",
      slug: "tenant-a"
    });
    const organizationB = await createRestaurantOrganization(db, {
      name: "Tenant B",
      slug: "tenant-b"
    });

    const branchA = await createBranch(db, {
      organizationId: organizationA.id,
      name: "A Branch"
    });
    const branchB = await createBranch(db, {
      organizationId: organizationB.id,
      name: "B Branch"
    });

    await expect(
      getBranchForOrganization(db, {
        organizationId: organizationA.id,
        branchId: branchA.id
      })
    ).resolves.toMatchObject({
      id: branchA.id
    });

    await expect(
      getBranchForOrganization(db, {
        organizationId: organizationA.id,
        branchId: branchB.id
      })
    ).resolves.toBeNull();

    await expect(
      getBranchForOrganization(db, {
        organizationId: organizationB.id,
        branchId: branchA.id
      })
    ).resolves.toBeNull();
  });

  it("archives branches only through organization-scoped updates", async () => {
    const organizationA = await createRestaurantOrganization(db, {
      name: "Tenant A",
      slug: "tenant-a"
    });
    const organizationB = await createRestaurantOrganization(db, {
      name: "Tenant B",
      slug: "tenant-b"
    });

    const branchA = await createBranch(db, {
      organizationId: organizationA.id,
      name: "A Branch"
    });

    const crossTenantResult = await archiveBranchForOrganization(db, {
      organizationId: organizationB.id,
      branchId: branchA.id
    });

    expect(crossTenantResult.count).toBe(0);

    const archivedResult = await archiveBranchForOrganization(db, {
      organizationId: organizationA.id,
      branchId: branchA.id
    });

    expect(archivedResult.count).toBe(1);

    await expect(
      getBranchForOrganization(db, {
        organizationId: organizationA.id,
        branchId: branchA.id
      })
    ).resolves.toMatchObject({
      status: BranchStatus.ARCHIVED
    });
  });
});
