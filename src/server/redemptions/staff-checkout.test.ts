import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  evaluate: vi.fn(),
  create: vi.fn()
}));

vi.mock("@/server/authorization/guard", () => ({
  createPrismaAuthorizationGuard: () => ({ requireBranchPermission: mocks.authorize })
}));
vi.mock("@/server/promotions/eligibility", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/promotions/eligibility")>()),
  createPromotionEligibilityService: () => ({ evaluate: mocks.evaluate })
}));
vi.mock("./checkout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./checkout")>()),
  createCheckoutRedemptionService: () => ({ create: mocks.create })
}));

import { createStaffCheckoutWorkflow } from "./staff-checkout";

const session = async () => ({
  user: { id: "employee-a", email: "staff@example.com", name: "Staff" }
});
const base = {
  organizationId: "org-a",
  branchId: "branch-a",
  customerId: "customer-a",
  billSubtotalCents: 1200
};

function database() {
  const findUnique = vi.fn().mockResolvedValue({ id: "customer-a" });
  const findMany = vi.fn().mockResolvedValue([{ id: "promotion-a", name: "Lunch" }]);
  return {
    client: { customer: { findUnique }, promotion: { findMany } } as unknown as PrismaClient,
    findUnique,
    findMany
  };
}

describe("staff checkout workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evaluate.mockResolvedValue([
      {
        promotionId: "promotion-a",
        eligible: true,
        reasonCodes: [],
        discountCents: 200,
        finalBillCents: 1000,
        isBestDeal: true
      }
    ]);
  });

  it("authorizes a branch, scopes offers to its tenant, and marks the advisory Best Deal", async () => {
    const db = database();
    const result = await createStaffCheckoutWorkflow(db.client, session).quote(base);
    expect(mocks.authorize).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      userId: "employee-a",
      permission: "promotion:eligibility:view"
    });
    expect(db.findUnique).toHaveBeenCalledWith({
      where: { id_organizationId: { id: "customer-a", organizationId: "org-a" } },
      select: { id: true }
    });
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-a",
          OR: expect.arrayContaining([{ appliesToAllBranches: true }])
        })
      })
    );
    expect(mocks.evaluate).toHaveBeenCalledWith({
      ...base,
      actorUserId: "employee-a",
      candidates: [{ promotionId: "promotion-a" }]
    });
    expect(result.offers).toMatchObject([{ name: "Lunch", isBestDeal: true, discountCents: 200 }]);
  });

  it("refuses a customer outside the organization before loading promotions", async () => {
    const db = database();
    db.findUnique.mockResolvedValue(null);
    await expect(createStaffCheckoutWorkflow(db.client, session).quote(base)).rejects.toThrow(
      "unavailable"
    );
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it("uses the authenticated actor when confirming one redemption", async () => {
    const db = database();
    mocks.create.mockResolvedValue({
      id: "redemption-a",
      receiptNumber: "R-1",
      billSubtotalCents: 1200,
      discountCents: 200,
      netBillCents: 1000
    });
    const input = { ...base, promotionId: "promotion-a", receiptNumber: "R-1" };
    const result = await createStaffCheckoutWorkflow(db.client, session).redeem(input);
    expect(mocks.authorize).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      userId: "employee-a",
      permission: "redemption:create"
    });
    expect(mocks.create).toHaveBeenCalledWith({ ...input, actorUserId: "employee-a" });
    expect(result.id).toBe("redemption-a");
  });
});
