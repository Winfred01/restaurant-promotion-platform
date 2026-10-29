import {
  MembershipRole,
  PrismaClient,
  PromotionRewardType,
  RedemptionStatus
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { createPromotion } from "@/server/promotions/lifecycle";
import { createTenantIsolationHarness } from "@/test-support/tenant-isolation";
import { createAcquisitionAnalyticsService, summarizeAcquisitionChannels } from "./acquisition";

const databaseUrl = process.env.DATABASE_URL ?? "";
const describeWithLocalDatabase = /@(localhost|127\.0\.0\.1):/.test(databaseUrl)
  ? describe
  : describe.skip;

describe("acquisition analytics calculations", () => {
  it("groups by original channel, retains empty channels, and excludes unrelated spend", () => {
    expect(
      summarizeAcquisitionChannels(
        [
          { id: "a", name: "Google", status: "ACTIVE" },
          { id: "b", name: "Archived", status: "ARCHIVED" }
        ],
        [
          { id: "first", acquisitionChannelId: "a" },
          { id: "second", acquisitionChannelId: "a" },
          { id: "legacy", acquisitionChannelId: null }
        ],
        [
          { customerId: "first", recordedBillCount: 2, netBillCents: 1_500 },
          { customerId: "second", recordedBillCount: 1, netBillCents: 500 },
          { customerId: "other-tenant", recordedBillCount: 10, netBillCents: 100_000 }
        ]
      )
    ).toEqual([
      {
        acquisitionChannelId: "a",
        acquisitionChannelName: "Google",
        acquisitionChannelStatus: "ACTIVE",
        newCustomers: 2,
        observedReturningCustomers: 1,
        observedReturnRateBasisPoints: 5_000,
        recordedSpendCents: 2_000,
        averageRecordedSpendPerCustomerCents: 1_000
      },
      {
        acquisitionChannelId: "b",
        acquisitionChannelName: "Archived",
        acquisitionChannelStatus: "ARCHIVED",
        newCustomers: 0,
        observedReturningCustomers: 0,
        observedReturnRateBasisPoints: null,
        recordedSpendCents: 0,
        averageRecordedSpendPerCustomerCents: null
      },
      {
        acquisitionChannelId: null,
        acquisitionChannelName: "Unattributed",
        acquisitionChannelStatus: "UNATTRIBUTED",
        newCustomers: 1,
        observedReturningCustomers: 0,
        observedReturnRateBasisPoints: 0,
        recordedSpendCents: 0,
        averageRecordedSpendPerCustomerCents: 0
      }
    ]);
  });

  it("rejects invalid scope before opening a transaction", async () => {
    await expect(
      createAcquisitionAnalyticsService({} as PrismaClient).report({
        organizationId: " ",
        actorUserId: "actor"
      })
    ).rejects.toMatchObject({ name: "ZodError" });
  });
});

describeWithLocalDatabase("acquisition analytics report", () => {
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

  it("groups original channels across the tenant and excludes VOIDED bills", async () => {
    const scope = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const otherTenant = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const google = await harness.createAcquisitionChannel(scope.organization, { name: "Google" });
    const referral = await harness.createAcquisitionChannel(scope.organization, {
      name: "Referral"
    });
    const otherChannel = await harness.createAcquisitionChannel(otherTenant.organization);
    const first = await harness.createCustomer(scope.organization, {
      acquisitionChannelId: google.id
    });
    await harness.createCustomer(scope.organization, { acquisitionChannelId: google.id });
    await harness.createCustomer(otherTenant.organization, {
      acquisitionChannelId: otherChannel.id
    });
    const promotion = await createPromotion(db, {
      organizationId: scope.organization.id,
      createdByUserId: scope.user.id,
      name: "Acquisition report fixture",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 100,
      appliesToAllBranches: true
    });
    const secondPromotion = await createPromotion(db, {
      organizationId: scope.organization.id,
      createdByUserId: scope.user.id,
      name: "Second acquisition fixture",
      rewardType: PromotionRewardType.FIXED_AMOUNT,
      discountCents: 100,
      appliesToAllBranches: true
    });

    for (const [promotionId, amount, status] of [
      [promotion.id, 1_000, RedemptionStatus.COMPLETED],
      [secondPromotion.id, 2_000, RedemptionStatus.COMPLETED],
      [promotion.id, 9_000, RedemptionStatus.VOIDED]
    ] as const) {
      await db.redemption.create({
        data: {
          organizationId: scope.organization.id,
          branchId: scope.branch.id,
          customerId: first.id,
          promotionId,
          redeemedByUserId: scope.user.id,
          billSubtotalCents: amount + 100,
          discountCents: 100,
          netBillCents: amount,
          status,
          voidedAt: status === RedemptionStatus.VOIDED ? new Date() : undefined
        }
      });
    }

    const report = await createAcquisitionAnalyticsService(db).report({
      organizationId: scope.organization.id,
      actorUserId: scope.user.id
    });

    expect(report.channels).toEqual([
      {
        acquisitionChannelId: google.id,
        acquisitionChannelName: "Google",
        acquisitionChannelStatus: google.status,
        newCustomers: 2,
        observedReturningCustomers: 1,
        observedReturnRateBasisPoints: 5_000,
        recordedSpendCents: 3_000,
        averageRecordedSpendPerCustomerCents: 1_500
      },
      {
        acquisitionChannelId: referral.id,
        acquisitionChannelName: "Referral",
        acquisitionChannelStatus: referral.status,
        newCustomers: 0,
        observedReturningCustomers: 0,
        observedReturnRateBasisPoints: null,
        recordedSpendCents: 0,
        averageRecordedSpendPerCustomerCents: null
      }
    ]);
    expect(JSON.stringify(report)).not.toContain(otherChannel.id);
    expect(JSON.stringify(report)).not.toContain("9000");
  });

  it("denies Staff, organization-wide Manager, and cross-tenant actors", async () => {
    const owner = await harness.createTenantScope({
      organizationRole: MembershipRole.OWNER,
      branchRole: MembershipRole.OWNER
    });
    const manager = await harness.createTenantScope({
      organizationRole: MembershipRole.MANAGER,
      branchRole: MembershipRole.MANAGER
    });
    const staff = await harness.createTenantScope();
    const service = createAcquisitionAnalyticsService(db);

    for (const actorUserId of [manager.user.id, staff.user.id, owner.user.id]) {
      await expect(
        service.report({ organizationId: manager.organization.id, actorUserId })
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    }
  });
});
