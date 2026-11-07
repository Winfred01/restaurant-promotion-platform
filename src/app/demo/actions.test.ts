import { MembershipRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  enabled: vi.fn(),
  signIn: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  })
}));

vi.mock("@/auth", () => ({ signIn: mocks.signIn }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/demo/entry", () => ({
  claimDemoTenant: mocks.claim,
  isGuidedDemoEnabled: mocks.enabled,
  parseDemoRole: (value: unknown) =>
    value === MembershipRole.OWNER ||
    value === MembershipRole.MANAGER ||
    value === MembershipRole.STAFF
      ? value
      : null
}));

import { enterGuidedDemo } from "./actions";

function roleForm(role: string) {
  const data = new FormData();
  data.set("role", role);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.claim.mockResolvedValue("one-time-ticket");
  mocks.signIn.mockResolvedValue("/app");
});

describe("guided demo server action", () => {
  it.each([MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF])(
    "opens an authorized sign-in for %s",
    async (role) => {
      await expect(enterGuidedDemo(roleForm(role))).rejects.toThrow("redirect:/app");
      expect(mocks.claim).toHaveBeenCalledWith(expect.anything(), role);
      expect(mocks.signIn).toHaveBeenCalledWith("guided-demo", {
        ticket: "one-time-ticket",
        redirect: false,
        redirectTo: "/app"
      });
    }
  );

  it("blocks disabled, invalid-role, and exhausted entries before sign-in", async () => {
    mocks.enabled.mockReturnValue(false);
    await expect(enterGuidedDemo(roleForm("OWNER"))).rejects.toThrow(
      "redirect:/demo?error=disabled"
    );
    expect(mocks.claim).not.toHaveBeenCalled();

    mocks.enabled.mockReturnValue(true);
    await expect(enterGuidedDemo(roleForm("ADMIN"))).rejects.toThrow("redirect:/demo?error=role");
    expect(mocks.claim).not.toHaveBeenCalled();

    mocks.claim.mockResolvedValue(null);
    await expect(enterGuidedDemo(roleForm("STAFF"))).rejects.toThrow("redirect:/demo?error=full");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("shows a safe error if the one-time ticket cannot establish a session", async () => {
    mocks.signIn.mockResolvedValue("/api/auth/error?error=CredentialsSignin");
    await expect(enterGuidedDemo(roleForm("STAFF"))).rejects.toThrow(
      "redirect:/demo?error=unavailable"
    );
  });
});
