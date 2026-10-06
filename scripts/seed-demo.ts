import { pathToFileURL } from "node:url";

import { hash } from "@node-rs/argon2";
import { MembershipRole, PrismaClient } from "@prisma/client";

export const demoOrganizationSlug = "restaurant-demo";
export const demoBranchName = "Downtown Demo";

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

export async function seedDemoDatabase(db: PrismaClient, password: string) {
  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1
  });

  await db.$transaction(async (tx) => {
    const [existingOrganization, existingUsers] = await Promise.all([
      tx.restaurantOrganization.findUnique({ where: { slug: demoOrganizationSlug } }),
      tx.user.findMany({
        where: { email: { in: demoAccounts.map((account) => account.email) } },
        select: { id: true }
      })
    ]);

    if (existingOrganization || existingUsers.length > 0) {
      throw new DemoSeedError(
        "Demo organization or account already exists; no records were changed."
      );
    }

    const organization = await tx.restaurantOrganization.create({
      data: { name: "Restaurant Demo", slug: demoOrganizationSlug }
    });
    const branch = await tx.branch.create({
      data: { organizationId: organization.id, name: demoBranchName }
    });

    for (const account of demoAccounts) {
      const user = await tx.user.create({
        data: {
          email: account.email,
          name: account.name,
          passwordHash
        }
      });

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
      }
    }
  });
}

async function main() {
  const password = validateDemoSeedEnvironment(process.env);
  const db = new PrismaClient();

  try {
    await seedDemoDatabase(db, password);
    process.stdout.write("Demo organization and three employee accounts created.\n");
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
