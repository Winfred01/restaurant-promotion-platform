import { MembershipRole, PrismaClient, PromotionRewardType, PromotionStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import { transitionPromotionStatus } from "./lifecycle";
import { createPromotionManagementService, PromotionNotEditableError } from "./management";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describe("promotion management validation", () => {
  it("rejects invalid definitions before persistence", async () => {
    const service = createPromotionManagementService({} as PrismaClient);

    await expect(
      service.create({
        organizationId: "organization-id",
        actorUserId: "user-id",
        name: "Invalid offer",
        rewardType: PromotionRewardType.PERCENTAGE,
        discountPercent: 101,
        appliesToAllBranches: true
      })
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

describeWithLocalDatabase("Manager/Owner promotion management", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);
  const service = createPromotionManagementService(db);

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("allows an Owner to create an all-branch promotion and records an audit", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });

    const promotion = await service.create({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      name: "Owner offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });

    expect(promotion).toMatchObject({
      organizationId: scope.organization.id,
      status: PromotionStatus.DRAFT,
      name: "Owner offer",
      branches: []
    });
    await expect(
      db.auditLog.findMany({ where: { promotionId: promotion.id } })
    ).resolves.toMatchObject([
      {
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        actorRole: MembershipRole.OWNER,
        action: "PROMOTION_CREATED",
        entityType: "Promotion",
        entityId: promotion.id
      }
    ]);
  });

  it("allows a Manager to create only selected-branch promotions and denies Staff", async () => {
    const manager = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const staff = await harness.createTenantScope({
      organizationRole: MembershipRole.STAFF,
      branchRole: MembershipRole.STAFF
    });

    await expect(
      service.create({
        organizationId: manager.organization.id,
        actorUserId: manager.user.id,
        name: "Manager branch offer",
        rewardType: PromotionRewardType.SPEND_THRESHOLD,
        discountCents: 1_000,
        minimumSpendCents: 5_000,
        appliesToAllBranches: false,
        branchIds: [manager.branch.id]
      })
    ).resolves.toMatchObject({
      organizationId: manager.organization.id,
      branches: [{ branchId: manager.branch.id }]
    });

    await expect(
      service.create({
        organizationId: manager.organization.id,
        actorUserId: manager.user.id,
        name: "Unauthorized organization-wide offer",
        rewardType: PromotionRewardType.FIXED_AMOUNT,
        discountCents: 500,
        appliesToAllBranches: true
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    await expect(
      service.create({
        organizationId: staff.organization.id,
        actorUserId: staff.user.id,
        name: "Forbidden offer",
        rewardType: PromotionRewardType.FIXED_AMOUNT,
        discountCents: 500,
        appliesToAllBranches: false,
        branchIds: [staff.branch.id]
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      db.promotion.count({ where: { organizationId: staff.organization.id } })
    ).resolves.toBe(0);
    await expect(
      db.auditLog.count({ where: { organizationId: staff.organization.id } })
    ).resolves.toBe(0);
  });

  it("denies cross-tenant branch targeting without revealing the target", async () => {
    const manager = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const otherTenant = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });

    await expect(
      service.create({
        organizationId: manager.organization.id,
        actorUserId: manager.user.id,
        name: "Cross-tenant offer",
        rewardType: PromotionRewardType.FIXED_AMOUNT,
        discountCents: 500,
        appliesToAllBranches: false,
        branchIds: [otherTenant.branch.id]
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("edits promotion details and branch targeting with before/after audit snapshots", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const promotion = await service.create({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      name: "Original offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });

    const edited = await service.edit({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      promotionId: promotion.id,
      name: "Updated offer",
      description: "A reviewed promotion",
      rewardType: PromotionRewardType.PERCENTAGE,
      discountPercent: 15,
      maxDiscountCents: 2_000,
      appliesToAllBranches: false,
      branchIds: [scope.branch.id]
    });

    expect(edited).toMatchObject({
      name: "Updated offer",
      rewardType: PromotionRewardType.PERCENTAGE,
      discountCents: null,
      discountPercent: 15,
      appliesToAllBranches: false,
      branches: [{ branchId: scope.branch.id }]
    });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { promotionId: promotion.id, action: "PROMOTION_UPDATED" }
    });
    expect(audit.beforeJson).toMatchObject({ name: "Original offer" });
    expect(audit.afterJson).toMatchObject({
      name: "Updated offer",
      branchIds: [scope.branch.id]
    });
  });

  it("pauses and archives without hard deleting audited history", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const promotion = await service.create({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      name: "Lifecycle offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });
    await transitionPromotionStatus(db, {
      organizationId: scope.organization.id,
      promotionId: promotion.id,
      status: PromotionStatus.ACTIVE
    });

    await expect(
      service.pause({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        promotionId: promotion.id,
        reason: "Temporarily unavailable"
      })
    ).resolves.toMatchObject({ status: PromotionStatus.PAUSED });
    await expect(
      service.archive({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        promotionId: promotion.id,
        reason: "Campaign completed"
      })
    ).resolves.toMatchObject({ status: PromotionStatus.ARCHIVED });
    await expect(
      service.edit({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        promotionId: promotion.id,
        name: "Reopened offer",
        rewardType: PromotionRewardType.FIXED_AMOUNT,
        discountCents: 600,
        appliesToAllBranches: true
      })
    ).rejects.toBeInstanceOf(PromotionNotEditableError);
    await expect(db.promotion.delete({ where: { id: promotion.id } })).rejects.toThrow();

    const audits = await db.auditLog.findMany({
      where: { promotionId: promotion.id },
      orderBy: { createdAt: "asc" }
    });
    expect(audits.map(({ action }) => action)).toEqual([
      "PROMOTION_CREATED",
      "PROMOTION_PAUSED",
      "PROMOTION_ARCHIVED"
    ]);
    expect(audits.at(-1)).toMatchObject({
      actorRole: MembershipRole.OWNER,
      reason: "Campaign completed"
    });
  });
});
