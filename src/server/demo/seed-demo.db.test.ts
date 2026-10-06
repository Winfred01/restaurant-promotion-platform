import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { demoAccounts, demoOrganizationSlug, seedDemoDatabase } from "../../../scripts/seed-demo";
import { validateEmployeeCredentials } from "@/server/auth/credentials";

const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(process.env.DATABASE_URL ?? "");
const describeWithLocalDatabase = isLocalDatabase ? describe : describe.skip;

describeWithLocalDatabase("seeded demo employee login", () => {
  const db = new PrismaClient();
  const password = "a-long-demo-password-for-database-test";
  let organizationId: string | undefined;
  const userIds: string[] = [];

  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    if (organizationId) {
      await db.branchMembership.deleteMany({ where: { organizationId } });
      await db.organizationMembership.deleteMany({ where: { organizationId } });
      await db.branch.deleteMany({ where: { organizationId } });
      await db.restaurantOrganization.delete({ where: { id: organizationId } });
    }

    if (userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }

    await db.$disconnect();
  });

  it("seeds three accounts that authenticate with their expected roles", async () => {
    await seedDemoDatabase(db, password);

    const organization = await db.restaurantOrganization.findUniqueOrThrow({
      where: { slug: demoOrganizationSlug }
    });
    organizationId = organization.id;

    for (const account of demoAccounts) {
      const user = await db.user.findUniqueOrThrow({ where: { email: account.email } });
      userIds.push(user.id);

      await expect(
        validateEmployeeCredentials(db, { email: account.email, password })
      ).resolves.toMatchObject({ id: user.id, email: account.email });
      expect(user.passwordHash).not.toBe(password);

      const membership = await db.organizationMembership.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId, userId: user.id } }
      });
      expect(membership.role).toBe(account.role);
    }

    const branchMemberships = await db.branchMembership.findMany({
      where: { organizationId },
      select: { role: true }
    });
    expect(branchMemberships.map((membership) => membership.role).sort()).toEqual([
      "MANAGER",
      "STAFF"
    ]);

    await expect(seedDemoDatabase(db, password)).rejects.toThrow("already exists");
  });
});
