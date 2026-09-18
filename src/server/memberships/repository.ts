import type { MembershipRole, MembershipStatus, Prisma, PrismaClient } from "@prisma/client";

type MembershipPersistence = PrismaClient | Prisma.TransactionClient;

export type OrganizationMembershipIdentity = {
  organizationId: string;
  userId: string;
};

export type BranchMembershipIdentity = OrganizationMembershipIdentity & {
  branchId: string;
};

export type CreateOrganizationMembershipInput = OrganizationMembershipIdentity & {
  role: MembershipRole;
  status?: MembershipStatus;
};

export type CreateBranchMembershipInput = BranchMembershipIdentity & {
  role: MembershipRole;
  status?: MembershipStatus;
};

export async function createOrganizationMembership(
  db: MembershipPersistence,
  input: CreateOrganizationMembershipInput
) {
  return db.organizationMembership.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
      status: input.status
    }
  });
}

export async function createBranchMembership(
  db: MembershipPersistence,
  input: CreateBranchMembershipInput
) {
  return db.branchMembership.create({
    data: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      userId: input.userId,
      role: input.role,
      status: input.status
    }
  });
}

export async function getActiveOrganizationMembership(
  db: MembershipPersistence,
  input: OrganizationMembershipIdentity
) {
  return db.organizationMembership.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      status: "ACTIVE",
      organization: {
        status: "ACTIVE"
      },
      user: {
        status: "ACTIVE"
      }
    }
  });
}

export async function getActiveBranchMembership(
  db: MembershipPersistence,
  input: BranchMembershipIdentity
) {
  return db.branchMembership.findFirst({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      userId: input.userId,
      status: "ACTIVE",
      branch: {
        status: "ACTIVE"
      },
      organizationMembership: {
        status: "ACTIVE",
        organization: {
          status: "ACTIVE"
        },
        user: {
          status: "ACTIVE"
        }
      }
    }
  });
}

export async function setOrganizationMembershipRole(
  db: MembershipPersistence,
  input: OrganizationMembershipIdentity & { role: MembershipRole }
) {
  return db.organizationMembership.updateMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId
    },
    data: {
      role: input.role
    }
  });
}

export async function setBranchMembershipRole(
  db: MembershipPersistence,
  input: BranchMembershipIdentity & { role: MembershipRole }
) {
  return db.branchMembership.updateMany({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      userId: input.userId
    },
    data: {
      role: input.role
    }
  });
}

export async function setOrganizationMembershipStatus(
  db: MembershipPersistence,
  input: OrganizationMembershipIdentity & { status: MembershipStatus }
) {
  return db.organizationMembership.updateMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId
    },
    data: {
      status: input.status
    }
  });
}

export async function setBranchMembershipStatus(
  db: MembershipPersistence,
  input: BranchMembershipIdentity & { status: MembershipStatus }
) {
  return db.branchMembership.updateMany({
    where: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      userId: input.userId
    },
    data: {
      status: input.status
    }
  });
}
