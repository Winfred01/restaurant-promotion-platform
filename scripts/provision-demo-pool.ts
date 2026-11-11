import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";

import { earliestFreshDemoFixture } from "../src/server/demo/fixture-age.ts";
import { demoOrganizationSlug, seedDemoDatabase } from "./seed-demo.ts";

type PoolEnvironment = Record<string, string | undefined>;

class DemoPoolError extends Error {}

export function validateDemoPoolEnvironment(env: PoolEnvironment) {
  if (env.DEMO_PUBLIC_ENTRY !== "1" || env.DEMO_POOL_CONFIRM !== "restaurant-demo-pool") {
    throw new DemoPoolError("Demo pool provisioning requires explicit operator confirmation.");
  }
  let url: URL;
  let databaseName: string;
  try {
    url = new URL(env.DATABASE_URL ?? "");
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new DemoPoolError("Set DATABASE_URL to a dedicated PostgreSQL demo database.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !/^[a-z0-9_]*demo[a-z0-9_]*$/i.test(databaseName) ||
    env.DEMO_POOL_TARGET !== `${url.host}/${databaseName}`
  ) {
    throw new DemoPoolError(
      "DEMO_POOL_TARGET must exactly match the dedicated demo host and database."
    );
  }
  if (
    !local &&
    (!/^restaurant_promotion_(public|preview)_demo$/.test(databaseName) ||
      url.hostname.split(".")[0].endsWith("-pooler") ||
      !["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? ""))
  ) {
    throw new DemoPoolError(
      "Hosted provisioning requires a direct TLS connection to the named public or preview demo database."
    );
  }
  const target = Number(env.DEMO_POOL_COUNT);
  if (!Number.isInteger(target) || target < 1 || target > 50) {
    throw new DemoPoolError("DEMO_POOL_COUNT must be an integer from 1 through 50.");
  }
  return { databaseName, target, hosted: !local };
}

export async function replenishDemoPool(
  db: PrismaClient,
  { databaseName, target, hosted }: ReturnType<typeof validateDemoPoolEnvironment>
) {
  return db.$transaction(
    async (tx) => {
      const [identity] = await tx.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
      if (identity?.name !== databaseName) {
        throw new DemoPoolError("Connected database identity differs from the confirmed target.");
      }
      // Serialize operator runs. The lock is scoped to this transaction and database.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(250063)::text`;
      if (hosted) {
        const unrelated = await tx.restaurantOrganization.findFirst({
          where: {
            OR: [
              { slug: { not: { startsWith: `${demoOrganizationSlug}-` } } },
              { demoTenantLease: null }
            ]
          },
          select: { id: true }
        });
        if (
          unrelated ||
          (await tx.user.count({
            where: { email: { not: { endsWith: "@restaurant-demo.example.com" } } }
          }))
        ) {
          throw new DemoPoolError(
            "The hosted target contains records outside the isolated demo pool."
          );
        }
      }
      const available = await tx.demoTenantLease.count({
        where: { status: "AVAILABLE", createdAt: { gte: earliestFreshDemoFixture() } }
      });
      const added = Math.max(0, target - available);
      for (let index = 0; index < added; index += 1) {
        await seedDemoDatabase(tx, randomBytes(32).toString("hex"), randomBytes(8).toString("hex"));
      }
      return added;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 120_000 }
  );
}

async function main() {
  const config = validateDemoPoolEnvironment(process.env);
  const db = new PrismaClient();
  try {
    const added = await replenishDemoPool(db, config);
    process.stdout.write(
      `Added ${added} isolated demo tenants (available target: ${config.target}).\n`
    );
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof DemoPoolError ? error.message : "Demo pool provisioning failed. Check connectivity, migrations, and operator privileges."}\n`
    );
    process.exitCode = 1;
  });
}
