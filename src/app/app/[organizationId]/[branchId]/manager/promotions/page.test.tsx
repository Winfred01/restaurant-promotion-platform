import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  authorize: vi.fn(),
  branches: vi.fn(),
  promotions: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/server/auth/session", () => ({ getCurrentEmployeeSession: mocks.session }));
vi.mock("@/server/authorization/guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/authorization/guard")>()),
  createPrismaAuthorizationGuard: () => ({ requireBranchPermission: mocks.authorize })
}));
vi.mock("@/server/db", () => ({
  prisma: { branch: { findMany: mocks.branches }, promotion: { findMany: mocks.promotions } }
}));
vi.mock("./actions", () => ({ savePromotion: vi.fn(), changePromotionStatus: vi.fn() }));

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import PromotionManagementPage from "./page";

const params = Promise.resolve({ organizationId: "org-a", branchId: "branch-a" });

describe("promotion management page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "employee-a" } });
    mocks.authorize.mockResolvedValue({ role: "MANAGER" });
    mocks.branches.mockResolvedValue([{ id: "branch-a", name: "Downtown" }]);
    mocks.promotions.mockResolvedValue([]);
  });

  it("redirects unauthenticated users before tenant reads", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(PromotionManagementPage({ params })).rejects.toThrow("REDIRECT:/login");
    expect(mocks.promotions).not.toHaveBeenCalled();
  });

  it("denies Staff without querying promotions", async () => {
    mocks.authorize.mockRejectedValue(new AuthorizationDeniedError());
    await expect(PromotionManagementPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(mocks.promotions).not.toHaveBeenCalled();
  });

  it("shows a branch-scoped create flow for Managers", async () => {
    const html = renderToStaticMarkup(await PromotionManagementPage({ params }));
    expect(html).toContain("Create promotion");
    expect(html).toContain("No promotions are available");
    expect(html).not.toContain("All branches");
    expect(mocks.promotions).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-a" }) })
    );
    expect(mocks.branches).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-a", id: "branch-a" })
      })
    );
  });

  it("shows an organization-wide offer read-only to a branch Manager", async () => {
    mocks.promotions.mockResolvedValue([
      {
        id: "promotion-a",
        name: "Restaurant-wide offer",
        description: null,
        status: "ACTIVE",
        rewardType: "FIXED_AMOUNT",
        discountCents: 500,
        discountPercent: null,
        maxDiscountCents: null,
        minimumSpendCents: null,
        validFrom: null,
        validUntil: null,
        appliesToAllBranches: true,
        branches: []
      }
    ]);
    const html = renderToStaticMarkup(await PromotionManagementPage({ params }));
    expect(html).toContain("Restaurant-wide offer");
    expect(html).toContain("An Owner can manage");
    expect(html).not.toContain("Pause</button>");
  });
});
