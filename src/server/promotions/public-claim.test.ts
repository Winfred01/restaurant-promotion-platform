import { randomBytes } from "node:crypto";

import {
  BranchStatus,
  PrismaClient,
  PromotionClaimSource,
  PromotionClaimStatus,
  PromotionRewardType,
  PromotionStatus,
  RedemptionStatus
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import { createPromotion, transitionPromotionStatus } from "./lifecycle";
import { createPublicClaimService } from "./public-claim";

const databaseUrl = process.env.DATABASE_URL ?? "";
const describeWithLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl)
  ? describe
  : describe.skip;

describe("public claim validation", () => {
  it("rejects malformed input before opening a transaction", async () => {
    const service = createPublicClaimService({} as PrismaClient, {
      hashSecret: "test-secret-with-at-least-thirty-two-characters"
    });
    await expect(
      service.claim({
        organizationId: "org",
        branchId: "branch",
        promotionId: "promotion",
        phoneNumber: "not a phone",
        remoteAddress: "192.0.2.1"
      })
    ).rejects.toMatchObject({ code: "INVALID_PHONE_NUMBER" });
  });
});

describeWithLocalDatabase("public QR claim database boundaries", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);
  const secret = randomBytes(32).toString("hex");
  const service = createPublicClaimService(db, { hashSecret: secret });

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function activePromotion(organizationId: string, userId: string, branchId?: string) {
    const promotion = await createPromotion(db, {
      organizationId,
      createdByUserId: userId,
      name: "Public QR offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: !branchId,
      branchIds: branchId ? [branchId] : undefined
    });
    await transitionPromotionStatus(db, {
      organizationId,
      promotionId: promotion.id,
      status: PromotionStatus.ACTIVE
    });
    return promotion;
  }

  it("claims an existing customer without an employee actor or phone in audit", async () => {
    const scope = await harness.createTenantScope();
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion(scope.organization.id, scope.user.id);
    await service.claim({
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      promotionId: promotion.id,
      phoneNumber: customer.phoneNumberRaw,
      remoteAddress: "192.0.2.10"
    });

    const claim = await db.customerPromotionClaim.findFirstOrThrow({
      where: { organizationId: scope.organization.id, customerId: customer.id }
    });
    expect(claim).toMatchObject({
      source: PromotionClaimSource.QR,
      claimedByUserId: null,
      status: PromotionClaimStatus.CLAIMED
    });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { organizationId: scope.organization.id, entityId: claim.id }
    });
    expect(audit).toMatchObject({ actorUserId: null, actorRole: null });
    expect(JSON.stringify(audit)).not.toContain(customer.phoneNumberNormalized);
  });

  it("does not claim unknown, foreign-tenant, or inactive branch contexts", async () => {
    const first = await harness.createTenantScope();
    const second = await harness.createTenantScope();
    const foreignCustomer = await harness.createCustomer(second.organization);
    const promotion = await activePromotion(first.organization.id, first.user.id);
    const input = {
      organizationId: first.organization.id,
      branchId: first.branch.id,
      promotionId: promotion.id,
      phoneNumber: foreignCustomer.phoneNumberRaw,
      remoteAddress: "192.0.2.11"
    };

    await service.claim(input);
    await service.claim({ ...input, phoneNumber: "4165550198" });
    await db.branch.update({
      where: { id: first.branch.id },
      data: { status: BranchStatus.ARCHIVED }
    });
    const localCustomer = await harness.createCustomer(first.organization);
    await service.claim({ ...input, phoneNumber: localCustomer.phoneNumberRaw });
    expect(
      await db.customerPromotionClaim.count({ where: { organizationId: first.organization.id } })
    ).toBe(0);
  });

  it("respects branch targeting and prior successful redemption", async () => {
    const scope = await harness.createTenantScope();
    const otherBranch = await harness.createBranch(scope.organization);
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion(scope.organization.id, scope.user.id, scope.branch.id);
    const input = {
      organizationId: scope.organization.id,
      branchId: otherBranch.id,
      promotionId: promotion.id,
      phoneNumber: customer.phoneNumberRaw,
      remoteAddress: "192.0.2.14"
    };

    await service.claim(input);
    await db.redemption.create({
      data: {
        organizationId: scope.organization.id,
        branchId: scope.branch.id,
        customerId: customer.id,
        promotionId: promotion.id,
        status: RedemptionStatus.COMPLETED
      }
    });
    await service.claim({ ...input, branchId: scope.branch.id });
    expect(
      await db.customerPromotionClaim.count({ where: { organizationId: scope.organization.id } })
    ).toBe(0);
  });

  it("allows one concurrent claim", async () => {
    const scope = await harness.createTenantScope();
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion(scope.organization.id, scope.user.id);
    const input = {
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      promotionId: promotion.id,
      phoneNumber: customer.phoneNumberRaw,
      remoteAddress: "192.0.2.12"
    };

    await Promise.allSettled([service.claim(input), service.claim(input)]);
    expect(
      await db.customerPromotionClaim.count({ where: { organizationId: scope.organization.id } })
    ).toBe(1);
  });

  it("enforces the phone limit after three requests", async () => {
    const scope = await harness.createTenantScope();
    const customer = await harness.createCustomer(scope.organization);
    const promotion = await activePromotion(scope.organization.id, scope.user.id);
    const input = {
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      promotionId: promotion.id,
      phoneNumber: customer.phoneNumberRaw,
      remoteAddress: "192.0.2.13"
    };

    await service.claim(input);
    await service.claim(input);
    await service.claim(input);
    await db.customerPromotionClaim.updateMany({
      where: { organizationId: scope.organization.id },
      data: { status: PromotionClaimStatus.CANCELLED }
    });
    await service.claim(input);
    expect(
      await db.customerPromotionClaim.count({
        where: { organizationId: scope.organization.id, status: PromotionClaimStatus.CLAIMED }
      })
    ).toBe(0);
  });
});
