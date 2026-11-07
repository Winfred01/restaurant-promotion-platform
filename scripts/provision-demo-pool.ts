import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

import { seedDemoDatabase } from "./seed-demo.ts";

type PoolEnvironment = Record<string, string | undefined>;

export function validateDemoPoolEnvironment(env: PoolEnvironment) {
  if (env.DEMO_PUBLIC_ENTRY !== "1" || env.DEMO_POOL_CONFIRM !== "restaurant-demo-pool") {
    throw new Error("Demo pool provisioning requires explicit operator confirmation.");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new Error("Set DATABASE_URL to a dedicated PostgreSQL demo database.");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !decodeURIComponent(databaseUrl.pathname.slice(1)).toLowerCase().includes("demo")
  ) {
    throw new Error("Demo pool provisioning requires a dedicated demo database.");
  }
  const count = Number(env.DEMO_POOL_COUNT);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error("DEMO_POOL_COUNT must be an integer from 1 through 50.");
  }
  return count;
}

async function main() {
  const count = validateDemoPoolEnvironment(process.env);
  const db = new PrismaClient();
  try {
    for (let index = 0; index < count; index += 1) {
      const tag = randomBytes(8).toString("hex");
      const password = randomBytes(32).toString("hex");
      await seedDemoDatabase(db, password, tag);
    }
    process.stdout.write(`Provisioned ${count} isolated demo tenants.\n`);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("Demo pool provisioning failed; inspect the dedicated database.\n");
    process.exitCode = 1;
  });
}
