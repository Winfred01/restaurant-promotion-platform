import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  branchPermission: vi.fn(),
  organizationPermission: vi.fn(),
  branchLookup: vi.fn(),
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
vi.mock("@/server/db", () => ({ prisma: { branch: { findFirst: mocks.branchLookup } } }));
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
    expect(html).not.toContain("Manager area");
    expect(html).not.toContain("Owner area");
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
  });

  it("denies a role without Manager permission", async () => {
    mocks.branchPermission.mockRejectedValue(new AuthorizationDeniedError());

    await expect(ManagerAreaPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(mocks.branchPermission).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      userId: "employee-a",
      permission: Permission.PROMOTION_MANAGE
    });
  });

  it("denies a role without Owner permission", async () => {
    mocks.organizationPermission.mockRejectedValue(new AuthorizationDeniedError());

    await expect(OwnerAreaPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(mocks.organizationPermission).toHaveBeenCalledWith({
      organizationId: "org-a",
      userId: "employee-a",
      permission: Permission.ORGANIZATION_MANAGE
    });
  });

  it("renders the restricted areas after a successful server-side permission check", async () => {
    mocks.branchPermission.mockResolvedValue({ role: "MANAGER" });
    mocks.organizationPermission.mockResolvedValue({ role: "OWNER" });

    expect(renderToStaticMarkup(await ManagerAreaPage({ params }))).toContain("Manager tools");
    expect(renderToStaticMarkup(await OwnerAreaPage({ params }))).toContain("Organization tools");
  });
});
