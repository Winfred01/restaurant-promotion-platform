import type { Prisma, PrismaClient } from "@prisma/client";

type AcquisitionChannelPersistence = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_ACQUISITION_CHANNELS = [
  { name: "Xiaohongshu", sortOrder: 10 },
  { name: "WeChat", sortOrder: 20 },
  { name: "Instagram", sortOrder: 30 },
  { name: "Google", sortOrder: 40 },
  { name: "Friend Referral", sortOrder: 50 },
  { name: "Walk-in", sortOrder: 60 },
  { name: "Other", sortOrder: 70 },
  { name: "Unknown / Not Sure", sortOrder: 80 }
] as const;

export async function ensureDefaultAcquisitionChannels(
  db: AcquisitionChannelPersistence,
  organizationId: string
) {
  await db.acquisitionChannel.createMany({
    data: DEFAULT_ACQUISITION_CHANNELS.map((channel) => ({
      organizationId,
      name: channel.name,
      isSystemDefault: true,
      sortOrder: channel.sortOrder
    })),
    skipDuplicates: true
  });

  return db.acquisitionChannel.findMany({
    where: {
      organizationId,
      name: {
        in: DEFAULT_ACQUISITION_CHANNELS.map((channel) => channel.name)
      },
      status: "ACTIVE"
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}
