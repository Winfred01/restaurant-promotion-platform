import { randomUUID } from "node:crypto";

import {
  type AcquisitionChannelStatus,
  MembershipRole,
  type Branch,
  type BranchStatus,
  type MembershipStatus,
  type PrismaClient,
  type RestaurantOrganization,
  type RestaurantOrganizationStatus,
  type User,
  type UserStatus
} from "@prisma/client";

import type {
  BranchAuthorizationInput,
  OrganizationAuthorizationInput
} from "@/server/authorization/guard";
import type { Permission } from "@/server/authorization/permissions";
import {
  createBranchMembership,
  createOrganizationMembership
} from "@/server/memberships/repository";
import { createBranch, createRestaurantOrganization } from "@/server/organizations/repository";
import { normalizePhoneNumber } from "@/server/customers/phone";

type IdReference = {
  id: string;
};

export type TenantFactoryInput = {
  name?: string;
  slug?: string;
  timezone?: string;
  currency?: string;
  status?: RestaurantOrganizationStatus;
};

export type BranchFactoryInput = {
  name?: string;
  timezone?: string;
  status?: BranchStatus;
};

export type UserFactoryInput = {
  emailPrefix?: string;
  name?: string;
  passwordHash?: string;
  status?: UserStatus;
};

export type CustomerFactoryInput = {
  phoneNumber?: string;
  phoneNumberDisplay?: string;
  acquisitionChannelId?: string;
};

export type AcquisitionChannelFactoryInput = {
  name?: string;
  isSystemDefault?: boolean;
  status?: AcquisitionChannelStatus;
  sortOrder?: number;
};

export type TenantScopeFactoryInput = {
  tenant?: TenantFactoryInput;
  branch?: BranchFactoryInput;
  user?: UserFactoryInput;
  organizationRole?: MembershipRole;
  branchRole?: MembershipRole;
  organizationMembershipStatus?: MembershipStatus;
  branchMembershipStatus?: MembershipStatus;
};

export function organizationAuthorizationRequest(input: {
  organization: IdReference;
  user: IdReference;
  permission: Permission;
}): OrganizationAuthorizationInput {
  return {
    organizationId: input.organization.id,
    userId: input.user.id,
    permission: input.permission
  };
}

export function branchAuthorizationRequest(input: {
  organization: IdReference;
  branch: IdReference;
  user: IdReference;
  permission: Permission;
}): BranchAuthorizationInput {
  return {
    ...organizationAuthorizationRequest(input),
    branchId: input.branch.id
  };
}

