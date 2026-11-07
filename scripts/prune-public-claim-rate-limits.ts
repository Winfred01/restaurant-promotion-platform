import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  const result = await db.publicClaimRateLimit.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
  });
  process.stdout.write(`Removed ${result.count} expired public claim counters.\n`);
} finally {
  await db.$disconnect();
}
