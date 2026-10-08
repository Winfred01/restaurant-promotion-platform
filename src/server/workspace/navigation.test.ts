import { MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { workspaceLinks } from "./navigation";

describe("workspace navigation", () => {
  const base = "/app/org-1/branch-1";

  it("limits Staff to the safe overview", () => {
    expect(workspaceLinks(base, MembershipRole.STAFF)).toEqual([{ label: "Overview", href: base }]);
  });

  it("adds only Manager tools for a Manager", () => {
    expect(workspaceLinks(base, MembershipRole.MANAGER).map((link) => link.label)).toEqual([
      "Overview",
      "Manager area"
    ]);
  });

  it("shows all areas to an Owner", () => {
    expect(workspaceLinks(base, MembershipRole.OWNER).map((link) => link.label)).toEqual([
      "Overview",
      "Manager area",
      "Owner area"
    ]);
  });
});