export function createTenantIsolationHarness(db: PrismaClient) {
  const fixtureNamespace = randomUUID();
  const organizationIds = new Set<string>();
  const userIds = new Set<string>();
  let fixtureSequence = 0;

  function uniqueValue(base: string) {
    fixtureSequence += 1;
    return `${base}-${fixtureNamespace}-${fixtureSequence}`;
  }

  async function createTenant(input: TenantFactoryInput = {}) {
    const organization = await createRestaurantOrganization(db, {
      name: input.name ?? "Test Tenant",
      slug: uniqueValue(input.slug ?? "test-tenant"),
      timezone: input.timezone,
      currency: input.currency,
      status: input.status
    });
    organizationIds.add(organization.id);
    return organization;
  }

  async function createTenantBranch(
    organization: Pick<RestaurantOrganization, "id">,
    input: BranchFactoryInput = {}
  ) {
    return createBranch(db, {
      organizationId: organization.id,
      name: input.name ?? uniqueValue("Test Branch"),
      timezone: input.timezone,
      status: input.status
    });
  }

  async function createTenantUser(input: UserFactoryInput = {}) {
    const email = `${uniqueValue(input.emailPrefix ?? "test-user")}@example.com`;
    const user = await db.user.create({
      data: {
        email,
        name: input.name ?? email,
        passwordHash: input.passwordHash ?? "test-password-hash",
        status: input.status
      }
    });
    userIds.add(user.id);
    return user;
  }

  async function createTenantCustomer(
    organization: Pick<RestaurantOrganization, "id">,
    input: CustomerFactoryInput = {}
  ) {
    fixtureSequence += 1;
    const phoneNumberRaw = input.phoneNumber ?? `416${String(fixtureSequence).padStart(7, "0")}`;

    return db.customer.create({
      data: {
        organizationId: organization.id,
        acquisitionChannelId: input.acquisitionChannelId,
        phoneNumberRaw,
        phoneNumberNormalized: normalizePhoneNumber(phoneNumberRaw),
        phoneNumberDisplay: input.phoneNumberDisplay ?? phoneNumberRaw
      }
    });
  }

  async function createTenantAcquisitionChannel(
    organization: Pick<RestaurantOrganization, "id">,
    input: AcquisitionChannelFactoryInput = {}
  ) {
    return db.acquisitionChannel.create({
      data: {
        organizationId: organization.id,
        name: input.name ?? uniqueValue("Test Channel"),
        isSystemDefault: input.isSystemDefault,
        status: input.status,
        sortOrder: input.sortOrder
      }
    });
  }

  async function createTenantOrganizationMembership(input: {
    organization: Pick<RestaurantOrganization, "id">;
    user: Pick<User, "id">;
    role?: MembershipRole;
    status?: MembershipStatus;
  }) {
    return createOrganizationMembership(db, {
      organizationId: input.organization.id,
      userId: input.user.id,
      role: input.role ?? MembershipRole.STAFF,
      status: input.status
    });
  }

  async function createTenantBranchMembership(input: {
    organization: Pick<RestaurantOrganization, "id">;
    branch: Pick<Branch, "id">;
    user: Pick<User, "id">;
    role?: MembershipRole;
    status?: MembershipStatus;
  }) {
    return createBranchMembership(db, {
      organizationId: input.organization.id,
      branchId: input.branch.id,
      userId: input.user.id,
      role: input.role ?? MembershipRole.STAFF,
      status: input.status
    });
  }

  async function createTenantScope(input: TenantScopeFactoryInput = {}) {
    const organization = await createTenant(input.tenant);
    const branch = await createTenantBranch(organization, input.branch);
    const user = await createTenantUser(input.user);
    const organizationMembership = await createTenantOrganizationMembership({
      organization,
      user,
      role: input.organizationRole,
      status: input.organizationMembershipStatus
    });
    const branchMembership = await createTenantBranchMembership({
      organization,
      branch,
      user,
      role: input.branchRole ?? input.organizationRole,
      status: input.branchMembershipStatus
    });

    return {
      organization,
      branch,
      user,
      organizationMembership,
      branchMembership,
      organizationRequest: (permission: Permission) =>
        organizationAuthorizationRequest({ organization, user, permission }),
      branchRequest: (permission: Permission) =>
        branchAuthorizationRequest({ organization, branch, user, permission })
    };
  }

  async function cleanup() {
    const trackedOrganizationIds = [...organizationIds];
    const trackedUserIds = [...userIds];

    if (trackedOrganizationIds.length > 0) {
      await db.customer.deleteMany({
        where: { organizationId: { in: trackedOrganizationIds } }
      });
      await db.acquisitionChannel.deleteMany({
        where: { organizationId: { in: trackedOrganizationIds } }
      });
      await db.branchMembership.deleteMany({
        where: { organizationId: { in: trackedOrganizationIds } }
      });
      await db.organizationMembership.deleteMany({
        where: { organizationId: { in: trackedOrganizationIds } }
      });
      await db.branch.deleteMany({
        where: { organizationId: { in: trackedOrganizationIds } }
      });
    }

    if (trackedUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: trackedUserIds } }
      });
    }

    if (trackedOrganizationIds.length > 0) {
      await db.restaurantOrganization.deleteMany({
        where: { id: { in: trackedOrganizationIds } }
      });
    }

    organizationIds.clear();
    userIds.clear();
  }

  return {
    createTenant,
    createBranch: createTenantBranch,
    createUser: createTenantUser,
    createCustomer: createTenantCustomer,
    createAcquisitionChannel: createTenantAcquisitionChannel,
    createOrganizationMembership: createTenantOrganizationMembership,
    createBranchMembership: createTenantBranchMembership,
    createTenantScope,
    cleanup
  };
}
