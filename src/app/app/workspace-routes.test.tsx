import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  branchPermission: vi.fn(),
  organizationPermission: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/server/auth/session", () => ({ getCurrentEmployeeSession: mocks.session }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/authorization/guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/authorization/guard")>()),
  createPrismaAuthorizationGuard: () => ({
    requireBranchPermission: mocks.branchPermission,
    requireOrganizationPermission: mocks.organizationPermission
  })
}));

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import ManagerAreaPage from "./[organizationId]/[branchId]/manager/page";
import OwnerAreaPage from "./[organizationId]/[branchId]/owner/page";

const params = Promise.resolve({ organizationId: "org-a", branchId: "branch-a" });

describe("protected workspace routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "employee-a" } });
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
