import {
  MembershipRole,
  Prisma,
  PrismaClient,
  PromotionClaimStatus,
  PromotionRewardType,
  PromotionStatus
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createPromotion, transitionPromotionStatus } from "@/server/promotions/lifecycle";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import {
  createCheckoutRedemptionService,
  normalizeReceiptNumber,
  RedemptionConflictError,
  RedemptionIneligibleError,
  RedemptionUnavailableError
} from "./checkout";
import { PromotionEligibilityReason } from "@/server/promotions/eligibility";

const databaseUrl = process.env.DATABASE_URL ?? "";
const describeWithLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl)
  ? describe
  : describe.skip;

describe("checkout input and receipt normalization", () => {
  it("normalizes case and spacing consistently", () => {
    expect(normalizeReceiptNumber("  ab  42  ")).toBe("AB 42");
  });

  it("rejects invalid bill and receipt before opening a transaction", async () => {
    const service = createCheckoutRedemptionService({} as PrismaClient);
    const input = {
      organizationId: "org",
      actorUserId: "actor",
      branchId: "branch",
      customerId: "customer",
      promotionId: "promotion",
      receiptNumber: "A-1",
      billSubtotalCents: 500
    };

    await expect(service.create({ ...input, billSubtotalCents: -1 })).rejects.toMatchObject({
      name: "ZodError"
    });
    await expect(service.create({ ...input, receiptNumber: "   " })).rejects.toMatchObject({
      name: "ZodError"
    });
  });

  it("returns a safe conflict when a database uniqueness constraint wins", async () => {
    const db = {
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: Prisma.prismaVersion.client
        });
      }
    } as unknown as PrismaClient;

    await expect(
      createCheckoutRedemptionService(db).create({
        organizationId: "org",
        actorUserId: "actor",
        branchId: "branch",
        customerId: "customer",
        promotionId: "promotion",
        receiptNumber: "A-1",
        billSubtotalCents: 500
      })
    ).rejects.toBeInstanceOf(RedemptionConflictError);
  });
});

