import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  authorize: vi.fn(),
  branches: vi.fn(),
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
vi.mock("@/server/db", () => ({ prisma: { branch: { findMany: mocks.branches } } }));
vi.mock("./actions", () => ({ saveBranch: vi.fn(), archiveBranch: vi.fn() }));

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import BranchManagementPage from "./page";

const params = Promise.resolve({ organizationId: "org-a", branchId: "branch-a" });

describe("branch directory page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "employee-a" } });
    mocks.authorize.mockResolvedValue({ role: "MANAGER" });
    mocks.branches.mockResolvedValue([]);
  });

  it("redirects before tenant reads without a session", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(BranchManagementPage({ params })).rejects.toThrow("REDIRECT:/login");
    expect(mocks.branches).not.toHaveBeenCalled();
  });

  it("denies Staff before listing branches", async () => {
    mocks.authorize.mockRejectedValue(new AuthorizationDeniedError());
    await expect(BranchManagementPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(mocks.branches).not.toHaveBeenCalled();
  });

  it("shows only assigned branches and no write controls to a Manager", async () => {
    mocks.branches.mockResolvedValue([
      {
        id: "branch-a",
        name: "Downtown",
        timezone: "America/Toronto",
        status: "ACTIVE",
        branchMemberships: []
      }
    ]);
    const html = renderToStaticMarkup(await BranchManagementPage({ params }));
    expect(html).toContain("Downtown");
    expect(html).toContain("Open workspace");
    expect(html).not.toContain("Create a branch");
    expect(html).not.toContain("Archive branch");
    expect(mocks.authorize).toHaveBeenCalledWith({
      organizationId: "org-a",
      branchId: "branch-a",
      userId: "employee-a",
      permission: Permission.BRANCH_ANALYTICS_VIEW
    });
    expect(mocks.branches).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-a",
          branchMemberships: expect.any(Object)
        })
      })
    );
  });

  it("shows organization branches, archived status and staff assignment to an Owner", async () => {
    mocks.authorize.mockResolvedValue({ role: "OWNER" });
    mocks.branches.mockResolvedValue([
      {
        id: "branch-b",
        name: "Riverside",
        timezone: "America/Toronto",
        status: "ARCHIVED",
        branchMemberships: [{ role: "STAFF", organizationMembership: { user: { name: "Alex" } } }]
      }
    ]);
    const html = renderToStaticMarkup(await BranchManagementPage({ params }));
    expect(html).toContain("Create a branch");
    expect(html).toContain("Riverside");
    expect(html).toContain("ARCHIVED");
    expect(html).toContain("Alex");
    expect(html).not.toContain("Open workspace");
    expect(html).not.toContain("Archive branch");
    expect(mocks.branches).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-a" } })
    );
  });
});
