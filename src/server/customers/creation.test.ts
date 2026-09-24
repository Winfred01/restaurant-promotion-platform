import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import {
  AcquisitionChannelRequiredError,
  AcquisitionChannelUnavailableError,
  findOrCreateCustomer
} from "./creation";
import { findCustomerByPhoneNumber } from "./lookup";
import { InvalidPhoneNumberError } from "./phone";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl);
const describeWithLocalDatabase = isLocalDatabase ? describeWithDatabase : describe.skip;

describe("customer creation validation", () => {
  it("rejects an invalid phone without exposing the raw input", async () => {
    const rawPhoneNumber = "416-FLOWERS";

    await expect(
      findOrCreateCustomer({} as PrismaClient, {
        organizationId: "organization-id",
        phoneNumber: rawPhoneNumber,
        acquisitionChannelId: "channel-id"
      })
    ).rejects.toBeInstanceOf(InvalidPhoneNumberError);

    try {
      await findOrCreateCustomer({} as PrismaClient, {
        organizationId: "organization-id",
        phoneNumber: rawPhoneNumber,
        acquisitionChannelId: "channel-id"
      });
    } catch (error) {
      expect((error as Error).message).not.toContain(rawPhoneNumber);
    }
  });
});

describeWithLocalDatabase("customer creation and acquisition channel capture", () => {
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

  it("requires an acquisition channel when creating a new customer", async () => {
    const tenant = await harness.createTenant();

    await expect(
      findOrCreateCustomer(db, {
        organizationId: tenant.id,
        phoneNumber: "416-555-0101"
      })
    ).rejects.toBeInstanceOf(AcquisitionChannelRequiredError);
    await expect(db.customer.count({ where: { organizationId: tenant.id } })).resolves.toBe(0);
  });

  it("stores the original acquisition channel on first creation", async () => {
    const tenant = await harness.createTenant();
    const channel = await harness.createAcquisitionChannel(tenant, { name: "Google" });

    const result = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "(416) 555-0102",
      acquisitionChannelId: channel.id
    });

    expect(result.isNewCustomer).toBe(true);
    expect(result.customer).toMatchObject({
      organizationId: tenant.id,
      acquisitionChannelId: channel.id,
      phoneNumberNormalized: "+14165550102"
    });
  });

  it("returns an existing customer without prompting for a channel again", async () => {
    const tenant = await harness.createTenant();
    const channel = await harness.createAcquisitionChannel(tenant, { name: "Instagram" });
    const created = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "416-555-0103",
      acquisitionChannelId: channel.id
    });

    const returning = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "+1 416 555 0103"
    });

    expect(returning.isNewCustomer).toBe(false);
    expect(returning.customer.id).toBe(created.customer.id);
    expect(returning.customer.acquisitionChannelId).toBe(channel.id);
  });

  it("does not overwrite the original channel for a returning customer", async () => {
    const tenant = await harness.createTenant();
    const originalChannel = await harness.createAcquisitionChannel(tenant, {
      name: "Friend Referral"
    });
    const laterChannel = await harness.createAcquisitionChannel(tenant, { name: "Walk-in" });
    const created = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "416-555-0104",
      acquisitionChannelId: originalChannel.id
    });

    const returning = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "4165550104",
      acquisitionChannelId: laterChannel.id
    });

    expect(returning.isNewCustomer).toBe(false);
    expect(returning.customer.id).toBe(created.customer.id);
    expect(returning.customer.acquisitionChannelId).toBe(originalChannel.id);
    await expect(
      db.customer.findUniqueOrThrow({ where: { id: created.customer.id } })
    ).resolves.toMatchObject({ acquisitionChannelId: originalChannel.id });
  });

  it("does not create a duplicate for the same normalized phone in one organization", async () => {
    const tenant = await harness.createTenant();
    const channel = await harness.createAcquisitionChannel(tenant);
    const first = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "(416) 555-0105",
      acquisitionChannelId: channel.id
    });
    const second = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "+1 416 555 0105",
      acquisitionChannelId: channel.id
    });

    expect(second.isNewCustomer).toBe(false);
    expect(second.customer.id).toBe(first.customer.id);
    await expect(db.customer.count({ where: { organizationId: tenant.id } })).resolves.toBe(1);
  });

  it("allows the same normalized phone in separate organizations", async () => {
    const tenantA = await harness.createTenant({ name: "Tenant A", slug: "tenant-a" });
    const tenantB = await harness.createTenant({ name: "Tenant B", slug: "tenant-b" });
    const channelA = await harness.createAcquisitionChannel(tenantA);
    const channelB = await harness.createAcquisitionChannel(tenantB);

    const customerA = await findOrCreateCustomer(db, {
      organizationId: tenantA.id,
      phoneNumber: "416-555-0106",
      acquisitionChannelId: channelA.id
    });
    const customerB = await findOrCreateCustomer(db, {
      organizationId: tenantB.id,
      phoneNumber: "+1 416 555 0106",
      acquisitionChannelId: channelB.id
    });

    expect(customerA.customer.id).not.toBe(customerB.customer.id);
    expect(customerA.customer.organizationId).toBe(tenantA.id);
    expect(customerB.customer.organizationId).toBe(tenantB.id);
  });

  it("denies cross-tenant customer lookup and channel assignment", async () => {
    const tenantA = await harness.createTenant({ name: "Tenant A", slug: "tenant-a" });
    const tenantB = await harness.createTenant({ name: "Tenant B", slug: "tenant-b" });
    const channelB = await harness.createAcquisitionChannel(tenantB);
    await findOrCreateCustomer(db, {
      organizationId: tenantB.id,
      phoneNumber: "416-555-0107",
      acquisitionChannelId: channelB.id
    });

    await expect(
      findCustomerByPhoneNumber(db, {
        organizationId: tenantA.id,
        phoneNumber: "416-555-0107"
      })
    ).resolves.toBeNull();
    await expect(
      findOrCreateCustomer(db, {
        organizationId: tenantA.id,
        phoneNumber: "647-555-0107",
        acquisitionChannelId: channelB.id
      })
    ).rejects.toBeInstanceOf(AcquisitionChannelUnavailableError);
  });

  it("keeps acquisition channel as customer origin instead of later-event attribution", async () => {
    const tenant = await harness.createTenant();
    const originalChannel = await harness.createAcquisitionChannel(tenant, {
      name: "Xiaohongshu"
    });
    const laterEventChannel = await harness.createAcquisitionChannel(tenant, {
      name: "WeChat"
    });
    const firstResolution = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "416-555-0108",
      acquisitionChannelId: originalChannel.id
    });

    const laterResolution = await findOrCreateCustomer(db, {
      organizationId: tenant.id,
      phoneNumber: "416-555-0108",
      acquisitionChannelId: laterEventChannel.id
    });

    expect(laterResolution.customer.id).toBe(firstResolution.customer.id);
    expect(laterResolution.customer.acquisitionChannelId).toBe(originalChannel.id);
    await expect(
      db.customer.count({
        where: {
          organizationId: tenant.id,
          acquisitionChannelId: laterEventChannel.id
        }
      })
    ).resolves.toBe(0);
  });
});
