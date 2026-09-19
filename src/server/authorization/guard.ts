import { MembershipRole, type Prisma, type PrismaClient } from "@prisma/client";

import {
  getActiveBranchMembership,
  getActiveOrganizationMembership,
  type BranchMembershipIdentity,
  type OrganizationMembershipIdentity
} from "@/server/memberships/repository";
import { hasPermission, type Permission, requiresBranchScope } from "./permissions";

type AuthorizationPersistence = PrismaClient | Prisma.TransactionClient;

type ActiveRole = {
  role: MembershipRole;
};

type ActiveBranch = {
  id: string;
};

export type AuthorizationLookup = {
  findActiveOrganizationMembership: (
    input: OrganizationMembershipIdentity
  ) => Promise<ActiveRole | null>;
  findActiveBranchMembership: (input: BranchMembershipIdentity) => Promise<ActiveRole | null>;
  findActiveBranch: (input: {
    organizationId: string;
    branchId: string;
  }) => Promise<ActiveBranch | null>;
};

export type OrganizationAuthorizationInput = OrganizationMembershipIdentity & {
  permission: Permission;
};

export type BranchAuthorizationInput = BranchMembershipIdentity & {
  permission: Permission;
};

export type OrganizationAuthorizationContext = OrganizationMembershipIdentity & {
  role: MembershipRole;
};

export type BranchAuthorizationContext = OrganizationAuthorizationContext & {
  branchId: string;
};

export class AuthorizationDeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED";

  constructor() {
    super("You are not authorized to perform this action.");
    this.name = "AuthorizationDeniedError";
  }
}

const roleRank: Readonly<Record<MembershipRole, number>> = {
  [MembershipRole.STAFF]: 0,
  [MembershipRole.MANAGER]: 1,
  [MembershipRole.OWNER]: 2
};

function leastPrivilegedRole(first: MembershipRole, second: MembershipRole) {
  return roleRank[first] <= roleRank[second] ? first : second;
}

function deny(): never {
  throw new AuthorizationDeniedError();
}

export function createAuthorizationGuard(lookup: AuthorizationLookup) {
  async function requireOrganizationPermission(
    input: OrganizationAuthorizationInput
  ): Promise<OrganizationAuthorizationContext> {
    const membership = await lookup.findActiveOrganizationMembership(input);

    if (!membership || !hasPermission(membership.role, input.permission)) {
      return deny();
    }

    if (membership.role !== MembershipRole.OWNER && requiresBranchScope(input.permission)) {
      return deny();
    }

    return {
      organizationId: input.organizationId,
      userId: input.userId,
      role: membership.role
    };
  }

  async function requireBranchPermission(
    input: BranchAuthorizationInput
  ): Promise<BranchAuthorizationContext> {
    if (!requiresBranchScope(input.permission)) {
      return deny();
    }

    const organizationMembership = await lookup.findActiveOrganizationMembership(input);

    if (!organizationMembership) {
      return deny();
    }

    const branch = await lookup.findActiveBranch({
      organizationId: input.organizationId,
      branchId: input.branchId
    });

    if (!branch) {
      return deny();
    }

    if (organizationMembership.role === MembershipRole.OWNER) {
      if (!hasPermission(MembershipRole.OWNER, input.permission)) {
        return deny();
      }

      return {
        organizationId: input.organizationId,
        branchId: input.branchId,
        userId: input.userId,
        role: MembershipRole.OWNER
      };
    }

    const branchMembership = await lookup.findActiveBranchMembership(input);

    if (!branchMembership) {
      return deny();
    }

    const effectiveRole = leastPrivilegedRole(organizationMembership.role, branchMembership.role);

    if (!hasPermission(effectiveRole, input.permission)) {
      return deny();
    }

    return {
      organizationId: input.organizationId,
      branchId: input.branchId,
      userId: input.userId,
      role: effectiveRole
    };
  }

  return {
    requireOrganizationPermission,
    requireBranchPermission
  };
}

export function createPrismaAuthorizationGuard(db: AuthorizationPersistence) {
  return createAuthorizationGuard({
    findActiveOrganizationMembership: (input) => getActiveOrganizationMembership(db, input),
    findActiveBranchMembership: (input) => getActiveBranchMembership(db, input),
    findActiveBranch: (input) =>
      db.branch.findFirst({
        where: {
          id: input.branchId,
          organizationId: input.organizationId,
          status: "ACTIVE"
        },
        select: {
          id: true
        }
      })
  });
}
