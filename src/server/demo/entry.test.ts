import { MembershipRole, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { validateDemoPoolEnvironment } from "../../../scripts/provision-demo-pool";
import { claimDemoTenant, consumeDemoTicket, isGuidedDemoEnabled, parseDemoRole } from "./entry";

type Lease = {
  id: string;
  organizationId: string;
  status: "AVAILABLE" | "CLAIMED";
  selectedRole?: MembershipRole;
  selectedUserId?: string;
  ticketHash?: string | null;
  ticketExpiresAt?: Date | null;
};

function createPool() {
  const leases: Lease[] = [
    { id: "lease-a", organizationId: "org-a", status: "AVAILABLE" },
    { id: "lease-b", organizationId: "org-b", status: "AVAILABLE" }
  ];
  const audits: unknown[] = [];
  const db = {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(tx)
  } as unknown as PrismaClient;
  const tx = {
    demoTenantLease: {
      findFirst: async () => leases.find((lease) => lease.status === "AVAILABLE") ?? null,
      findUnique: async ({ where }: { where: { ticketHash: string } }) =>
        leases.find((lease) => lease.ticketHash === where.ticketHash) ?? null,
      updateMany: async ({
        where,
        data
      }: {
        where: { id: string; status: string; ticketHash?: string; ticketExpiresAt?: { gt: Date } };
        data: Partial<Lease>;
      }) => {
        const lease = leases.find((item) => item.id === where.id && item.status === where.status);
        if (
          !lease ||
          (where.ticketHash && lease.ticketHash !== where.ticketHash) ||
          (where.ticketExpiresAt &&
            (!lease.ticketExpiresAt || lease.ticketExpiresAt <= where.ticketExpiresAt.gt))
        ) {
          return { count: 0 };
        }
        Object.assign(lease, data);
        return { count: 1 };
      }
    },
    organizationMembership: {
      findFirst: async ({
        where
      }: {
        where: { organizationId: string; role: MembershipRole };
      }) => ({
        userId: `${where.organizationId}-${where.role.toLowerCase()}`
      })
    },
    auditLog: { create: async ({ data }: { data: unknown }) => audits.push(data) },
    user: {
      findFirst: async ({
        where
      }: {
        where: {
          id: string;
          organizationMemberships: { some: { organizationId: string; role: MembershipRole } };
        };
      }) => {
        const { organizationId, role } = where.organizationMemberships.some;
        return where.id === `${organizationId}-${role.toLowerCase()}`
          ? { id: where.id, email: `${where.id}@example.com`, name: role }
          : null;
      }
    }
  };
  return { db, leases, audits };
}

describe("guided demo entry", () => {
  it("requires an explicit flag, a dedicated demo database, and a strong auth secret", () => {
    const env = {
      DEMO_PUBLIC_ENTRY: "1",
      DATABASE_URL: "postgresql://localhost:5432/restaurant_demo",
      AUTH_SECRET: "a".repeat(32)
    };
    expect(isGuidedDemoEnabled(env)).toBe(true);
    expect(isGuidedDemoEnabled({ ...env, DEMO_PUBLIC_ENTRY: "0" })).toBe(false);
    expect(
      isGuidedDemoEnabled({ ...env, DATABASE_URL: "postgresql://localhost:5432/production" })
    ).toBe(false);
    expect(isGuidedDemoEnabled({ ...env, AUTH_SECRET: "short" })).toBe(false);
    expect(parseDemoRole("OWNER")).toBe(MembershipRole.OWNER);
    expect(parseDemoRole("STAFF")).toBe(MembershipRole.STAFF);
    expect(parseDemoRole("ADMIN")).toBeNull();
    expect(parseDemoRole({ role: "OWNER" })).toBeNull();
  });

  it("provisions only with operator confirmation and a named demo database", () => {
    const env = {
      DEMO_PUBLIC_ENTRY: "1",
      DEMO_POOL_CONFIRM: "restaurant-demo-pool",
      DEMO_POOL_COUNT: "2",
      DEMO_POOL_TARGET: "localhost:5432/restaurant_demo",
      DATABASE_URL: "postgresql://localhost:5432/restaurant_demo"
    };
    expect(validateDemoPoolEnvironment(env)).toEqual({
      databaseName: "restaurant_demo",
      target: 2,
      hosted: false
    });
    expect(() =>
      validateDemoPoolEnvironment({ ...env, DEMO_POOL_TARGET: "other/restaurant_demo" })
    ).toThrow();
    expect(() => validateDemoPoolEnvironment({ ...env, DEMO_POOL_CONFIRM: undefined })).toThrow();
    expect(() =>
      validateDemoPoolEnvironment({
        ...env,
        DATABASE_URL: "postgresql://localhost:5432/production"
      })
    ).toThrow();
    expect(() => validateDemoPoolEnvironment({ ...env, DEMO_POOL_COUNT: "51" })).toThrow();
  });

  it("isolates Vercel stages and confirms a direct hosted operator target", () => {
    const database = "restaurant_promotion_preview_demo";
    const host = "ep-fixture.us-east-2.aws.neon.tech";
    const pooled = host.replace("ep-fixture", "ep-fixture-pooler");
    const env = {
      DEMO_FIXTURES_ONLY: "1",
      DEMO_PUBLIC_ENTRY: "1",
      AUTH_SECRET: "s".repeat(32),
      VERCEL_ENV: "preview",
      DATABASE_URL: `postgresql://${pooled}/${database}?sslmode=require`
    };
    expect(isGuidedDemoEnabled(env)).toBe(true);
    expect(isGuidedDemoEnabled({ ...env, VERCEL_ENV: "production" })).toBe(false);
    expect(isGuidedDemoEnabled({ ...env, DEMO_FIXTURES_ONLY: undefined })).toBe(false);
    const operator = {
      ...env,
      DEMO_POOL_CONFIRM: "restaurant-demo-pool",
      DEMO_POOL_COUNT: "12",
      DEMO_POOL_TARGET: `${host}/${database}`,
      DATABASE_URL: `postgresql://${host}/${database}?sslmode=require`
    };
    expect(validateDemoPoolEnvironment(operator)).toEqual({
      databaseName: database,
      target: 12,
      hosted: true
    });
    expect(() =>
      validateDemoPoolEnvironment({
        ...operator,
        DEMO_POOL_TARGET: `${pooled}/${database}`,
        DATABASE_URL: env.DATABASE_URL
      })
    ).toThrow(/direct TLS/);
  });

  it("claims distinct tenant sessions and consumes each sign-in ticket once", async () => {
    const { db, leases, audits } = createPool();
    const [ownerTicket, staffTicket] = await Promise.all([
      claimDemoTenant(db, MembershipRole.OWNER),
      claimDemoTenant(db, MembershipRole.STAFF)
    ]);
    expect(ownerTicket).toMatch(/^[a-f0-9]{64}$/);
    expect(staffTicket).toMatch(/^[a-f0-9]{64}$/);
    expect(ownerTicket).not.toBe(staffTicket);
    expect(leases.map((lease) => lease.status)).toEqual(["CLAIMED", "CLAIMED"]);
    expect(audits).toHaveLength(2);
    expect(await claimDemoTenant(db, MembershipRole.MANAGER)).toBeNull();

    const owner = await consumeDemoTicket(db, ownerTicket);
    const staff = await consumeDemoTicket(db, staffTicket);
    expect(owner).toMatchObject({ id: "org-a-owner", demoLeaseId: "lease-a" });
    expect(staff).toMatchObject({ id: "org-b-staff", demoLeaseId: "lease-b" });
    expect(await consumeDemoTicket(db, ownerTicket)).toBeNull();
    expect(await consumeDemoTicket(db, staffTicket)).toBeNull();
    expect(await consumeDemoTicket(db, "org-a-owner")).toBeNull();
  });
});
