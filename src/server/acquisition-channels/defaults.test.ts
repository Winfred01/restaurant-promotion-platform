import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import { DEFAULT_ACQUISITION_CHANNELS, ensureDefaultAcquisitionChannels } from "./defaults";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describeWithLocalDatabase("default acquisition channels", () => {
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

  it("creates the supported defaults once for each organization", async () => {
    const tenantA = await harness.createTenant({ name: "Tenant A", slug: "tenant-a" });
    const tenantB = await harness.createTenant({ name: "Tenant B", slug: "tenant-b" });

    const firstResult = await ensureDefaultAcquisitionChannels(db, tenantA.id);
    const secondResult = await ensureDefaultAcquisitionChannels(db, tenantA.id);
    const tenantBResult = await ensureDefaultAcquisitionChannels(db, tenantB.id);

    const expectedNames = DEFAULT_ACQUISITION_CHANNELS.map((channel) => channel.name);

    expect(firstResult.map((channel) => channel.name)).toEqual(expectedNames);
    expect(secondResult.map((channel) => channel.name)).toEqual(expectedNames);
    expect(tenantBResult.map((channel) => channel.name)).toEqual(expectedNames);
    await expect(
      db.acquisitionChannel.count({ where: { organizationId: tenantA.id } })
    ).resolves.toBe(DEFAULT_ACQUISITION_CHANNELS.length);
  });
});
