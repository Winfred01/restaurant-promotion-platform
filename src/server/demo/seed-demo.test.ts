import { MembershipRole, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  demoAccounts,
  seedDemoDatabase,
  validateDemoSeedEnvironment
} from "../../../scripts/seed-demo";
import { verifyPassword } from "@/server/auth/passwords";

const password = "a-long-demo-password-for-testing";
const environment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://localhost:5432/restaurant_promotion_demo",
  DEMO_SEED_DATABASE: "restaurant_promotion_demo",
  DEMO_SEED_CONFIRM: "restaurant-demo",
  DEMO_SEED_PASSWORD: password
};

function createSeedDatabase(existingOrganization = false) {
  const transaction = {
    restaurantOrganization: {
      findUnique: vi.fn(async () => (existingOrganization ? { id: "existing_org" } : null)),
      create: vi.fn(async () => ({ id: "demo_org" }))
    },
    branch: { create: vi.fn(async () => ({ id: "demo_branch" })) },
    user: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string } }) => ({
        id: data.email
      }))
    },
    organizationMembership: {
      create: vi.fn(
        async ({
          data
        }: {
          data: { organizationId: string; userId: string; role: MembershipRole };
        }) => ({ data })
      )
    },
    branchMembership: {
      create: vi.fn(
        async ({
          data
        }: {
          data: { organizationId: string; userId: string; role: MembershipRole };
        }) => ({ data })
      )
    }
  };
  const db = {
    $transaction: async (operation: (tx: typeof transaction) => Promise<void>) =>
      operation(transaction)
  } as unknown as PrismaClient;

  return { db, transaction };
}

describe("demo seed", () => {
  it("requires explicit confirmation, a dedicated demo database, and a runtime password", () => {
    expect(validateDemoSeedEnvironment(environment)).toBe(password);
    expect(() => validateDemoSeedEnvironment({ ...environment, NODE_ENV: "production" })).toThrow();
    expect(() =>
      validateDemoSeedEnvironment({ ...environment, DEMO_SEED_CONFIRM: undefined })
    ).toThrow();
    expect(() =>
      validateDemoSeedEnvironment({ ...environment, DEMO_SEED_DATABASE: "other_db" })
    ).toThrow();
    expect(() =>
      validateDemoSeedEnvironment({ ...environment, DEMO_SEED_PASSWORD: "short" })
    ).toThrow();
  });

  it("creates three distinct employee roles with branch access only for Manager and Staff", async () => {
    const { db, transaction } = createSeedDatabase();

    await seedDemoDatabase(db, password);

    expect(demoAccounts.map((account) => account.role)).toEqual([
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
      MembershipRole.STAFF
    ]);
    expect(transaction.user.create).toHaveBeenCalledTimes(3);
    expect(transaction.organizationMembership.create).toHaveBeenCalledTimes(3);
    expect(transaction.branchMembership.create).toHaveBeenCalledTimes(2);
    expect(
      transaction.organizationMembership.create.mock.calls.map(([input]) => input.data.role)
    ).toEqual([MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]);

    for (const [input] of transaction.user.create.mock.calls) {
      expect(input.data.passwordHash).not.toBe(password);
      await expect(verifyPassword(input.data.passwordHash, password)).resolves.toBe(true);
    }
  });

  it("does not change an existing demo organization", async () => {
    const { db, transaction } = createSeedDatabase(true);

    await expect(seedDemoDatabase(db, password)).rejects.toThrow("already exists");
    expect(transaction.restaurantOrganization.create).not.toHaveBeenCalled();
    expect(transaction.user.create).not.toHaveBeenCalled();
  });
});
