import type {
  BranchStatus,
  Prisma,
  PrismaClient,
  RestaurantOrganizationStatus
} from "@prisma/client";

type OrganizationPersistence = PrismaClient | Prisma.TransactionClient;

export type CreateRestaurantOrganizationInput = {
  name: string;
  slug: string;
  timezone?: string;
  currency?: string;
  status?: RestaurantOrganizationStatus;
};

export type CreateBranchInput = {
  organizationId: string;
  name: string;
  timezone?: string;
  status?: BranchStatus;
};

export type OrganizationBranchLookup = {
  organizationId: string;
  branchId: string;
};

export async function createRestaurantOrganization(
  db: OrganizationPersistence,
  input: CreateRestaurantOrganizationInput
) {
  return db.restaurantOrganization.create({
    data: {
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
      currency: input.currency,
      status: input.status
    }
  });
}

export async function createBranch(db: OrganizationPersistence, input: CreateBranchInput) {
  return db.branch.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      timezone: input.timezone,
      status: input.status
    }
  });
}

export async function getBranchForOrganization(
  db: OrganizationPersistence,
  input: OrganizationBranchLookup
) {
  return db.branch.findFirst({
    where: {
      id: input.branchId,
      organizationId: input.organizationId
    }
  });
}

export async function listBranchesForOrganization(
  db: OrganizationPersistence,
  input: {
    organizationId: string;
    status?: BranchStatus;
  }
) {
  return db.branch.findMany({
    where: {
      organizationId: input.organizationId,
      status: input.status
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function archiveBranchForOrganization(
  db: OrganizationPersistence,
  input: OrganizationBranchLookup
) {
  return db.branch.updateMany({
    where: {
      id: input.branchId,
      organizationId: input.organizationId
    },
    data: {
      status: "ARCHIVED"
    }
  });
}
