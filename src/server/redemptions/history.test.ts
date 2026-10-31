import { RedemptionStatus, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  findMany: vi.fn()
}));

vi.mock("@/server/authorization/guard", () => ({
  createPrismaAuthorizationGuard: () => ({ requireBranchPermission: mocks.permission })
}));

import { Permission } from "@/server/authorization/permissions";
import { createRedemptionHistoryService, maskPhone } from "./history";

const db = { redemption: { findMany: mocks.findMany } } as unknown as PrismaClient;
const input = {
  organizationId: "org-a",
  branchId: "branch-a",
  actorUserId: "manager-a",
  status: "ALL" as const
};

describe("redemption history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ role: "MANAGER" });
    mocks.findMany.mockResolvedValue([]);
  });

  it("requires void permission before loading a tenant and branch scoped history", async () => {
    await createRedemptionHistoryService(db).list(input);
    expect(mocks.permission).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      userId: "manager-a",
      permission: Permission.REDEMPTION_VOID
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-a", branchId: "branch-a" },
        take: 100
      })
    );
  });

  it("does not query records when permission is denied", async () => {
    mocks.permission.mockRejectedValue(new Error("denied"));
    await expect(createRedemptionHistoryService(db).list(input)).rejects.toThrow("denied");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("filters status and returns masked phone with preserved void history", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "red-a",
        receiptNumber: "R-1",
        billSubtotalCents: 6000,
        discountCents: 1000,
        netBillCents: 5000,
        status: RedemptionStatus.VOIDED,
        redeemedAt: new Date("2026-10-01T12:00:00Z"),
        voidedAt: new Date("2026-10-02T12:00:00Z"),
        customer: { phoneNumberDisplay: "+1 (416) 555-1234" },
        promotion: { name: "Lunch" },
        redeemedByMembership: { user: { name: "Staff A" } },
        redemptionVoid: {
          reason: "Wrong receipt",
          voidedByMembership: { user: { name: "Manager A" } }
        }
      }
    ]);
    const rows = await createRedemptionHistoryService(db).list({
      ...input,
      status: RedemptionStatus.VOIDED
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-a", branchId: "branch-a", status: RedemptionStatus.VOIDED }
      })
    );
    expect(rows[0]).toMatchObject({
      customerPhone: "••• ••• 1234",
      status: RedemptionStatus.VOIDED,
      voidReason: "Wrong receipt",
      voidedByName: "Manager A"
    });
    expect(JSON.stringify(rows)).not.toContain("416");
    expect(maskPhone("123")).toBe("•••");
  });
});
