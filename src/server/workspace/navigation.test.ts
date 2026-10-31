import { MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { workspaceLinks } from "./navigation";

describe("workspace navigation", () => {
  const base = "/app/org-1/branch-1";

  it("limits Staff to safe workflow links", () => {
    expect(workspaceLinks(base, MembershipRole.STAFF)).toEqual([
      { label: "Overview", href: base },
      { label: "Staff checkout", href: `${base}/checkout` }
    ]);
  });

  it("adds only Manager tools for a Manager", () => {
    expect(workspaceLinks(base, MembershipRole.MANAGER).map((link) => link.label)).toEqual([
      "Overview",
      "Staff checkout",
      "Branch dashboard",
      "Promotions",
      "Redemption history"
    ]);
  });

  it("shows all areas to an Owner", () => {
    expect(workspaceLinks(base, MembershipRole.OWNER).map((link) => link.label)).toEqual([
      "Overview",
      "Staff checkout",
      "Branch dashboard",
      "Promotions",
      "Redemption history",
      "Organization dashboard"
    ]);
  });
});
