import { pathToFileURL } from "node:url";

import { hash } from "@node-rs/argon2";
import {
  MembershipRole,
  PrismaClient,
  PromotionClaimStatus,
  PromotionRewardType,
  PromotionStatus,
  RedemptionStatus
} from "@prisma/client";

export const demoOrganizationSlug = "restaurant-demo";
export const demoBranchName = "Downtown Demo";
export const demoSecondBranchName = "Riverside Demo";

class DemoSeedError extends Error {}

export const demoAccounts = [
  {
    email: "owner@restaurant-demo.example.com",
    name: "Demo Owner",
    role: MembershipRole.OWNER
  },
  {
    email: "manager@restaurant-demo.example.com",
    name: "Demo Manager",
    role: MembershipRole.MANAGER
  },
  {
    email: "staff@restaurant-demo.example.com",
    name: "Demo Staff",
    role: MembershipRole.STAFF
  }
] as const;

type DemoSeedEnvironment = {
  DATABASE_URL?: string;
  DEMO_SEED_CONFIRM?: string;
  DEMO_SEED_DATABASE?: string;
  DEMO_SEED_PASSWORD?: string;
  NODE_ENV?: string;
};

export function validateDemoSeedEnvironment(env: DemoSeedEnvironment) {
  if (env.NODE_ENV === "production" || env.DEMO_SEED_CONFIRM !== demoOrganizationSlug) {
    throw new DemoSeedError("Demo seeding requires an explicit non-production confirmation.");
  }

  if (!env.DEMO_SEED_PASSWORD || env.DEMO_SEED_PASSWORD.length < 16) {
    throw new DemoSeedError("Set a demo password of at least 16 characters in DEMO_SEED_PASSWORD.");
  }

  let databaseUrl: URL;

  try {
    databaseUrl = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new DemoSeedError("Set DATABASE_URL to a dedicated PostgreSQL demo database.");
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));

  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !databaseName.toLowerCase().includes("demo") ||
    env.DEMO_SEED_DATABASE !== databaseName
  ) {
    throw new DemoSeedError("DATABASE_URL must name a confirmed dedicated demo database.");
  }

  return env.DEMO_SEED_PASSWORD;
}

