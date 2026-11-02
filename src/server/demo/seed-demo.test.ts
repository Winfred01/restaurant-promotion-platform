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
  let nextId = 0;
  const create = () =>
    vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `demo_${++nextId}`,
      ...data
    }));
  const transaction = {
    restaurantOrganization: {
      findUnique: vi.fn(async () => (existingOrganization ? { id: "existing_org" } : null)),
      create: create()
    },
    branch: { create: create() },
    user: {
      findMany: vi.fn(async () => []),
      create: create()
    },
    organizationMembership: { create: create() },
    branchMembership: { create: create() },
    acquisitionChannel: { create: create() },
    customer: { create: create() },
    promotion: { create: create() },
    promotionBranch: { create: create() },
    customerPromotionClaim: { create: create() },
    redemption: { create: create() },
    redemptionVoid: { create: create() },
    auditLog: { create: create() }
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
    expect(transaction.branch.create).toHaveBeenCalledTimes(2);
    expect(transaction.branchMembership.create).toHaveBeenCalledTimes(3);
    expect(transaction.acquisitionChannel.create).toHaveBeenCalledTimes(3);
    expect(transaction.customer.create).toHaveBeenCalledTimes(4);
    expect(transaction.promotion.create).toHaveBeenCalledTimes(5);
    expect(transaction.customerPromotionClaim.create).toHaveBeenCalledTimes(5);
    expect(transaction.redemption.create).toHaveBeenCalledTimes(4);
    expect(transaction.redemptionVoid.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(6);
    expect(
      transaction.organizationMembership.create.mock.calls.map(([input]) => input.data.role)
    ).toEqual([MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]);

    for (const [input] of transaction.user.create.mock.calls) {
      expect(input.data.passwordHash).not.toBe(password);
      await expect(verifyPassword(input.data.passwordHash as string, password)).resolves.toBe(true);
    }
    expect(
      transaction.redemption.create.mock.calls.filter(
        ([input]) => input.data.status === "COMPLETED"
      )
    ).toHaveLength(3);
    expect(
      transaction.redemption.create.mock.calls.filter(([input]) => input.data.status === "VOIDED")
    ).toHaveLength(1);
  });

  it("does not change an existing demo organization", async () => {
    const { db, transaction } = createSeedDatabase(true);

    await expect(seedDemoDatabase(db, password)).rejects.toThrow("already exists");
    expect(transaction.restaurantOrganization.create).not.toHaveBeenCalled();
    expect(transaction.user.create).not.toHaveBeenCalled();
  });
});
