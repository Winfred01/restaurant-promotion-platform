import { MembershipRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { selectAccessibleBranches, type WorkspaceMembership } from "./access";

const membership: WorkspaceMembership = {
  role: MembershipRole.STAFF,
  organization: {
    id: "org-a",
    name: "Restaurant A",
    branches: [
      { id: "branch-a", name: "Downtown" },
      { id: "branch-b", name: "Uptown" }
    ]
  },
  branchMemberships: [{ branchId: "branch-a" }]
};

describe("workspace branch selection", () => {
  it("shows Staff and Manager only their active branch memberships", () => {
    for (const role of [MembershipRole.STAFF, MembershipRole.MANAGER]) {
      expect(selectAccessibleBranches([{ ...membership, role }])).toEqual([
        {
          organizationId: "org-a",
          organizationName: "Restaurant A",
          branchId: "branch-a",
          branchName: "Downtown"
        }
      ]);
    }
  });

  it("lets an Owner select every active branch returned for their organization", () => {
    expect(selectAccessibleBranches([{ ...membership, role: MembershipRole.OWNER }])).toHaveLength(
      2
    );
  });

  it("never uses a branch membership from another organization", () => {
    expect(
      selectAccessibleBranches([
        membership,
        {
          role: MembershipRole.STAFF,
          organization: {
            id: "org-b",
            name: "Restaurant B",
            branches: [{ id: "branch-c", name: "West" }]
          },
          branchMemberships: []
        }
      ])
    ).toHaveLength(1);
  });
});
