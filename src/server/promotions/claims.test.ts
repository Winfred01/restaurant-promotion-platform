import {
  MembershipRole,
  PrismaClient,
  PromotionClaimSource,
  PromotionClaimStatus,
  PromotionCodeType,
  PromotionRewardType,
  PromotionStatus,
  RedemptionStatus
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import {
  createStaffPromotionClaimService,
  PromotionClaimConflictError,
  PromotionClaimIneligibleError,
  PromotionClaimUnavailableError
} from "./claims";
import { PromotionEligibilityReason } from "./eligibility";
import { createPromotion, transitionPromotionStatus } from "./lifecycle";

const databaseUrl = process.env.DATABASE_URL ?? "";
const describeWithLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl)
  ? describe
  : describe.skip;

describe("staff promotion claim validation", () => {
  it("rejects malformed input before opening a transaction", async () => {
    const service = createStaffPromotionClaimService({} as PrismaClient);

    await expect(
      service.create({
        organizationId: "organization-id",
        actorUserId: "user-id",
        branchId: "branch-id",
        customerId: "customer-id",
        promotionId: ""
      })
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

describeWithLocalDatabase("staff promotion claims and tenant isolation", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);
  const service = createStaffPromotionClaimService(db);

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function activePromotion(input: {
    organizationId: string;
    userId: string;
    name: string;
    appliesToAllBranches?: boolean;
    branchIds?: string[];
    rewardType?: PromotionRewardType;
    minimumSpendCents?: number;
  }) {
    const common = {
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      name: input.name,
      appliesToAllBranches: input.appliesToAllBranches ?? true,
      branchIds: input.branchIds
    };
    const promotion =
      input.rewardType === PromotionRewardType.SPEND_THRESHOLD
        ? await createPromotion(db, {
            ...common,
            rewardType: PromotionRewardType.SPEND_THRESHOLD,
            discountCents: 500,
            minimumSpendCents: input.minimumSpendCents ?? 5_000
          })
        : await createPromotion(db, {
            ...common,
            rewardType: PromotionRewardType.FIXED_AMOUNT,
            discountCents: 500
          });
    await transitionPromotionStatus(db, {
      organizationId: input.organizationId,
      promotionId: promotion.id,
      status: PromotionStatus.ACTIVE
    });
    return promotion;
  }

  it("allows Staff to claim and writes an audit record without customer phone data", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.STAFF,
      branchRole: MembershipRole.STAFF
    });
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Staff offer"
    });
    const code = await db.promotionCode.create({
      data: {
        organizationId: scope.organization.id,
        promotionId: promotion.id,
        code: "STAFF-CODE",
        codeType: PromotionCodeType.SHARED
      }
    });

    const claim = await service.create({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: promotion.id,
      promotionCodeId: code.id
    });

    expect(claim).toMatchObject({
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: promotion.id,
      promotionCodeId: code.id,
      claimedByUserId: scope.user.id,
      status: PromotionClaimStatus.CLAIMED,
      source: PromotionClaimSource.STAFF
    });
    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        organizationId: scope.organization.id,
        entityType: "CustomerPromotionClaim",
        entityId: claim.id
      }
    });
    expect(audit).toMatchObject({
      branchId: scope.branch.id,
      actorUserId: scope.user.id,
      actorRole: MembershipRole.STAFF,
      action: "PROMOTION_CLAIM_CREATED",
      promotionId: promotion.id
    });
    expect(JSON.stringify(audit)).not.toContain(customer.phoneNumberNormalized);
  });

  it("denies a Staff member without access to the requested branch", async () => {
    const scope = await harness.createTenantScope();
    const otherBranch = await harness.createBranch(scope.organization);
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Other branch offer"
    });

    await expect(
      service.create({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: otherBranch.id,
        customerId: customer.id,
        promotionId: promotion.id
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(db.customerPromotionClaim.count()).resolves.toBe(0);
  });

  it("does not expose another tenant's customer or promotion", async () => {
    const first = await harness.createTenantScope();
    const second = await harness.createTenantScope();
    const firstCustomer = await harness.createCustomer(first.organization);
    const secondCustomer = await harness.createCustomer(second.organization);
    const firstPromotion = await activePromotion({
      organizationId: first.organization.id,
      userId: first.user.id,
      name: "First tenant offer"
    });
    const secondPromotion = await activePromotion({
      organizationId: second.organization.id,
      userId: second.user.id,
      name: "Second tenant offer"
    });
    const input = {
      organizationId: first.organization.id,
      actorUserId: first.user.id,
      branchId: first.branch.id,
      customerId: firstCustomer.id,
      promotionId: firstPromotion.id
    };

    await expect(
      service.create({ ...input, customerId: secondCustomer.id })
    ).rejects.toBeInstanceOf(PromotionClaimUnavailableError);
    await expect(
      service.create({ ...input, promotionId: secondPromotion.id })
    ).rejects.toBeInstanceOf(PromotionClaimUnavailableError);
    await expect(
      db.customerPromotionClaim.create({
        data: {
          organizationId: first.organization.id,
          branchId: first.branch.id,
          customerId: secondCustomer.id,
          promotionId: firstPromotion.id,
          claimedByUserId: first.user.id,
          source: PromotionClaimSource.STAFF
        }
      })
    ).rejects.toThrow();
    await expect(db.customerPromotionClaim.count()).resolves.toBe(0);
  });

  it("rejects inactive, untargeted, and wrong-promotion code claims", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const otherBranch = await harness.createBranch(scope.organization);
    const customer = await harness.createCustomer(scope.organization);
    const draft = await createPromotion(db, {
      organizationId: scope.organization.id,
      createdByUserId: scope.user.id,
      name: "Draft offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });
    const targeted = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Targeted offer",
      appliesToAllBranches: false,
      branchIds: [scope.branch.id]
    });
    const otherPromotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Other code offer"
    });
    const code = await db.promotionCode.create({
      data: {
        organizationId: scope.organization.id,
        promotionId: otherPromotion.id,
        code: "OTHER-CODE",
        codeType: PromotionCodeType.SHARED
      }
    });
    const input = {
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: draft.id
    };

    await expect(service.create(input)).rejects.toMatchObject({
      reasonCodes: [PromotionEligibilityReason.STATUS_DRAFT]
    } satisfies Partial<PromotionClaimIneligibleError>);
    await expect(
      service.create({ ...input, branchId: otherBranch.id, promotionId: targeted.id })
    ).rejects.toMatchObject({
      reasonCodes: [PromotionEligibilityReason.BRANCH_NOT_TARGETED]
    } satisfies Partial<PromotionClaimIneligibleError>);
    await expect(
      service.create({ ...input, promotionId: targeted.id, promotionCodeId: code.id })
    ).rejects.toMatchObject({
      reasonCodes: [PromotionEligibilityReason.CODE_UNAVAILABLE]
    } satisfies Partial<PromotionClaimIneligibleError>);
    await expect(db.customerPromotionClaim.count()).resolves.toBe(0);
  });

  it("defers spend threshold until checkout but blocks prior completed redemption", async () => {
    const scope = await harness.createTenantScope();
    const customer = await harness.createCustomer(scope.organization);
    const redeemedCustomer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Spend threshold offer",
      rewardType: PromotionRewardType.SPEND_THRESHOLD,
      minimumSpendCents: 5_000
    });
    const input = {
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: promotion.id
    };

    await expect(service.create(input)).resolves.toMatchObject({
      status: PromotionClaimStatus.CLAIMED
    });
    await db.redemption.create({
      data: {
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: redeemedCustomer.id,
        promotionId: promotion.id,
        status: RedemptionStatus.COMPLETED
      }
    });
    await expect(
      service.create({ ...input, customerId: redeemedCustomer.id })
    ).rejects.toMatchObject({
      reasonCodes: [PromotionEligibilityReason.ALREADY_REDEEMED]
    } satisfies Partial<PromotionClaimIneligibleError>);
  });

  it("allows exactly one concurrent active claim and one audit", async () => {
    const scope = await harness.createTenantScope({ organizationRole: MembershipRole.OWNER });
    const otherBranch = await harness.createBranch(scope.organization);
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Concurrent offer"
    });
    const input = {
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: promotion.id
    };

    const outcomes = await Promise.allSettled([
      service.create(input),
      service.create({ ...input, branchId: otherBranch.id })
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toMatchObject([
      { reason: expect.any(PromotionClaimConflictError) }
    ]);
    await expect(service.create(input)).rejects.toBeInstanceOf(PromotionClaimConflictError);
    await expect(
      db.customerPromotionClaim.count({
        where: { organizationId: scope.organization.id, status: PromotionClaimStatus.CLAIMED }
      })
    ).resolves.toBe(1);
    await expect(
      db.auditLog.count({
        where: { organizationId: scope.organization.id, action: "PROMOTION_CLAIM_CREATED" }
      })
    ).resolves.toBe(1);
  });

  it("retains cancelled claim history while allowing a corrected active claim", async () => {
    const scope = await harness.createTenantScope();
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Corrected claim offer"
    });
    const input = {
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: promotion.id
    };

    const original = await service.create(input);
    await db.customerPromotionClaim.update({
      where: { id: original.id },
      data: { status: PromotionClaimStatus.CANCELLED }
    });
    const corrected = await service.create(input);

    expect(corrected.id).not.toBe(original.id);
    await expect(
      db.customerPromotionClaim.findUniqueOrThrow({ where: { id: original.id } })
    ).resolves.toMatchObject({ status: PromotionClaimStatus.CANCELLED });
    await expect(
      db.customerPromotionClaim.findUniqueOrThrow({ where: { id: corrected.id } })
    ).resolves.toMatchObject({ status: PromotionClaimStatus.CLAIMED });
  });
});
