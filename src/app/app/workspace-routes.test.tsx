import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  branchPermission: vi.fn(),
  organizationPermission: vi.fn(),
  branchLookup: vi.fn(),
  currencyLookup: vi.fn(),
  promotionReport: vi.fn(),
  acquisitionReport: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getCurrentEmployeeSession: mocks.session }));
vi.mock("@/server/db", () => ({
  prisma: {
    branch: { findFirst: mocks.branchLookup },
    restaurantOrganization: { findUnique: mocks.currencyLookup }
  }
}));
vi.mock("@/server/analytics/promotion", () => ({
  createPromotionAnalyticsService: () => ({ report: mocks.promotionReport })
}));
vi.mock("@/server/analytics/acquisition", () => ({
  createAcquisitionAnalyticsService: () => ({ report: mocks.acquisitionReport })
}));
vi.mock("@/server/authorization/guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/authorization/guard")>()),
  createPrismaAuthorizationGuard: () => ({
    requireBranchPermission: mocks.branchPermission,
    requireOrganizationPermission: mocks.organizationPermission
  })
}));

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import BranchLayout from "./[organizationId]/[branchId]/layout";
import ManagerAreaPage from "./[organizationId]/[branchId]/manager/page";
import OwnerAreaPage from "./[organizationId]/[branchId]/owner/page";

const params = Promise.resolve({ organizationId: "org-a", branchId: "branch-a" });

describe("protected workspace routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "employee-a", name: "Employee A" } });
    mocks.branchLookup.mockResolvedValue({
      name: "Downtown",
      organization: { name: "Restaurant A" }
    });
    mocks.currencyLookup.mockResolvedValue({ currency: "CAD" });
    mocks.promotionReport.mockResolvedValue({
      promotions: [
        {
          promotionId: "promo-a",
          promotionName: "Lunch offer",
          promotionStatus: "ACTIVE",
          redemptionCount: 2,
          netBillCents: 4300,
          totalDiscountCents: 700
        }
      ]
    });
    mocks.acquisitionReport.mockResolvedValue({
      channels: [
        {
          acquisitionChannelId: "channel-a",
          acquisitionChannelName: "Referral",
          newCustomers: 3,
          observedReturningCustomers: 1
        }
      ]
    });
  });

  it("redirects an unauthenticated employee before loading a branch", async () => {
    mocks.session.mockResolvedValue(null);

    await expect(BranchLayout({ params, children: <p>Protected</p> })).rejects.toThrow(
      "REDIRECT:/login"
    );
    expect(mocks.branchPermission).not.toHaveBeenCalled();
    expect(mocks.branchLookup).not.toHaveBeenCalled();
  });

  it("denies a branch outside the employee's authorized scope", async () => {
    mocks.branchPermission.mockRejectedValue(new AuthorizationDeniedError());

    await expect(BranchLayout({ params, children: <p>Protected</p> })).rejects.toThrow("NOT_FOUND");
    expect(mocks.branchLookup).not.toHaveBeenCalled();
  });

  it("shows branch context and only Staff-safe links for a Staff role", async () => {
    mocks.branchPermission.mockResolvedValue({ role: "STAFF" });

    const html = renderToStaticMarkup(await BranchLayout({ params, children: <p>Protected</p> }));
    expect(html).toContain("Restaurant A");
    expect(html).toContain("Downtown");
    expect(html).toContain("Protected");
    expect(html).toContain("Overview");
    expect(html).not.toContain("Branch dashboard");
    expect(html).not.toContain("Organization dashboard");
    expect(mocks.branchPermission).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      userId: "employee-a",
      permission: Permission.CUSTOMER_LOOKUP
    });
  });

  it("redirects unauthenticated employees before checking either restricted route", async () => {
    mocks.session.mockResolvedValue(null);

    await expect(ManagerAreaPage({ params })).rejects.toThrow("REDIRECT:/login");
    await expect(OwnerAreaPage({ params })).rejects.toThrow("REDIRECT:/login");
    expect(mocks.branchPermission).not.toHaveBeenCalled();
    expect(mocks.organizationPermission).not.toHaveBeenCalled();
    expect(mocks.promotionReport).not.toHaveBeenCalled();
    expect(mocks.acquisitionReport).not.toHaveBeenCalled();
  });

  it("denies a role without Manager permission", async () => {
    mocks.branchPermission.mockRejectedValue(new AuthorizationDeniedError());

    await expect(ManagerAreaPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(mocks.branchPermission).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      userId: "employee-a",
      permission: Permission.BRANCH_ANALYTICS_VIEW
    });
    expect(mocks.promotionReport).not.toHaveBeenCalled();
  });

  it("denies a role without Owner permission", async () => {
    mocks.organizationPermission.mockRejectedValue(new AuthorizationDeniedError());

    await expect(OwnerAreaPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(mocks.organizationPermission).toHaveBeenCalledWith({
      organizationId: "org-a",
      userId: "employee-a",
      permission: Permission.ORGANIZATION_ANALYTICS_VIEW
    });
    expect(mocks.promotionReport).not.toHaveBeenCalled();
    expect(mocks.acquisitionReport).not.toHaveBeenCalled();
  });

  it("renders branch-scoped promotion metrics without Owner acquisition data", async () => {
    mocks.branchPermission.mockResolvedValue({ role: "MANAGER" });

    const html = renderToStaticMarkup(await ManagerAreaPage({ params }));
    expect(html).toContain("Branch dashboard");
    expect(html).toContain("Promotion-linked sales");
    expect(html).toContain("$43.00");
    expect(html).not.toContain("Referral");
    expect(mocks.promotionReport).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      actorUserId: "employee-a"
    });
    expect(mocks.acquisitionReport).not.toHaveBeenCalled();
  });

  it("renders organization metrics and original-channel counts for an Owner", async () => {
    mocks.organizationPermission.mockResolvedValue({ role: "OWNER" });

    const html = renderToStaticMarkup(await OwnerAreaPage({ params }));
    expect(html).toContain("Organization dashboard");
    expect(html).toContain("$43.00");
    expect(html).toContain("Referral");
    expect(html).toContain("3 customers");
    expect(mocks.promotionReport).toHaveBeenCalledWith({
      organizationId: "org-a",
      actorUserId: "employee-a"
    });
    expect(mocks.acquisitionReport).toHaveBeenCalledWith({
      organizationId: "org-a",
      actorUserId: "employee-a"
    });
  });

  it("shows truthful empty states before demo data exists", async () => {
    mocks.branchPermission.mockResolvedValue({ role: "MANAGER" });
    mocks.organizationPermission.mockResolvedValue({ role: "OWNER" });
    mocks.promotionReport.mockResolvedValue({ promotions: [] });
    mocks.acquisitionReport.mockResolvedValue({ channels: [] });

    expect(renderToStaticMarkup(await ManagerAreaPage({ params }))).toContain("No promotions yet");
    expect(renderToStaticMarkup(await OwnerAreaPage({ params }))).toContain(
      "No customers have been recorded yet"
    );
  });
});
