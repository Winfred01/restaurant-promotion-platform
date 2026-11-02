import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  demoAccounts,
  demoOrganizationSlug,
  demoSecondBranchName,
  seedDemoDatabase
} from "../../../scripts/seed-demo";
import { validateEmployeeCredentials } from "@/server/auth/credentials";
import { createAcquisitionAnalyticsService } from "@/server/analytics/acquisition";
import { createPromotionAnalyticsService } from "@/server/analytics/promotion";

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
      await db.auditLog.deleteMany({ where: { organizationId } });
      await db.redemptionVoid.deleteMany({ where: { organizationId } });
      await db.redemption.deleteMany({ where: { organizationId } });
      await db.customerPromotionClaim.deleteMany({ where: { organizationId } });
      await db.promotionCode.deleteMany({ where: { organizationId } });
      await db.promotionBranch.deleteMany({ where: { organizationId } });
      await db.promotion.deleteMany({ where: { organizationId } });
      await db.customer.deleteMany({ where: { organizationId } });
      await db.acquisitionChannel.deleteMany({ where: { organizationId } });
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
      "STAFF",
      "STAFF"
    ]);

    const branches = await db.branch.findMany({ where: { organizationId } });
    expect(branches.map((branch) => branch.name).sort()).toEqual([
      "Downtown Demo",
      demoSecondBranchName
    ]);
    expect(await db.acquisitionChannel.count({ where: { organizationId } })).toBe(3);
    expect(await db.customer.count({ where: { organizationId } })).toBe(4);
    expect(await db.promotion.count({ where: { organizationId } })).toBe(5);
    expect(await db.customerPromotionClaim.count({ where: { organizationId } })).toBe(5);
    expect(await db.redemption.count({ where: { organizationId, status: "COMPLETED" } })).toBe(3);
    expect(await db.redemption.count({ where: { organizationId, status: "VOIDED" } })).toBe(1);
    expect(await db.redemptionVoid.count({ where: { organizationId } })).toBe(1);
    expect(
      await db.auditLog.count({ where: { organizationId, action: "DEMO_SEED_CREATED" } })
    ).toBe(1);
    expect(await db.auditLog.count({ where: { organizationId } })).toBe(6);

    const owner = await db.user.findUniqueOrThrow({ where: { email: demoAccounts[0].email } });
    const promotionReport = await createPromotionAnalyticsService(db).report({
      organizationId,
      actorUserId: owner.id
    });
    const welcome = promotionReport.promotions.find(
      (row) => row.promotionName === "Welcome $5 off"
    );
    expect(welcome).toMatchObject({ redemptionCount: 2, grossBillCents: 5500, netBillCents: 4500 });

    const acquisitionReport = await createAcquisitionAnalyticsService(db).report({
      organizationId,
      actorUserId: owner.id
    });
    const referral = acquisitionReport.channels.find(
      (row) => row.acquisitionChannelName === "Friend referral"
    );
    expect(referral).toMatchObject({
      newCustomers: 1,
      observedReturningCustomers: 1,
      recordedSpendCents: 6100
    });

    await expect(seedDemoDatabase(db, password)).rejects.toThrow("already exists");
  });
});
