import {
  MembershipRole,
  PrismaClient,
  PromotionCodeType,
  PromotionRewardType,
  PromotionStatus,
  RedemptionStatus
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import {
  calculatePromotionEligibility,
  createPromotionEligibilityService,
  PromotionEligibilityReason,
  PromotionEligibilityUnavailableError,
  type PromotionEligibilityFacts
} from "./eligibility";
import { createPromotion, transitionPromotionStatus } from "./lifecycle";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;
const evaluatedAt = new Date("2026-10-02T18:00:00.000Z");

function eligibilityFacts(
  overrides: Partial<PromotionEligibilityFacts> = {}
): PromotionEligibilityFacts {
  return {
    promotionId: "promotion-id",
    status: PromotionStatus.ACTIVE,
    rewardType: PromotionRewardType.FIXED_AMOUNT,
    discountCents: 500,
    discountPercent: null,
    maxDiscountCents: null,
    minimumSpendCents: null,
    validFrom: null,
    validUntil: null,
    appliesToAllBranches: true,
    targetBranchIds: [],
    branchId: "branch-id",
    billSubtotalCents: 2_000,
    evaluatedAt,
    hasPriorSuccessfulRedemption: false,
    ...overrides
  };
}

describe("promotion eligibility calculations", () => {
  it("calculates fixed-amount discounts in cents", () => {
    expect(calculatePromotionEligibility(eligibilityFacts())).toEqual({
      promotionId: "promotion-id",
      eligible: true,
      reasonCodes: [],
      discountCents: 500,
      finalBillCents: 1_500
    });
  });

  it("rounds percentage discounts to the nearest cent with half cents rounded up", () => {
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({
          rewardType: PromotionRewardType.PERCENTAGE,
          discountCents: null,
          discountPercent: 10,
          billSubtotalCents: 5
        })
      )
    ).toMatchObject({ discountCents: 1, finalBillCents: 4 });
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({
          rewardType: PromotionRewardType.PERCENTAGE,
          discountCents: null,
          discountPercent: 10,
          billSubtotalCents: 4
        })
      )
    ).toMatchObject({ discountCents: 0, finalBillCents: 4 });
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({
          rewardType: PromotionRewardType.PERCENTAGE,
          discountCents: null,
          discountPercent: 50,
          maxDiscountCents: 123,
          billSubtotalCents: 1_000
        })
      )
    ).toMatchObject({ discountCents: 123, finalBillCents: 877 });
  });

  it("qualifies spend-threshold rewards at the exact threshold", () => {
    const thresholdFacts = eligibilityFacts({
      rewardType: PromotionRewardType.SPEND_THRESHOLD,
      discountCents: 1_000,
      minimumSpendCents: 5_000
    });

    expect(calculatePromotionEligibility({ ...thresholdFacts, billSubtotalCents: 4_999 })).toEqual({
      promotionId: "promotion-id",
      eligible: false,
      reasonCodes: [PromotionEligibilityReason.MINIMUM_SPEND_NOT_MET],
      discountCents: 0,
      finalBillCents: 4_999
    });
    expect(
      calculatePromotionEligibility({ ...thresholdFacts, billSubtotalCents: 5_000 })
    ).toMatchObject({ eligible: true, discountCents: 1_000, finalBillCents: 4_000 });
  });

  it("clamps savings to the bill subtotal and never returns a negative final amount", () => {
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({ discountCents: 1_000, billSubtotalCents: 500 })
      )
    ).toMatchObject({ eligible: true, discountCents: 500, finalBillCents: 0 });
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({ discountCents: 1_000, billSubtotalCents: 0 })
      )
    ).toMatchObject({ eligible: true, discountCents: 0, finalBillCents: 0 });
  });

  it("treats exact start and end instants as eligible boundaries", () => {
    const start = new Date("2026-10-02T18:00:00.000Z");
    const end = new Date("2026-10-02T19:00:00.000Z");

    expect(
      calculatePromotionEligibility(
        eligibilityFacts({ validFrom: start, validUntil: end, evaluatedAt: start })
      ).eligible
    ).toBe(true);
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({ validFrom: start, validUntil: end, evaluatedAt: end })
      ).eligible
    ).toBe(true);
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({
          validFrom: start,
          validUntil: end,
          evaluatedAt: new Date(start.getTime() - 1)
        })
      ).reasonCodes
    ).toEqual([PromotionEligibilityReason.NOT_STARTED]);
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({
          validFrom: start,
          validUntil: end,
          evaluatedAt: new Date(end.getTime() + 1)
        })
      ).reasonCodes
    ).toEqual([PromotionEligibilityReason.EXPIRED]);
  });

  it.each([
    [PromotionStatus.DRAFT, PromotionEligibilityReason.STATUS_DRAFT],
    [PromotionStatus.SCHEDULED, PromotionEligibilityReason.STATUS_SCHEDULED],
    [PromotionStatus.PAUSED, PromotionEligibilityReason.STATUS_PAUSED],
    [PromotionStatus.ENDED, PromotionEligibilityReason.STATUS_ENDED],
    [PromotionStatus.ARCHIVED, PromotionEligibilityReason.STATUS_ARCHIVED]
  ])("rejects %s lifecycle state with a stable reason", (status, reason) => {
    expect(calculatePromotionEligibility(eligibilityFacts({ status }))).toEqual({
      promotionId: "promotion-id",
      eligible: false,
      reasonCodes: [reason],
      discountCents: 0,
      finalBillCents: 2_000
    });
  });

  it("supports all-branch and selected-branch targeting", () => {
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({ appliesToAllBranches: true, targetBranchIds: ["other-branch"] })
      ).eligible
    ).toBe(true);
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({ appliesToAllBranches: false, targetBranchIds: ["branch-id"] })
      ).eligible
    ).toBe(true);
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({ appliesToAllBranches: false, targetBranchIds: ["other-branch"] })
      ).reasonCodes
    ).toEqual([PromotionEligibilityReason.BRANCH_NOT_TARGETED]);
  });

  it("returns stable, deterministic reason-code ordering", () => {
    expect(
      calculatePromotionEligibility(
        eligibilityFacts({
          status: PromotionStatus.PAUSED,
          rewardType: PromotionRewardType.SPEND_THRESHOLD,
          discountCents: 500,
          minimumSpendCents: 3_000,
          validFrom: new Date(evaluatedAt.getTime() + 1),
          appliesToAllBranches: false,
          targetBranchIds: ["other-branch"],
          promotionCodeAvailable: false,
          hasPriorSuccessfulRedemption: true
        })
      ).reasonCodes
    ).toEqual([
      PromotionEligibilityReason.STATUS_PAUSED,
      PromotionEligibilityReason.NOT_STARTED,
      PromotionEligibilityReason.BRANCH_NOT_TARGETED,
      PromotionEligibilityReason.MINIMUM_SPEND_NOT_MET,
      PromotionEligibilityReason.CODE_UNAVAILABLE,
      PromotionEligibilityReason.ALREADY_REDEEMED
    ]);
  });
});

