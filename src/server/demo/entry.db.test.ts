import { randomBytes } from "node:crypto";

import { MembershipRole, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seedDemoDatabase } from "../../../scripts/seed-demo";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { claimDemoTenant, consumeDemoTicket } from "./entry";

const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(process.env.DATABASE_URL ?? "");
const describeWithLocalDatabase = isLocalDatabase ? describe : describe.skip;

describeWithLocalDatabase("isolated guided demo database", () => {
  const db = new PrismaClient();
  const organizationIds: string[] = [];

  beforeAll(async () => {
    await db.$connect();
    for (let index = 0; index < 2; index += 1) {
      organizationIds.push(
        await seedDemoDatabase(db, randomBytes(32).toString("hex"), randomBytes(8).toString("hex"))
      );
    }
  });

  afterAll(async () => {
    if (organizationIds.length) {
      const where = { organizationId: { in: organizationIds } };
      const userIds = (
        await db.organizationMembership.findMany({ where, select: { userId: true } })
      ).map((membership) => membership.userId);
      await db.auditLog.deleteMany({ where });
      await db.redemptionVoid.deleteMany({ where });
      await db.redemption.deleteMany({ where });
      await db.customerPromotionClaim.deleteMany({ where });
      await db.promotionCode.deleteMany({ where });
      await db.promotionBranch.deleteMany({ where });
      await db.promotion.deleteMany({ where });
      await db.customer.deleteMany({ where });
      await db.acquisitionChannel.deleteMany({ where });
      await db.branchMembership.deleteMany({ where });
      await db.organizationMembership.deleteMany({ where });
      await db.branch.deleteMany({ where });
      await db.demoTenantLease.deleteMany({ where });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.restaurantOrganization.deleteMany({ where: { id: { in: organizationIds } } });
    }
    await db.$disconnect();
  });

  it("keeps visitors in separate tenants and preserves Staff privilege denial", async () => {
    const [ownerTicket, staffTicket] = await Promise.all([
      claimDemoTenant(db, MembershipRole.OWNER),
      claimDemoTenant(db, MembershipRole.STAFF)
    ]);
    expect(ownerTicket).toBeTruthy();
    expect(staffTicket).toBeTruthy();
    const owner = await consumeDemoTicket(db, ownerTicket);
    const staff = await consumeDemoTicket(db, staffTicket);
    expect(owner).toBeTruthy();
    expect(staff).toBeTruthy();
    expect(await consumeDemoTicket(db, staffTicket)).toBeNull();

    const ownerMembership = await db.organizationMembership.findFirstOrThrow({
      where: { userId: owner!.id },
      select: { organizationId: true }
    });
    const staffMembership = await db.organizationMembership.findFirstOrThrow({
      where: { userId: staff!.id },
      select: { organizationId: true }
    });
    expect(ownerMembership.organizationId).not.toBe(staffMembership.organizationId);

    const staffBranch = await db.branch.findFirstOrThrow({
      where: { organizationId: staffMembership.organizationId },
      select: { id: true }
    });
    const guard = createPrismaAuthorizationGuard(db);
    await expect(
      guard.requireBranchPermission({
        organizationId: staffMembership.organizationId,
        branchId: staffBranch.id,
        userId: staff!.id,
        permission: Permission.PROMOTION_MANAGE
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      guard.requireBranchPermission({
        organizationId: staffMembership.organizationId,
        branchId: staffBranch.id,
        userId: owner!.id,
        permission: Permission.CUSTOMER_LOOKUP
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });
});