export async function seedDemoDatabase(db: PrismaClient, password: string, tenantTag?: string) {
  if (tenantTag !== undefined && !/^[a-f0-9]{16}$/.test(tenantTag)) {
    throw new DemoSeedError("Invalid isolated demo tenant tag.");
  }
  const organizationSlug =
    tenantTag !== undefined ? `${demoOrganizationSlug}-${tenantTag}` : demoOrganizationSlug;
  const accounts =
    tenantTag !== undefined
      ? demoAccounts.map((account) => ({
          ...account,
          email: `${account.role.toLowerCase()}+${tenantTag}@restaurant-demo.example.com`
        }))
      : demoAccounts;
  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1
  });

  return db.$transaction(async (tx) => {
    const [existingOrganization, existingUsers] = await Promise.all([
      tx.restaurantOrganization.findUnique({ where: { slug: organizationSlug } }),
      tx.user.findMany({
        where: { email: { in: accounts.map((account) => account.email) } },
        select: { id: true }
      })
    ]);

    if (existingOrganization || existingUsers.length > 0) {
      throw new DemoSeedError(
        "Demo organization or account already exists; no records were changed."
      );
    }

    const organization = await tx.restaurantOrganization.create({
      data: { name: "Restaurant Demo", slug: organizationSlug }
    });
    const branch = await tx.branch.create({
      data: { organizationId: organization.id, name: demoBranchName }
    });
    const secondBranch = await tx.branch.create({
      data: { organizationId: organization.id, name: demoSecondBranchName }
    });
    let ownerUserId = "";
    let staffUserId = "";

    for (const account of accounts) {
      const user = await tx.user.create({
        data: {
          email: account.email,
          name: account.name,
          passwordHash
        }
      });
      if (account.role === MembershipRole.OWNER) ownerUserId = user.id;
      if (account.role === MembershipRole.STAFF) staffUserId = user.id;

      await tx.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: account.role
        }
      });

      if (account.role !== MembershipRole.OWNER) {
        await tx.branchMembership.create({
          data: {
            organizationId: organization.id,
            branchId: branch.id,
            userId: user.id,
            role: account.role
          }
        });
        if (account.role === MembershipRole.STAFF) {
          await tx.branchMembership.create({
            data: {
              organizationId: organization.id,
              branchId: secondBranch.id,
              userId: user.id,
              role: account.role
            }
          });
        }
      }
    }
    if (tenantTag !== undefined) {
      await tx.demoTenantLease.create({ data: { organizationId: organization.id } });
    }

    const channels = await Promise.all(
      ["Walk-in", "Friend referral", "Social media"].map((name, sortOrder) =>
        tx.acquisitionChannel.create({ data: { organizationId: organization.id, name, sortOrder } })
      )
    );
    const customerSpecs = [
      { suffix: "0101", channelId: channels[0].id },
      { suffix: "0102", channelId: channels[1].id },
      { suffix: "0103", channelId: channels[2].id },
      { suffix: "0104", channelId: channels[0].id }
    ];
    const customers = [];
    for (const spec of customerSpecs) {
      customers.push(
        await tx.customer.create({
          data: {
            organizationId: organization.id,
            acquisitionChannelId: spec.channelId,
            phoneNumberRaw: `416555${spec.suffix}`,
            phoneNumberNormalized: `+1416555${spec.suffix}`,
            phoneNumberDisplay: `(416) 555-${spec.suffix}`
          }
        })
      );
    }

    const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);
    const promotionBase = {
      organizationId: organization.id,
      createdByUserId: ownerUserId,
      validFrom: daysFromNow(-60),
      validUntil: daysFromNow(30)
    };
    const welcome = await tx.promotion.create({
      data: {
        ...promotionBase,
        name: "Welcome $5 off",
        description: "Demo bill-level fixed discount",
        status: PromotionStatus.ACTIVE,
        rewardType: PromotionRewardType.FIXED_AMOUNT,
        discountCents: 500
      }
    });
    const weeknight = await tx.promotion.create({
      data: {
        ...promotionBase,
        name: "Downtown weeknight 10%",
        status: PromotionStatus.ACTIVE,
        rewardType: PromotionRewardType.PERCENTAGE,
        discountPercent: 10,
        appliesToAllBranches: false
      }
    });
    await tx.promotionBranch.create({
      data: { organizationId: organization.id, promotionId: weeknight.id, branchId: branch.id }
    });
    await tx.promotion.create({
      data: {
        ...promotionBase,
        name: "Paused $3 off",
        status: PromotionStatus.PAUSED,
        rewardType: PromotionRewardType.FIXED_AMOUNT,
        discountCents: 300
      }
    });
    await tx.promotion.create({
      data: {
        ...promotionBase,
        name: "Upcoming spend $50 save $8",
        status: PromotionStatus.SCHEDULED,
        validFrom: daysFromNow(10),
        validUntil: daysFromNow(40),
        rewardType: PromotionRewardType.SPEND_THRESHOLD,
        minimumSpendCents: 5000,
        discountCents: 800
      }
    });
    await tx.promotion.create({
      data: {
        ...promotionBase,
        name: "Past $2 off",
        status: PromotionStatus.ENDED,
        validUntil: daysFromNow(-1),
        rewardType: PromotionRewardType.FIXED_AMOUNT,
        discountCents: 200
      }
    });

    const redemptions = [
      {
        customer: customers[1],
        promotion: welcome,
        branchId: branch.id,
        receipt: "DEMO-1001",
        subtotal: 3000,
        discount: 500,
        days: -12
      },
      {
        customer: customers[1],
        promotion: weeknight,
        branchId: branch.id,
        receipt: "DEMO-1002",
        subtotal: 4000,
        discount: 400,
        days: -4
      },
      {
        customer: customers[0],
        promotion: welcome,
        branchId: secondBranch.id,
        receipt: "DEMO-2001",
        subtotal: 2500,
        discount: 500,
        days: -8
      },
      {
        customer: customers[3],
        promotion: welcome,
        branchId: branch.id,
        receipt: "DEMO-VOID-01",
        subtotal: 2000,
        discount: 500,
        days: -6,
        voided: true
      }
    ];
    for (const item of redemptions) {
      const claim = await tx.customerPromotionClaim.create({
        data: {
          organizationId: organization.id,
          branchId: item.branchId,
          customerId: item.customer.id,
          promotionId: item.promotion.id,
          claimedByUserId: staffUserId,
          status: PromotionClaimStatus.REDEEMED,
          claimedAt: daysFromNow(item.days)
        }
      });
      const redemption = await tx.redemption.create({
        data: {
          organizationId: organization.id,
          branchId: item.branchId,
          customerId: item.customer.id,
          promotionId: item.promotion.id,
          claimId: claim.id,
          redeemedByUserId: staffUserId,
          receiptNumber: item.receipt,
          normalizedReceiptNumber: item.receipt,
          billSubtotalCents: item.subtotal,
          discountCents: item.discount,
          netBillCents: item.subtotal - item.discount,
          status: item.voided ? RedemptionStatus.VOIDED : RedemptionStatus.COMPLETED,
          redeemedAt: daysFromNow(item.days),
          voidedAt: item.voided ? daysFromNow(item.days + 1) : null
        }
      });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          branchId: item.branchId,
          actorUserId: staffUserId,
          actorRole: MembershipRole.STAFF,
          action: "DEMO_REDEMPTION_CREATED",
          entityType: "Redemption",
          entityId: redemption.id,
          afterJson: { status: RedemptionStatus.COMPLETED, receiptNumber: item.receipt },
          createdAt: daysFromNow(item.days)
        }
      });
      if (item.voided) {
        await tx.redemptionVoid.create({
          data: {
            organizationId: organization.id,
            redemptionId: redemption.id,
            voidedByUserId: ownerUserId,
            reason: "Fictional demo correction",
            createdAt: daysFromNow(item.days + 1)
          }
        });
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            branchId: item.branchId,
            actorUserId: ownerUserId,
            actorRole: MembershipRole.OWNER,
            action: "DEMO_REDEMPTION_VOIDED",
            entityType: "Redemption",
            entityId: redemption.id,
            reason: "Fictional demo correction",
            beforeJson: { status: RedemptionStatus.COMPLETED },
            afterJson: { status: RedemptionStatus.VOIDED },
            createdAt: daysFromNow(item.days + 1)
          }
        });
      }
    }
    await tx.customerPromotionClaim.create({
      data: {
        organizationId: organization.id,
        branchId: branch.id,
        customerId: customers[2].id,
        promotionId: welcome.id,
        claimedByUserId: staffUserId,
        status: PromotionClaimStatus.CLAIMED
      }
    });
    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorUserId: ownerUserId,
        actorRole: MembershipRole.OWNER,
        action: "DEMO_SEED_CREATED",
        entityType: "RestaurantOrganization",
        entityId: organization.id,
        afterJson: {
          branches: 2,
          users: 3,
          channels: 3,
          customers: 4,
          promotions: 5,
          claims: 5,
          completedRedemptions: 3,
          voidedRedemptions: 1
        }
      }
    });
    return organization.id;
  });
}

async function main() {
  const password = validateDemoSeedEnvironment(process.env);
  const db = new PrismaClient();

  try {
    await seedDemoDatabase(db, password);
    process.stdout.write(
      "Demo organization, two branches, three employee accounts, and fictional scenario created.\n"
    );
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof DemoSeedError ? error.message : "Demo seeding failed. Check database availability."}\n`
    );
    process.exitCode = 1;
  });
}
