import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import { findCustomerByPhoneNumber } from "./lookup";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describeWithLocalDatabase("customer phone lookup", () => {
  const db = new PrismaClient();
  const harness = createTenantIsolationHarness(db);

  beforeAll(async () => {
    await db.$connect();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("allows the same normalized phone in different tenants", async () => {
    const tenantA = await harness.createTenant({ name: "Tenant A", slug: "tenant-a" });
    const tenantB = await harness.createTenant({ name: "Tenant B", slug: "tenant-b" });

    const customerA = await harness.createCustomer(tenantA, {
      phoneNumber: "(416) 555-0123"
    });
    const customerB = await harness.createCustomer(tenantB, {
      phoneNumber: "+1 416 555 0123"
    });

    await expect(
      findCustomerByPhoneNumber(db, {
        organizationId: tenantA.id,
        phoneNumber: "416-555-0123"
      })
    ).resolves.toMatchObject({ id: customerA.id, organizationId: tenantA.id });
    await expect(
      findCustomerByPhoneNumber(db, {
        organizationId: tenantB.id,
        phoneNumber: "1 416 555 0123"
      })
    ).resolves.toMatchObject({ id: customerB.id, organizationId: tenantB.id });
  });

  it("rejects duplicate normalized phones inside one tenant", async () => {
    const tenant = await harness.createTenant();

    await harness.createCustomer(tenant, { phoneNumber: "(416) 555-0123" });

    await expect(
      harness.createCustomer(tenant, { phoneNumber: "+1 416 555 0123" })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("does not expose a customer through another tenant", async () => {
    const tenantA = await harness.createTenant({ name: "Tenant A", slug: "tenant-a" });
    const tenantB = await harness.createTenant({ name: "Tenant B", slug: "tenant-b" });
    const customerB = await harness.createCustomer(tenantB, {
      phoneNumber: "(647) 555-0199"
    });

    await expect(
      findCustomerByPhoneNumber(db, {
        organizationId: tenantA.id,
        phoneNumber: customerB.phoneNumberRaw
      })
    ).resolves.toBeNull();
    await expect(
      findCustomerByPhoneNumber(db, {
        organizationId: tenantB.id,
        phoneNumber: customerB.phoneNumberRaw
      })
    ).resolves.toMatchObject({ id: customerB.id, organizationId: tenantB.id });
  });
});