describeWithLocalDatabase("checkout redemption transaction", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);
  const service = createCheckoutRedemptionService(db);

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
    rewardType?: PromotionRewardType;
    minimumSpendCents?: number;
  }) {
    const common = {
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      name: input.name,
      appliesToAllBranches: true
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

  it("redeems an active claim, stores integer cents, and writes one phone-free audit", async () => {
    const scope = await harness.createTenantScope();
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Checkout offer"
    });
    const claim = await db.customerPromotionClaim.create({
      data: {
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customer.id,
        promotionId: promotion.id,
        claimedByUserId: scope.user.id
      }
    });

    const redemption = await service.create({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: promotion.id,
      claimId: claim.id,
      receiptNumber: "  a-42  ",
      billSubtotalCents: 2_000
    });

    expect(redemption).toMatchObject({
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: promotion.id,
      claimId: claim.id,
      redeemedByUserId: scope.user.id,
      receiptNumber: "a-42",
      normalizedReceiptNumber: "A-42",
      billSubtotalCents: 2_000,
      discountCents: 500,
      netBillCents: 1_500,
      status: "COMPLETED"
    });
    await expect(
      db.customerPromotionClaim.findUniqueOrThrow({ where: { id: claim.id } })
    ).resolves.toMatchObject({ status: PromotionClaimStatus.REDEEMED });
    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        organizationId: scope.organization.id,
        entityType: "Redemption",
        entityId: redemption.id
      }
    });
    expect(audit).toMatchObject({
      actorUserId: scope.user.id,
      actorRole: MembershipRole.STAFF,
      action: "REDEMPTION_CREATED",
      promotionId: null
    });
    expect(JSON.stringify(audit)).not.toContain(customer.phoneNumberNormalized);
  });

  it("denies branch access and hides cross-tenant records", async () => {
    const first = await harness.createTenantScope();
    const second = await harness.createTenantScope();
    const otherBranch = await harness.createBranch(first.organization);
    const customer = await harness.createCustomer(first.organization);
    const otherCustomer = await harness.createCustomer(second.organization);
    const promotion = await activePromotion({
      organizationId: first.organization.id,
      userId: first.user.id,
      name: "Scoped offer"
    });
    const input = {
      organizationId: first.organization.id,
      actorUserId: first.user.id,
      branchId: first.branch.id,
      customerId: customer.id,
      promotionId: promotion.id,
      receiptNumber: "SCOPE-1",
      billSubtotalCents: 2_000
    };

    await expect(service.create({ ...input, branchId: otherBranch.id })).rejects.toBeInstanceOf(
      AuthorizationDeniedError
    );
    await expect(service.create({ ...input, customerId: otherCustomer.id })).rejects.toBeInstanceOf(
      RedemptionUnavailableError
    );
    await expect(db.redemption.count()).resolves.toBe(0);
  });

  it("rechecks spend threshold and current promotion state inside checkout", async () => {
    const scope = await harness.createTenantScope();
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Threshold offer",
      rewardType: PromotionRewardType.SPEND_THRESHOLD,
      minimumSpendCents: 5_000
    });
    const input = {
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      promotionId: promotion.id,
      receiptNumber: "THRESHOLD-1",
      billSubtotalCents: 4_999
    };

    await expect(service.create(input)).rejects.toMatchObject({
      reasonCodes: [PromotionEligibilityReason.MINIMUM_SPEND_NOT_MET]
    } satisfies Partial<RedemptionIneligibleError>);
    await transitionPromotionStatus(db, {
      organizationId: scope.organization.id,
      promotionId: promotion.id,
      status: PromotionStatus.PAUSED
    });
    await expect(service.create({ ...input, billSubtotalCents: 5_000 })).rejects.toMatchObject({
      reasonCodes: [PromotionEligibilityReason.STATUS_PAUSED]
    } satisfies Partial<RedemptionIneligibleError>);
    await expect(db.redemption.count()).resolves.toBe(0);
  });

  it("blocks a reused receipt and prior customer promotion redemption", async () => {
    const scope = await harness.createTenantScope();
    const firstCustomer = await harness.createCustomer(scope.organization);
    const secondCustomer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "One use offer"
    });
    const input = {
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      branchId: scope.branch.id,
      customerId: firstCustomer.id,
      promotionId: promotion.id,
      receiptNumber: "AB 42",
      billSubtotalCents: 2_000
    };

    await service.create(input);
    await expect(service.create({ ...input, receiptNumber: "NEW-RECEIPT" })).rejects.toMatchObject({
      reasonCodes: [PromotionEligibilityReason.ALREADY_REDEEMED]
    } satisfies Partial<RedemptionIneligibleError>);
    await expect(
      service.create({ ...input, customerId: secondCustomer.id, receiptNumber: "ab  42" })
    ).rejects.toBeInstanceOf(RedemptionConflictError);
    await expect(db.redemption.count()).resolves.toBe(1);
  });

  it("enforces completed-only uniqueness in PostgreSQL and allows branch receipt reuse", async () => {
    const scope = await harness.createTenantScope();
    const otherBranch = await harness.createBranch(scope.organization);
    const firstCustomer = await harness.createCustomer(scope.organization);
    const secondCustomer = await harness.createCustomer(scope.organization);
    const firstPromotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Database unique offer one"
    });
    const secondPromotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Database unique offer two"
    });
    const first = await db.redemption.create({
      data: {
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: firstCustomer.id,
        promotionId: firstPromotion.id,
        normalizedReceiptNumber: "R-1"
      }
    });

    await expect(
      db.redemption.create({
        data: {
          organizationId: scope.organization.id,
          branchId: otherBranch.id,
          customerId: firstCustomer.id,
          promotionId: firstPromotion.id,
          normalizedReceiptNumber: "R-2"
        }
      })
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      db.redemption.create({
        data: {
          organizationId: scope.organization.id,
          branchId: scope.branch.id,
          customerId: secondCustomer.id,
          promotionId: secondPromotion.id,
          normalizedReceiptNumber: "R-1"
        }
      })
    ).rejects.toMatchObject({ code: "P2002" });

    await expect(
      db.redemption.create({
        data: {
          organizationId: scope.organization.id,
          branchId: otherBranch.id,
          customerId: secondCustomer.id,
          promotionId: secondPromotion.id,
          normalizedReceiptNumber: "R-1"
        }
      })
    ).resolves.toMatchObject({ branchId: otherBranch.id });

    await db.redemption.update({ where: { id: first.id }, data: { status: "VOIDED" } });
    await expect(
      db.redemption.create({
        data: {
          organizationId: scope.organization.id,
          branchId: scope.branch.id,
          customerId: firstCustomer.id,
          promotionId: firstPromotion.id,
          normalizedReceiptNumber: "R-1"
        }
      })
    ).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("rejects a claim from another branch or customer", async () => {
    const scope = await harness.createTenantScope();
    const otherBranch = await harness.createBranch(scope.organization);
    const customer = await harness.createCustomer(scope.organization);
    const otherCustomer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion({
      organizationId: scope.organization.id,
      userId: scope.user.id,
      name: "Claim binding offer"
    });
    const claim = await db.customerPromotionClaim.create({
      data: {
        organizationId: scope.organization.id,
        branchId: otherBranch.id,
        customerId: otherCustomer.id,
        promotionId: promotion.id,
        claimedByUserId: scope.user.id
      }
    });

    await expect(
      service.create({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: scope.branch.id,
        customerId: customer.id,
        promotionId: promotion.id,
        claimId: claim.id,
        receiptNumber: "CLAIM-1",
        billSubtotalCents: 2_000
      })
    ).rejects.toBeInstanceOf(RedemptionUnavailableError);
    await expect(db.redemption.count()).resolves.toBe(0);
  });
});
