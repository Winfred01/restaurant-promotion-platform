import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permission: vi.fn(),
  findFirst: vi.fn(),
  voidRedemption: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ getCurrentEmployeeSession: mocks.session }));
vi.mock("@/server/authorization/guard", () => ({
  createPrismaAuthorizationGuard: () => ({ requireBranchPermission: mocks.permission })
}));
vi.mock("@/server/db", () => ({ prisma: { redemption: { findFirst: mocks.findFirst } } }));
vi.mock("@/server/redemptions/void", () => ({
  createRedemptionVoidService: () => ({ voidRedemption: mocks.voidRedemption }),
  RedemptionVoidConflictError: class extends Error {},
  RedemptionVoidUnavailableError: class extends Error {}
}));

import { Permission } from "@/server/authorization/permissions";
import { voidRedemptionAction } from "./actions";

const context = { organizationId: "org-a", branchId: "branch-a", redemptionId: "red-a" };
const initial = { error: null, success: null };
function form(confirm = "void", reason = "Wrong receipt") {
  const data = new FormData();
  data.set("confirm", confirm);
  data.set("reason", reason);
  return data;
}

describe("void redemption action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "manager-a" } });
    mocks.permission.mockResolvedValue({ role: "MANAGER" });
    mocks.findFirst.mockResolvedValue({ id: "red-a" });
  });

  it("refuses an unauthenticated or unauthorized actor before mutation", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await voidRedemptionAction(context, initial, form())).error).toMatch(/Sign in/);
    mocks.session.mockResolvedValue({ user: { id: "staff-a" } });
    mocks.permission.mockRejectedValue(new Error("denied"));
    expect((await voidRedemptionAction(context, initial, form())).error).toMatch(/cannot void/);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.voidRedemption).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation and selected-branch membership of the redemption", async () => {
    expect((await voidRedemptionAction(context, initial, form("", "Wrong receipt"))).error).toMatch(
      /Confirm/
    );
    expect(mocks.findFirst).not.toHaveBeenCalled();
    mocks.findFirst.mockResolvedValue(null);
    expect((await voidRedemptionAction(context, initial, form())).error).toMatch(/unavailable/);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "red-a", organizationId: "org-a", branchId: "branch-a" },
      select: { id: true }
    });
    expect(mocks.voidRedemption).not.toHaveBeenCalled();
  });

  it("calls the audited void service with session actor and refreshes affected views", async () => {
    const result = await voidRedemptionAction(context, initial, form());
    expect(result.success).toMatch(/history is preserved/);
    expect(mocks.permission).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      userId: "manager-a",
      permission: Permission.REDEMPTION_VOID
    });
    expect(mocks.voidRedemption).toHaveBeenCalledWith({
      organizationId: "org-a",
      redemptionId: "red-a",
      actorUserId: "manager-a",
      reason: "Wrong receipt"
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });
});
