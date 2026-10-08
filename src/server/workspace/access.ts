import { MembershipRole } from "@prisma/client";

import { prisma } from "@/server/db";

export type AccessibleBranch = {
  organizationId: string;
  organizationName: string;
  branchId: string;
  branchName: string;
};

export type WorkspaceMembership = {
  role: MembershipRole;
  organization: {
    id: string;
    name: string;
    branches: { id: string; name: string }[];
  };
  branchMemberships: { branchId: string }[];
};

export function selectAccessibleBranches(memberships: WorkspaceMembership[]): AccessibleBranch[] {
  return memberships.flatMap((membership) => {
    const permittedIds = new Set(membership.branchMemberships.map((item) => item.branchId));
    return membership.organization.branches
      .filter((branch) => membership.role === MembershipRole.OWNER || permittedIds.has(branch.id))
      .map((branch) => ({
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        branchId: branch.id,
        branchName: branch.name
      }));
  });
}

export async function listAccessibleBranches(userId: string): Promise<AccessibleBranch[]> {
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      organization: { status: "ACTIVE" }
    },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          branches: {
            where: { status: "ACTIVE" },
            select: { id: true, name: true },
            orderBy: { name: "asc" }
          }
        }
      },
      branchMemberships: {
        where: { status: "ACTIVE", branch: { status: "ACTIVE" } },
        select: { branchId: true }
      }
    },
    orderBy: { organization: { name: "asc" } }
  });

  return selectAccessibleBranches(memberships);
}