describe("promotion eligibility input validation", () => {
  it("rejects invalid bill input before persistence access", async () => {
    const service = createPromotionEligibilityService({} as PrismaClient);

    await expect(
      service.evaluate({
        organizationId: "organization-id",
        actorUserId: "user-id",
        branchId: "branch-id",
        customerId: "customer-id",
        billSubtotalCents: -1,
        candidates: [{ promotionId: "promotion-id" }]
      })
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

describeWithLocalDatabase("promotion eligibility persistence and tenant isolation", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);
  const service = createPromotionEligibilityService(db);

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function createActiveFixedPromotion(input: {
    organizationId: string;
    userId: string;
    name: string;
    discountCents?: number;
    appliesToAllBranches?: boolean;
    branchIds?: string[];
  }) {
    const promotion = await createPromotion(db, {
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      name: input.name,
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: input.discountCents ?? 500,
      appliesToAllBranches: input.appliesToAllBranches ?? true,
      branchIds: input.branchIds
    });
    await transitionPromotionStatus(db, {
      organizationId: input.organizationId,
      promotionId: promotion.id,
      status: PromotionStatus.ACTIVE
    });
    return promotion;
  }

  it("marks the largest eligible promotion as the advisory Best Deal", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.STAFF,
      branchRole: MembershipRole.STAFF
    });
    const customer = await harness.createCustomer(scope.organization);
    const fixed = await createActiveFixedPromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Fixed offer"
    });
    const percentage = await createPromotion(db, {
      organizationId: scope.organization.id,
      createdByUserId: scope.user.id,
      name: "Percentage offer",
      rewardType: PromotionRewardType.PERCENTAGE,
      discountPercent: 10,
      appliesToAllBranches: true
    });
    await transitionPromotionStatus(db, {
      organizationId: scope.organization.id,
      promotionId: percentage.id,
      status: PromotionStatus.ACTIVE
    });

    await expect(
      service.evaluate({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: scope.branch.id,
        customerId: customer.id,
        billSubtotalCents: 2_000,
        evaluatedAt,
        candidates: [{ promotionId: fixed.id }, { promotionId: percentage.id }]
      })
    ).resolves.toEqual([
      {
        promotionId: fixed.id,
        eligible: true,
        reasonCodes: [],
        discountCents: 500,
        finalBillCents: 1_500,
        isBestDeal: true
      },
      {
        promotionId: percentage.id,
        eligible: true,
        reasonCodes: [],
        discountCents: 200,
        finalBillCents: 1_800,
        isBestDeal: false
      }
    ]);
  });

  it("enforces selected-branch targeting while allowing all-branch promotions", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const otherBranch = await harness.createBranch(scope.organization);
    const customer = await harness.createCustomer(scope.organization);
    const selected = await createActiveFixedPromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Selected branch offer",
      appliesToAllBranches: false,
      branchIds: [scope.branch.id]
    });
    const allBranches = await createActiveFixedPromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "All branch offer"
    });

    const results = await service.evaluate({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: otherBranch.id,
      customerId: customer.id,
      billSubtotalCents: 2_000,
      evaluatedAt,
      candidates: [{ promotionId: selected.id }, { promotionId: allBranches.id }]
    });

    expect(results[0]).toMatchObject({
      eligible: false,
      reasonCodes: [PromotionEligibilityReason.BRANCH_NOT_TARGETED]
    });
    expect(results[1]).toMatchObject({ eligible: true, reasonCodes: [] });
  });

  it("enforces one use by customer and Promotion independently of code value", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await createActiveFixedPromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "One use offer"
    });
    const firstCode = await db.promotionCode.create({
      data: {
        organizationId: scope.organization.id,
        promotionId: promotion.id,
        code: "FIRST-CODE",
        codeType: PromotionCodeType.SHARED
      }
    });
    const secondCode = await db.promotionCode.create({
      data: {
        organizationId: scope.organization.id,
        promotionId: promotion.id,
        code: "SECOND-CODE",
        codeType: PromotionCodeType.UNIQUE
      }
    });
    await db.redemption.create({
      data: {
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customer.id,
        promotionId: promotion.id,
        promotionCodeId: firstCode.id,
        status: RedemptionStatus.COMPLETED
      }
    });
    const otherCustomer = await harness.createCustomer(scope.organization);

    await expect(
      service.evaluate({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: scope.branch.id,
        customerId: otherCustomer.id,
        billSubtotalCents: 2_000,
        candidates: [{ promotionId: promotion.id, promotionCodeId: secondCode.id }]
      })
    ).resolves.toMatchObject([{ eligible: true, reasonCodes: [] }]);

    await expect(
      service.evaluate({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: scope.branch.id,
        customerId: customer.id,
        billSubtotalCents: 2_000,
        candidates: [{ promotionId: promotion.id, promotionCodeId: secondCode.id }]
      })
    ).resolves.toMatchObject([
      {
        eligible: false,
        reasonCodes: [PromotionEligibilityReason.ALREADY_REDEEMED],
        discountCents: 0,
        finalBillCents: 2_000
      }
    ]);
  });

  it("does not treat voided history as a prior successful redemption", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await createActiveFixedPromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Corrected redemption offer"
    });
    await db.redemption.create({
      data: {
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customer.id,
        promotionId: promotion.id,
        status: RedemptionStatus.VOIDED
      }
    });

    await expect(
      service.evaluate({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: scope.branch.id,
        customerId: customer.id,
        billSubtotalCents: 2_000,
        candidates: [{ promotionId: promotion.id }]
      })
    ).resolves.toMatchObject([{ eligible: true, reasonCodes: [] }]);
  });

  it("denies cross-tenant customer, promotion, branch, and code influence", async () => {
    const first = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const second = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const firstCustomer = await harness.createCustomer(first.organization);
    const secondCustomer = await harness.createCustomer(second.organization);
    const firstPromotion = await createActiveFixedPromotion({
      organizationId: first.organization.id,
      userId: first.user.id,
      name: "First tenant offer"
    });
    const secondPromotion = await createActiveFixedPromotion({
      organizationId: second.organization.id,
      userId: second.user.id,
      name: "Second tenant offer"
    });
    const secondCode = await db.promotionCode.create({
      data: {
        organizationId: second.organization.id,
        promotionId: secondPromotion.id,
        code: "PRIVATE-CODE",
        codeType: PromotionCodeType.SHARED
      }
    });
    const baseInput = {
      organizationId: first.organization.id,
      actorUserId: first.user.id,
      branchId: first.branch.id,
      customerId: firstCustomer.id,
      billSubtotalCents: 2_000,
      candidates: [{ promotionId: firstPromotion.id }]
    };

    await expect(
      service.evaluate({ ...baseInput, customerId: secondCustomer.id })
    ).rejects.toBeInstanceOf(PromotionEligibilityUnavailableError);
    await expect(
      service.evaluate({ ...baseInput, candidates: [{ promotionId: secondPromotion.id }] })
    ).rejects.toBeInstanceOf(PromotionEligibilityUnavailableError);
    await expect(
      service.evaluate({ ...baseInput, branchId: second.branch.id })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.evaluate({
        ...baseInput,
        candidates: [{ promotionId: firstPromotion.id, promotionCodeId: secondCode.id }]
      })
    ).resolves.toMatchObject([
      {
        eligible: false,
        reasonCodes: [PromotionEligibilityReason.CODE_UNAVAILABLE]
      }
    ]);
  });

  it("prevents cross-tenant redemption links and ignores another tenant's history", async () => {
    const first = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const second = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const firstCustomer = await harness.createCustomer(first.organization);
    const secondCustomer = await harness.createCustomer(second.organization);
    const firstPromotion = await createActiveFixedPromotion({
      organizationId: first.organization.id,
      userId: first.user.id,
      name: "First history offer"
    });
    const secondPromotion = await createActiveFixedPromotion({
      organizationId: second.organization.id,
      userId: second.user.id,
      name: "Second history offer"
    });
    await db.redemption.create({
      data: {
        organizationId: second.organization.id,
        branchId: second.branch.id,
        customerId: secondCustomer.id,
        promotionId: secondPromotion.id,
        status: RedemptionStatus.COMPLETED
      }
    });

    await expect(
      db.redemption.create({
        data: {
          organizationId: first.organization.id,
          branchId: first.branch.id,
          customerId: secondCustomer.id,
          promotionId: firstPromotion.id,
          status: RedemptionStatus.COMPLETED
        }
      })
    ).rejects.toThrow();
    await expect(
      service.evaluate({
        organizationId: first.organization.id,
        actorUserId: first.user.id,
        branchId: first.branch.id,
        customerId: firstCustomer.id,
        billSubtotalCents: 2_000,
        candidates: [{ promotionId: firstPromotion.id }]
      })
    ).resolves.toMatchObject([{ eligible: true, reasonCodes: [] }]);
  });
});
