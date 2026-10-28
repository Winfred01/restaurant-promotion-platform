import {
  MembershipRole,
  MembershipStatus,
  Prisma,
  PrismaClient,
  PromotionRewardType,
  PromotionStatus,
  RedemptionStatus
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createPromotion, transitionPromotionStatus } from "@/server/promotions/lifecycle";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import { createCheckoutRedemptionService } from "./checkout";
import {
  createRedemptionVoidService,
  RedemptionVoidConflictError,
  RedemptionVoidUnavailableError
} from "./void";

const databaseUrl = process.env.DATABASE_URL ?? "";
const describeWithLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl)
  ? describe
  : describe.skip;

describe("redemption void input", () => {
  it("rejects a blank reason before opening a transaction", async () => {
    const service = createRedemptionVoidService({} as PrismaClient);

    await expect(
      service.voidRedemption({
        organizationId: "org",
        actorUserId: "actor",
        redemptionId: "redemption",
        reason: "   "
      })
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("maps database uniqueness and serialization failures to a safe conflict", async () => {
    const db = {
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError("Transaction conflict", {
          code: "P2034",
          clientVersion: Prisma.prismaVersion.client
        });
      }
    } as unknown as PrismaClient;

    await expect(
      createRedemptionVoidService(db).voidRedemption({
        organizationId: "org",
        actorUserId: "actor",
        redemptionId: "redemption",
        reason: "Incorrect receipt"
      })
    ).rejects.toBeInstanceOf(RedemptionVoidConflictError);
  });
});

describeWithLocalDatabase("redemption void transaction", () => {
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

  async function completedRedemption(input: {
    organizationId: string;
    branchId: string;
    customerId: string;
    actorUserId: string;
    name: string;
    receiptNumber: string;
  }) {
    const promotion = await createPromotion(db, {
      organizationId: input.organizationId,
      createdByUserId: input.actorUserId,
      name: input.name,
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });
    await transitionPromotionStatus(db, {
      organizationId: input.organizationId,
      promotionId: promotion.id,
      status: PromotionStatus.ACTIVE
    });
    return createCheckoutRedemptionService(db).create({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      branchId: input.branchId,
      customerId: input.customerId,
      promotionId: promotion.id,
      receiptNumber: input.receiptNumber,
      billSubtotalCents: 2_000
    });
  }

  it("lets a Manager void without deleting the redemption and records reason and audit", async () => {
    const voidedAt = new Date("2026-10-28T12:00:00.000Z");
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const customer = await harness.createCustomer(scope.organization);
    const redemption = await completedRedemption({
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      actorUserId: scope.user.id,
      name: "Voidable offer",
      receiptNumber: "VOID-1"
    });

    const result = await createRedemptionVoidService(db, { now: () => voidedAt }).voidRedemption({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      redemptionId: redemption.id,
      reason: "  Incorrect receipt entered  "
    });

    expect(result.redemption).toMatchObject({
      id: redemption.id,
      status: RedemptionStatus.VOIDED,
      voidedAt
    });
    expect(result.redemptionVoid).toMatchObject({
      organizationId: scope.organization.id,
      redemptionId: redemption.id,
      voidedByUserId: scope.user.id,
      reason: "Incorrect receipt entered",
      createdAt: voidedAt
    });
    await expect(db.redemption.findUnique({ where: { id: redemption.id } })).resolves.toMatchObject(
      {
        status: RedemptionStatus.VOIDED,
        voidedAt
      }
    );
    await expect(
      db.auditLog.findFirstOrThrow({
        where: {
          organizationId: scope.organization.id,
          entityType: "Redemption",
          entityId: redemption.id,
          action: "REDEMPTION_VOIDED"
        }
      })
    ).resolves.toMatchObject({
      branchId: scope.branch.id,
      actorUserId: scope.user.id,
      actorRole: MembershipRole.MANAGER,
      promotionId: null,
      reason: "Incorrect receipt entered"
    });
    await expect(db.redemption.count({ where: { id: redemption.id } })).resolves.toBe(1);
  });

  it("lets an Owner void without relying on branch membership", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.STAFF,
      branchMembershipStatus: MembershipStatus.DISABLED
    });
    const customer = await harness.createCustomer(scope.organization);
    const redemption = await completedRedemption({
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      actorUserId: scope.user.id,
      name: "Owner void offer",
      receiptNumber: "OWNER-VOID-1"
    });

    await expect(
      createRedemptionVoidService(db).voidRedemption({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        redemptionId: redemption.id,
        reason: "Owner correction"
      })
    ).resolves.toMatchObject({
      redemption: { status: RedemptionStatus.VOIDED },
      redemptionVoid: { voidedByUserId: scope.user.id }
    });
  });

  it("denies Staff and a Manager without access to the redemption branch", async () => {
    const scope = await harness.createTenantScope();
    const customer = await harness.createCustomer(scope.organization);
    const redemption = await completedRedemption({
      organizationId: scope.organization.id,
      branchId: scope.branch.id,
      customerId: customer.id,
      actorUserId: scope.user.id,
      name: "Protected void offer",
      receiptNumber: "PROTECTED-VOID-1"
    });
    const manager = await harness.createUser({ emailPrefix: "other-manager" });
    await harness.createOrganizationMembership({
      organization: scope.organization,
      user: manager,
      role: MembershipRole.MANAGER
    });

    const service = createRedemptionVoidService(db);
    await expect(
      service.voidRedemption({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        redemptionId: redemption.id,
        reason: "Staff attempt"
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.voidRedemption({
        organizationId: scope.organization.id,
        actorUserId: manager.id,
        redemptionId: redemption.id,
        reason: "Other branch attempt"
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(db.redemptionVoid.count({ where: { redemptionId: redemption.id } })).resolves.toBe(
      0
    );
    await expect(
      db.redemption.findUniqueOrThrow({ where: { id: redemption.id } })
    ).resolves.toMatchObject({ status: RedemptionStatus.COMPLETED });
  });

  it("hides cross-tenant records and prevents a second void", async () => {
    const first = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const second = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const customer = await harness.createCustomer(first.organization);
    const redemption = await completedRedemption({
      organizationId: first.organization.id,
      branchId: first.branch.id,
      customerId: customer.id,
      actorUserId: first.user.id,
      name: "Single void offer",
      receiptNumber: "SINGLE-VOID-1"
    });
    const service = createRedemptionVoidService(db);

    await expect(
      service.voidRedemption({
        organizationId: second.organization.id,
        actorUserId: second.user.id,
        redemptionId: redemption.id,
        reason: "Cross tenant"
      })
    ).rejects.toBeInstanceOf(RedemptionVoidUnavailableError);

    await service.voidRedemption({
      organizationId: first.organization.id,
      actorUserId: first.user.id,
      redemptionId: redemption.id,
      reason: "Original correction"
    });
    await expect(
      service.voidRedemption({
        organizationId: first.organization.id,
        actorUserId: first.user.id,
        redemptionId: redemption.id,
        reason: "Second correction"
      })
    ).rejects.toBeInstanceOf(RedemptionVoidConflictError);
    await expect(db.redemptionVoid.count({ where: { redemptionId: redemption.id } })).resolves.toBe(
      1
    );
    await expect(
      db.auditLog.count({
        where: {
          organizationId: first.organization.id,
          entityId: redemption.id,
          action: "REDEMPTION_VOIDED"
        }
      })
    ).resolves.toBe(1);
  });
});
