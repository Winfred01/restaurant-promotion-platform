import {
  MembershipRole,
  PrismaClient,
  PromotionClaimStatus,
  PromotionRewardType,
  RedemptionStatus
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createPromotion } from "@/server/promotions/lifecycle";
import { createRedemptionVoidService } from "@/server/redemptions/void";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import {
  createPromotionAnalyticsService,
  PROMOTION_LINKED_SALES_LABEL,
  redemptionRateBasisPoints
} from "./promotion";

const databaseUrl = process.env.DATABASE_URL ?? "";
const describeWithLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl)
  ? describe
  : describe.skip;

describe("promotion analytics calculations", () => {
  it("reports rate in basis points without inventing a denominator", () => {
    expect(redemptionRateBasisPoints(2, 3)).toBe(6_667);
    expect(redemptionRateBasisPoints(0, 0)).toBeNull();
  });

  it("validates scope before opening a transaction", async () => {
    const service = createPromotionAnalyticsService({} as PrismaClient);

    await expect(
      service.report({ organizationId: " ", actorUserId: "actor" })
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

describeWithLocalDatabase("promotion analytics report", () => {
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

  async function promotion(input: {
    organizationId: string;
    userId: string;
    name: string;
    branchIds?: string[];
  }) {
    return createPromotion(db, {
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      name: input.name,
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: !input.branchIds,
      branchIds: input.branchIds
    });
  }

  async function claim(input: {
    organizationId: string;
    branchId: string;
    customerId: string;
    promotionId: string;
    userId: string;
    status?: PromotionClaimStatus;
  }) {
    return db.customerPromotionClaim.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        customerId: input.customerId,
        promotionId: input.promotionId,
        claimedByUserId: input.userId,
        status: input.status
      }
    });
  }

  async function redemption(input: {
    organizationId: string;
    branchId: string;
    customerId: string;
    promotionId: string;
    userId: string;
    billSubtotalCents: number;
    discountCents: number;
  }) {
    return db.redemption.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        customerId: input.customerId,
        promotionId: input.promotionId,
        redeemedByUserId: input.userId,
        billSubtotalCents: input.billSubtotalCents,
        discountCents: input.discountCents,
        netBillCents: input.billSubtotalCents - input.discountCents
      }
    });
  }

  it("aggregates organization promotion-linked sales and excludes VOIDED redemptions", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const otherTenant = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const customers = await Promise.all([
      harness.createCustomer(scope.organization),
      harness.createCustomer(scope.organization),
      harness.createCustomer(scope.organization)
    ]);
    const measured = await promotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Measured promotion"
    });
    const empty = await promotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Empty promotion"
    });
    await promotion({
      organizationId: otherTenant.organization.id,
      userId: otherTenant.user.id,
      name: "Other tenant promotion"
    });

    await Promise.all([
      claim({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customers[0].id,
        promotionId: measured.id,
        userId: scope.user.id,
        status: PromotionClaimStatus.REDEEMED
      }),
      claim({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customers[1].id,
        promotionId: measured.id,
        userId: scope.user.id
      }),
      claim({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customers[2].id,
        promotionId: measured.id,
        userId: scope.user.id,
        status: PromotionClaimStatus.CANCELLED
      })
    ]);
    const completed = await Promise.all([
      redemption({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customers[0].id,
        promotionId: measured.id,
        userId: scope.user.id,
        billSubtotalCents: 2_000,
        discountCents: 500
      }),
      redemption({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customers[1].id,
        promotionId: measured.id,
        userId: scope.user.id,
        billSubtotalCents: 3_000,
        discountCents: 200
      }),
      redemption({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customers[2].id,
        promotionId: measured.id,
        userId: scope.user.id,
        billSubtotalCents: 10_000,
        discountCents: 1_000
      })
    ]);
    await createRedemptionVoidService(db).voidRedemption({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      redemptionId: completed[2].id,
      reason: "Analytics void fixture"
    });

    const report = await createPromotionAnalyticsService(db).report({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id
    });

    expect(report.terminology).toBe(PROMOTION_LINKED_SALES_LABEL);
    expect(report.scope).toEqual({ organizationId: scope.organization.id, branchId: null });
    expect(report.promotions).toEqual([
      {
        promotionId: empty.id,
        promotionName: "Empty promotion",
        promotionStatus: empty.status,
        claimCount: 0,
        redemptionCount: 0,
        redemptionRateBasisPoints: null,
        grossBillCents: 0,
        totalDiscountCents: 0,
        netBillCents: 0,
        averageBillCents: null,
        redemptionsWithBillAmounts: 0,
        uniqueCustomers: 0
      },
      {
        promotionId: measured.id,
        promotionName: "Measured promotion",
        promotionStatus: measured.status,
        claimCount: 3,
        redemptionCount: 2,
        redemptionRateBasisPoints: 6_667,
        grossBillCents: 5_000,
        totalDiscountCents: 700,
        netBillCents: 4_300,
        averageBillCents: 2_500,
        redemptionsWithBillAmounts: 2,
        uniqueCustomers: 2
      }
    ]);
    expect(JSON.stringify(report).toLowerCase()).not.toContain("incremental revenue");
    await expect(
      db.redemption.findUniqueOrThrow({ where: { id: completed[2].id } })
    ).resolves.toMatchObject({ status: RedemptionStatus.VOIDED });
  });

  it("limits Manager analytics to the authorized branch and applicable promotions", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const otherBranch = await harness.createBranch(scope.organization);
    const customers = await Promise.all([
      harness.createCustomer(scope.organization),
      harness.createCustomer(scope.organization)
    ]);
    const allBranches = await promotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "All branches"
    });
    await promotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Other branch only",
      branchIds: [otherBranch.id]
    });
    await Promise.all([
      claim({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customers[0].id,
        promotionId: allBranches.id,
        userId: scope.user.id
      }),
      claim({
        organizationId: scope.organization.id,
        branchId: otherBranch.id,
        customerId: customers[1].id,
        promotionId: allBranches.id,
        userId: scope.user.id
      }),
      redemption({
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customers[0].id,
        promotionId: allBranches.id,
        userId: scope.user.id,
        billSubtotalCents: 2_000,
        discountCents: 500
      }),
      redemption({
        organizationId: scope.organization.id,
        branchId: otherBranch.id,
        customerId: customers[1].id,
        promotionId: allBranches.id,
        userId: scope.user.id,
        billSubtotalCents: 9_000,
        discountCents: 500
      })
    ]);

    const report = await createPromotionAnalyticsService(db).report({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id
    });

    expect(report.promotions).toHaveLength(1);
    expect(report.promotions[0]).toMatchObject({
      promotionId: allBranches.id,
      claimCount: 1,
      redemptionCount: 1,
      grossBillCents: 2_000,
      totalDiscountCents: 500,
      netBillCents: 1_500,
      uniqueCustomers: 1
    });
  });

  it("denies Staff analytics and organization-wide Manager analytics", async () => {
    const staff = await harness.createTenantScope();
    const manager = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const service = createPromotionAnalyticsService(db);

    await expect(
      service.report({
        organizationId: staff.organization.id,
        actorUserId: staff.user.id,
        branchId: staff.branch.id
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.report({
        organizationId: manager.organization.id,
        actorUserId: manager.user.id
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });
});
