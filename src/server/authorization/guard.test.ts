import { MembershipRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationDeniedError,
  type AuthorizationLookup,
  createAuthorizationGuard
} from "./guard";
import { Permission } from "./permissions";

function createLookup(overrides: Partial<AuthorizationLookup> = {}): AuthorizationLookup {
  return {
    findActiveOrganizationMembership: vi.fn(async () => ({
      role: MembershipRole.STAFF
    })),
    findActiveBranchMembership: vi.fn(async () => ({
      role: MembershipRole.STAFF
    })),
    findActiveBranch: vi.fn(async ({ branchId }) => ({ id: branchId })),
    ...overrides
  };
}

const organizationInput = {
  organizationId: "organization-a",
  userId: "user-1"
};

const branchInput = {
  ...organizationInput,
  branchId: "branch-a"
};

describe("authorization guards", () => {
  it("allows active Owners to use organization-wide capabilities", async () => {
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => ({
          role: MembershipRole.OWNER
        }))
      })
    );

    await expect(
      guard.requireOrganizationPermission({
        ...organizationInput,
        permission: Permission.MEMBERSHIP_MANAGE
      })
    ).resolves.toEqual({
      ...organizationInput,
      role: MembershipRole.OWNER
    });
  });

  it("requires non-Owner branch work to use a branch-scoped guard", async () => {
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => ({
          role: MembershipRole.MANAGER
        }))
      })
    );

    await expect(
      guard.requireOrganizationPermission({
        ...organizationInput,
        permission: Permission.PROMOTION_MANAGE
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("requires an active organization membership", async () => {
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => null)
      })
    );

    await expect(
      guard.requireBranchPermission({
        ...branchInput,
        permission: Permission.CUSTOMER_LOOKUP
      })
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies a branch outside the requested tenant even for an Owner", async () => {
    const findActiveBranch = vi.fn(async () => null);
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => ({
          role: MembershipRole.OWNER
        })),
        findActiveBranch
      })
    );

    await expect(
      guard.requireBranchPermission({
        ...branchInput,
        permission: Permission.CUSTOMER_LOOKUP
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);

    expect(findActiveBranch).toHaveBeenCalledWith({
      organizationId: "organization-a",
      branchId: "branch-a"
    });
  });

  it("allows an Owner to use an active branch without a branch membership", async () => {
    const findActiveBranchMembership = vi.fn(async () => null);
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => ({
          role: MembershipRole.OWNER
        })),
        findActiveBranchMembership
      })
    );

    await expect(
      guard.requireBranchPermission({
        ...branchInput,
        permission: Permission.REDEMPTION_VOID
      })
    ).resolves.toEqual({
      ...branchInput,
      role: MembershipRole.OWNER
    });

    expect(findActiveBranchMembership).not.toHaveBeenCalled();
  });

  it("requires active branch membership for Managers and Staff", async () => {
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => ({
          role: MembershipRole.MANAGER
        })),
        findActiveBranchMembership: vi.fn(async () => null)
      })
    );

    await expect(
      guard.requireBranchPermission({
        ...branchInput,
        permission: Permission.PROMOTION_MANAGE
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("uses the least privileged active role across organization and branch", async () => {
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => ({
          role: MembershipRole.MANAGER
        })),
        findActiveBranchMembership: vi.fn(async () => ({
          role: MembershipRole.STAFF
        }))
      })
    );

    await expect(
      guard.requireBranchPermission({
        ...branchInput,
        permission: Permission.CUSTOMER_CREATE
      })
    ).resolves.toMatchObject({ role: MembershipRole.STAFF });

    await expect(
      guard.requireBranchPermission({
        ...branchInput,
        permission: Permission.PROMOTION_MANAGE
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("does not let a branch role elevate the organization role", async () => {
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => ({
          role: MembershipRole.STAFF
        })),
        findActiveBranchMembership: vi.fn(async () => ({
          role: MembershipRole.MANAGER
        }))
      })
    );

    await expect(
      guard.requireBranchPermission({
        ...branchInput,
        permission: Permission.REDEMPTION_VOID
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("rejects organization-only capabilities at branch scope", async () => {
    const guard = createAuthorizationGuard(
      createLookup({
        findActiveOrganizationMembership: vi.fn(async () => ({
          role: MembershipRole.OWNER
        }))
      })
    );

    await expect(
      guard.requireBranchPermission({
        ...branchInput,
        permission: Permission.SETTINGS_MANAGE
      })
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });
});
