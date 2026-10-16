import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  authorize: vi.fn(),
  channels: vi.fn(),
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
vi.mock("@/server/db", () => ({ prisma: { acquisitionChannel: { findMany: mocks.channels } } }));

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import StaffCheckoutPage from "./page";

const params = Promise.resolve({ organizationId: "org-a", branchId: "branch-a" });

describe("Staff checkout page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "employee-a" } });
    mocks.channels.mockResolvedValue([{ id: "channel-a", name: "Walk-in" }]);
  });

  it("redirects unauthenticated employees without loading tenant data", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(StaffCheckoutPage({ params })).rejects.toThrow("REDIRECT:/login");
    expect(mocks.channels).not.toHaveBeenCalled();
  });

  it("denies unauthorized branch access without loading channels", async () => {
    mocks.authorize.mockRejectedValue(new AuthorizationDeniedError());
    await expect(StaffCheckoutPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(mocks.channels).not.toHaveBeenCalled();
  });

  it("renders the workflow with tenant-scoped channels after authorization", async () => {
    const html = renderToStaticMarkup(await StaffCheckoutPage({ params }));
    expect(html).toContain("Find customer");
    expect(html).toContain("Best Deal");
    expect(mocks.channels).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-a", status: "ACTIVE" } })
    );
  });
});
