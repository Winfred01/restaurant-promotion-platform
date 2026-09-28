import {
  MembershipRole,
  PrismaClient,
  PromotionCodeType,
  PromotionRewardType,
  PromotionStatus
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import {
  createPromotion,
  InvalidPromotionTransitionError,
  PromotionTargetingError,
  PromotionUnavailableError,
  PromotionValidationError,
  transitionPromotionStatus
} from "./lifecycle";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describe("promotion schema validation", () => {
  it("rejects invalid reward values before persistence", async () => {
    await expect(
      createPromotion({} as PrismaClient, {
        organizationId: "organization-id",
        createdByUserId: "user-id",
        name: "Broken percentage",
        rewardType: PromotionRewardType.PERCENTAGE,
        discountPercent: 101,
        appliesToAllBranches: true
      })
    ).rejects.toBeInstanceOf(PromotionValidationError);
  });

  it("requires one unambiguous targeting mode", async () => {
    const baseInput = {
      organizationId: "organization-id",
      createdByUserId: "user-id",
      name: "Targeted offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500
    } as const;

    await expect(
      createPromotion({} as PrismaClient, {
        ...baseInput,
        appliesToAllBranches: true,
        branchIds: ["branch-id"]
      })
    ).rejects.toBeInstanceOf(PromotionTargetingError);
    await expect(
      createPromotion({} as PrismaClient, {
        ...baseInput,
        appliesToAllBranches: false
      })
    ).rejects.toBeInstanceOf(PromotionTargetingError);
  });
});

describeWithLocalDatabase("promotion persistence, targeting, and lifecycle", () => {
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

  async function createOwnerScope() {
    return harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
  }

  it("stores an all-branch fixed discount without selected targets", async () => {
    const scope = await createOwnerScope();

    const promotion = await createPromotion(db, {
      organizationId: scope.organization.id,
      createdByUserId: scope.user.id,
      name: "Five dollars off",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });

    expect(promotion).toMatchObject({
      organizationId: scope.organization.id,
      status: PromotionStatus.DRAFT,
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true,
      branches: []
    });
  });

  it("stores only same-tenant selected branch targets", async () => {
    const scope = await createOwnerScope();
    const secondBranch = await harness.createBranch(scope.organization, { name: "Second Branch" });
    const otherTenant = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });

    const promotion = await createPromotion(db, {
      organizationId: scope.organization.id,
      createdByUserId: scope.user.id,
      name: "Selected branches",
      rewardType: PromotionRewardType.SPEND_THRESHOLD,
      discountCents: 1000,
      minimumSpendCents: 5000,
      appliesToAllBranches: false,
      branchIds: [scope.branch.id, secondBranch.id, scope.branch.id]
    });

    expect(promotion.branches.map(({ branchId }) => branchId)).toEqual(
      [scope.branch.id, secondBranch.id].sort()
    );
    await expect(
      createPromotion(db, {
        organizationId: scope.organization.id,
        createdByUserId: scope.user.id,
        name: "Cross-tenant target",
        rewardType: PromotionRewardType.FIXED_AMOUNT,
        discountCents: 500,
        appliesToAllBranches: false,
        branchIds: [otherTenant.branch.id]
      })
    ).rejects.toBeInstanceOf(PromotionTargetingError);
  });

  it("enforces reward configuration and promotion-code tenant uniqueness in PostgreSQL", async () => {
    const scope = await createOwnerScope();
    const otherScope = await createOwnerScope();
    const promotion = await createPromotion(db, {
      organizationId: scope.organization.id,
      createdByUserId: scope.user.id,
      name: "Percentage offer",
      rewardType: PromotionRewardType.PERCENTAGE,
      discountPercent: 10,
      maxDiscountCents: 2500,
      appliesToAllBranches: true
    });
    const otherPromotion = await createPromotion(db, {
      organizationId: otherScope.organization.id,
      createdByUserId: otherScope.user.id,
      name: "Other tenant offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });

    await expect(
      db.promotion.update({
        where: { id: promotion.id },
        data: { discountPercent: 0 }
      })
    ).rejects.toThrow();

    await db.promotionCode.create({
      data: {
        organizationId: scope.organization.id,
        promotionId: promotion.id,
        code: "SAVE10",
        codeType: PromotionCodeType.SHARED
      }
    });
    await expect(
      db.promotionCode.create({
        data: {
          organizationId: scope.organization.id,
          promotionId: promotion.id,
          code: "SAVE10",
          codeType: PromotionCodeType.UNIQUE
        }
      })
    ).rejects.toThrow();
    await expect(
      db.promotionCode.create({
        data: {
          organizationId: otherScope.organization.id,
          promotionId: otherPromotion.id,
          code: "SAVE10",
          codeType: PromotionCodeType.SHARED
        }
      })
    ).resolves.toMatchObject({ organizationId: otherScope.organization.id });
  });

  it("persists valid lifecycle transitions and rejects invalid or cross-tenant updates", async () => {
    const scope = await createOwnerScope();
    const otherScope = await createOwnerScope();
    const promotion = await createPromotion(db, {
      organizationId: scope.organization.id,
      createdByUserId: scope.user.id,
      name: "Lifecycle offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });

    const scheduled = await transitionPromotionStatus(db, {
      organizationId: scope.organization.id,
      promotionId: promotion.id,
      status: PromotionStatus.SCHEDULED
    });
    const active = await transitionPromotionStatus(db, {
      organizationId: scope.organization.id,
      promotionId: promotion.id,
      status: PromotionStatus.ACTIVE
    });

    expect(scheduled.status).toBe(PromotionStatus.SCHEDULED);
    expect(active.status).toBe(PromotionStatus.ACTIVE);
    await expect(
      transitionPromotionStatus(db, {
        organizationId: scope.organization.id,
        promotionId: promotion.id,
        status: PromotionStatus.DRAFT
      })
    ).rejects.toBeInstanceOf(InvalidPromotionTransitionError);
    await expect(
      transitionPromotionStatus(db, {
        organizationId: otherScope.organization.id,
        promotionId: promotion.id,
        status: PromotionStatus.ENDED
      })
    ).rejects.toBeInstanceOf(PromotionUnavailableError);
  });
});
