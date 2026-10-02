import {
  MembershipRole,
  PrismaClient,
  PromotionCodeType,
  PromotionRewardType
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import {
  createPromotionCodeService,
  generatePromotionCode,
  GENERATED_PROMOTION_CODE_ATTEMPTS,
  GENERATED_PROMOTION_CODE_LENGTH,
  isValidPromotionCode,
  normalizePromotionCode,
  PROMOTION_CODE_MAX_LENGTH,
  PROMOTION_CODE_MIN_LENGTH,
  PromotionCodeConflictError,
  PromotionCodeGenerationError,
  PromotionCodeUnavailableError,
  PromotionCodeValidationError
} from "./codes";
import { createPromotion, PromotionUnavailableError } from "./lifecycle";
import { createPromotionManagementService } from "./management";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describe("promotion code validation and generation", () => {
  it("normalizes valid manual codes and enforces deterministic boundaries", () => {
    expect(normalizePromotionCode("  spring-2026 ")).toBe("SPRING-2026");
    expect(isValidPromotionCode("A".repeat(PROMOTION_CODE_MIN_LENGTH))).toBe(true);
    expect(isValidPromotionCode("A".repeat(PROMOTION_CODE_MAX_LENGTH))).toBe(true);

    for (const invalidCode of [
      "A".repeat(PROMOTION_CODE_MIN_LENGTH - 1),
      "A".repeat(PROMOTION_CODE_MAX_LENGTH + 1),
      "SAVE 10",
      "SAVE_10",
      "-SAVE10",
      "SAVE10-",
      "SAVE--10",
      "SAVÉ10",
      "ßßß"
    ]) {
      expect(isValidPromotionCode(invalidCode)).toBe(false);
      expect(() => normalizePromotionCode(invalidCode)).toThrow(PromotionCodeValidationError);
    }
  });

  it("generates codes that satisfy the same live validation rules", () => {
    for (let sample = 0; sample < 20; sample += 1) {
      const code = generatePromotionCode();
      expect(code).toHaveLength(GENERATED_PROMOTION_CODE_LENGTH);
      expect(normalizePromotionCode(code)).toBe(code);
    }
  });

  it("rejects invalid shared codes before opening a transaction", async () => {
    const service = createPromotionCodeService({} as PrismaClient);

    await expect(
      service.createShared({
        organizationId: "organization-id",
        actorUserId: "user-id",
        promotionId: "promotion-id",
        code: "invalid code"
      })
    ).rejects.toBeInstanceOf(PromotionCodeValidationError);
  });
});

describeWithLocalDatabase("promotion code persistence and tenant isolation", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);
  const management = createPromotionManagementService(db);

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function createOwnerPromotion(name = "Code offer") {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const promotion = await management.create({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      name,
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });

    return { scope, promotion };
  }

  it("creates and validates a normalized manual/shared code with an atomic audit", async () => {
    const { scope, promotion } = await createOwnerPromotion();
    const service = createPromotionCodeService(db);

    const promotionCode = await service.createShared({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      promotionId: promotion.id,
      code: "  spring-2026 "
    });

    expect(promotionCode).toMatchObject({
      organizationId: scope.organization.id,
      promotionId: promotion.id,
      code: "SPRING-2026",
      codeType: PromotionCodeType.SHARED,
      status: "ACTIVE"
    });
    await expect(
      service.validate({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: scope.branch.id,
        promotionId: promotion.id,
        code: "spring-2026"
      })
    ).resolves.toMatchObject({ id: promotionCode.id });
    await expect(
      db.auditLog.findMany({
        where: { promotionId: promotion.id, action: "PROMOTION_CODE_CREATED" }
      })
    ).resolves.toMatchObject([
      {
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        actorRole: MembershipRole.OWNER,
        entityType: "Promotion",
        entityId: promotion.id
      }
    ]);
  });

  it("retries generated collisions within a fixed bound and leaves no partial audits", async () => {
    const { scope, promotion } = await createOwnerPromotion();
    const sharedService = createPromotionCodeService(db);
    await sharedService.createShared({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      promotionId: promotion.id,
      code: "TAKEN-2026"
    });
    const candidates = ["TAKEN-2026", "FRESH-2026"];
    const generatedService = createPromotionCodeService(db, {
      generateCode: () => candidates.shift() ?? "UNEXPECTED"
    });

    await expect(
      generatedService.createGenerated({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        promotionId: promotion.id
      })
    ).resolves.toMatchObject({
      code: "FRESH-2026",
      codeType: PromotionCodeType.UNIQUE
    });
    await expect(
      db.auditLog.count({
        where: { promotionId: promotion.id, action: "PROMOTION_CODE_CREATED" }
      })
    ).resolves.toBe(2);
  });

  it("fails safely after the bounded generated-code collision budget", async () => {
    const { scope, promotion } = await createOwnerPromotion();
    const service = createPromotionCodeService(db, { generateCode: () => "TAKEN-2026" });
    await service.createShared({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      promotionId: promotion.id,
      code: "TAKEN-2026"
    });

    await expect(
      service.createGenerated({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        promotionId: promotion.id
      })
    ).rejects.toBeInstanceOf(PromotionCodeGenerationError);
    await expect(
      db.promotionCode.count({ where: { organizationId: scope.organization.id } })
    ).resolves.toBe(1);
    await expect(
      db.auditLog.count({
        where: { promotionId: promotion.id, action: "PROMOTION_CODE_CREATED" }
      })
    ).resolves.toBe(1);
    expect(GENERATED_PROMOTION_CODE_ATTEMPTS).toBe(5);
  });

  it("enforces organization-wide uniqueness while allowing cross-tenant reuse", async () => {
    const first = await createOwnerPromotion("First tenant offer");
    const secondPromotion = await management.create({
      organizationId: first.scope.organization.id,
      actorUserId: first.scope.user.id,
      name: "Second offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 600,
      appliesToAllBranches: true
    });
    const secondTenant = await createOwnerPromotion("Second tenant offer");
    const service = createPromotionCodeService(db);

    await service.createShared({
      organizationId: first.scope.organization.id,
      actorUserId: first.scope.user.id,
      promotionId: first.promotion.id,
      code: "SAVE-2026"
    });
    await expect(
      service.createShared({
        organizationId: first.scope.organization.id,
        actorUserId: first.scope.user.id,
        promotionId: secondPromotion.id,
        code: "save-2026"
      })
    ).rejects.toBeInstanceOf(PromotionCodeConflictError);
    await expect(
      service.createShared({
        organizationId: secondTenant.scope.organization.id,
        actorUserId: secondTenant.scope.user.id,
        promotionId: secondTenant.promotion.id,
        code: "SAVE-2026"
      })
    ).resolves.toMatchObject({ code: "SAVE-2026" });
  });

  it("authorizes both shared and generated mutation paths", async () => {
    const manager = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const managerPromotion = await createPromotion(db, {
      organizationId: manager.organization.id,
      createdByUserId: manager.user.id,
      name: "Manager branch offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: false,
      branchIds: [manager.branch.id]
    });
    const managerAllBranchPromotion = await createPromotion(db, {
      organizationId: manager.organization.id,
      createdByUserId: manager.user.id,
      name: "Manager all-branch offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: true
    });
    const staff = await harness.createTenantScope({
      organizationRole: MembershipRole.STAFF,
      branchRole: MembershipRole.STAFF
    });
    const staffPromotion = await createPromotion(db, {
      organizationId: staff.organization.id,
      createdByUserId: staff.user.id,
      name: "Staff tenant offer",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 500,
      appliesToAllBranches: false,
      branchIds: [staff.branch.id]
    });
    const service = createPromotionCodeService(db, { generateCode: () => "GENERATED-1" });

    await expect(
      service.createShared({
        organizationId: manager.organization.id,
        actorUserId: manager.user.id,
        promotionId: managerPromotion.id,
        code: "MANAGER-1"
      })
    ).resolves.toMatchObject({ codeType: PromotionCodeType.SHARED });
    await expect(
      service.createGenerated({
        organizationId: manager.organization.id,
        actorUserId: manager.user.id,
        promotionId: managerPromotion.id
      })
    ).resolves.toMatchObject({ codeType: PromotionCodeType.UNIQUE });
    await expect(
      service.createShared({
        organizationId: manager.organization.id,
        actorUserId: manager.user.id,
        promotionId: managerAllBranchPromotion.id,
        code: "ALL-BRANCH"
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.createShared({
        organizationId: staff.organization.id,
        actorUserId: staff.user.id,
        promotionId: staffPromotion.id,
        code: "STAFF-SHARED"
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.createGenerated({
        organizationId: staff.organization.id,
        actorUserId: staff.user.id,
        promotionId: staffPromotion.id
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("does not reveal or mutate another tenant's promotion-code state", async () => {
    const first = await createOwnerPromotion("First tenant offer");
    const second = await createOwnerPromotion("Second tenant offer");
    const service = createPromotionCodeService(db);
    await service.createShared({
      organizationId: first.scope.organization.id,
      actorUserId: first.scope.user.id,
      promotionId: first.promotion.id,
      code: "PRIVATE-2026"
    });

    await expect(
      service.validate({
        organizationId: second.scope.organization.id,
        actorUserId: second.scope.user.id,
        branchId: second.scope.branch.id,
        promotionId: first.promotion.id,
        code: "PRIVATE-2026"
      })
    ).rejects.toBeInstanceOf(PromotionCodeUnavailableError);
    await expect(
      service.createShared({
        organizationId: second.scope.organization.id,
        actorUserId: second.scope.user.id,
        promotionId: first.promotion.id,
        code: "CROSS-TENANT"
      })
    ).rejects.toBeInstanceOf(PromotionUnavailableError);
    await expect(
      db.promotionCode.count({ where: { promotionId: first.promotion.id } })
    ).resolves.toBe(1);
  });

  it("keeps codes independent from customer identity and promotion-management edits", async () => {
    const { scope, promotion } = await createOwnerPromotion();
    const customer = await harness.createCustomer(scope.organization);
    const beforeCustomer = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const service = createPromotionCodeService(db);

    const sharedCode = await service.createShared({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      promotionId: promotion.id,
      code: "CUSTOMER-INDEPENDENT"
    });
    await management.edit({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id,
      promotionId: promotion.id,
      name: "Edited code offer",
      rewardType: PromotionRewardType.PERCENTAGE,
      discountPercent: 10,
      appliesToAllBranches: true
    });

    await expect(
      service.validate({
        organizationId: scope.organization.id,
        actorUserId: scope.user.id,
        branchId: scope.branch.id,
        promotionId: promotion.id,
        code: sharedCode.code
      })
    ).resolves.toMatchObject({ id: sharedCode.id });
    await expect(db.customer.findUniqueOrThrow({ where: { id: customer.id } })).resolves.toEqual(
      beforeCustomer
    );
  });

  it("enforces the canonical code format in PostgreSQL", async () => {
    const { scope, promotion } = await createOwnerPromotion();

    await expect(
      db.promotionCode.create({
        data: {
          organizationId: scope.organization.id,
          promotionId: promotion.id,
          code: "lowercase",
          codeType: PromotionCodeType.SHARED
        }
      })
    ).rejects.toThrow();
    await expect(
      db.promotionCode.create({
        data: {
          organizationId: scope.organization.id,
          promotionId: promotion.id,
          code: "BAD--CODE",
          codeType: PromotionCodeType.SHARED
        }
      })
    ).rejects.toThrow();
  });
});
