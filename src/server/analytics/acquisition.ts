import { Prisma, RedemptionStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";

const identifierSchema = z.string().trim().min(1).max(191);
const analyticsInputSchema = z
  .object({
    organizationId: identifierSchema,
    actorUserId: identifierSchema
  })
  .strict();

export type AcquisitionAnalyticsInput = z.infer<typeof analyticsInputSchema>;

type Channel = { id: string; name: string; status: string };
type Customer = { id: string; acquisitionChannelId: string | null };
type RecordedSpend = {
  customerId: string;
  recordedBillCount: number;
  netBillCents: number;
};

export function summarizeAcquisitionChannels(
  channels: Channel[],
  customers: Customer[],
  recordedSpend: RecordedSpend[]
) {
  const spendByCustomer = new Map(recordedSpend.map((row) => [row.customerId, row]));
  const totals = new Map<
    string | null,
    { newCustomers: number; observedReturningCustomers: number; recordedSpendCents: number }
  >();

  for (const customer of customers) {
    const channelId = customer.acquisitionChannelId;
    const total = totals.get(channelId) ?? {
      newCustomers: 0,
      observedReturningCustomers: 0,
      recordedSpendCents: 0
    };
    const spend = spendByCustomer.get(customer.id);
    total.newCustomers += 1;
    total.observedReturningCustomers += Number((spend?.recordedBillCount ?? 0) >= 2);
    total.recordedSpendCents += spend?.netBillCents ?? 0;
    totals.set(channelId, total);
  }

  const rows: Array<
    {
      acquisitionChannelId: string | null;
      acquisitionChannelName: string;
      acquisitionChannelStatus: string;
    } & ReturnType<typeof metrics>
  > = channels.map((channel) => ({
    acquisitionChannelId: channel.id,
    acquisitionChannelName: channel.name,
    acquisitionChannelStatus: channel.status,
    ...metrics(totals.get(channel.id))
  }));

  if (totals.has(null)) {
    rows.push({
      acquisitionChannelId: null,
      acquisitionChannelName: "Unattributed",
      acquisitionChannelStatus: "UNATTRIBUTED",
      ...metrics(totals.get(null))
    });
  }

  return rows;
}

function metrics(total?: {
  newCustomers: number;
  observedReturningCustomers: number;
  recordedSpendCents: number;
}) {
  const newCustomers = total?.newCustomers ?? 0;
  const observedReturningCustomers = total?.observedReturningCustomers ?? 0;
  const recordedSpendCents = total?.recordedSpendCents ?? 0;

  return {
    newCustomers,
    observedReturningCustomers,
    observedReturnRateBasisPoints:
      newCustomers === 0 ? null : Math.round((observedReturningCustomers * 10_000) / newCustomers),
    recordedSpendCents,
    averageRecordedSpendPerCustomerCents:
      newCustomers === 0 ? null : Math.round(recordedSpendCents / newCustomers)
  };
}

export function createAcquisitionAnalyticsService(db: PrismaClient) {
  return {
    async report(input: AcquisitionAnalyticsInput) {
      const parsedInput = analyticsInputSchema.parse(input);

      return db.$transaction(
        async (transaction) => {
          await createPrismaAuthorizationGuard(transaction).requireOrganizationPermission({
            organizationId: parsedInput.organizationId,
            userId: parsedInput.actorUserId,
            permission: Permission.ORGANIZATION_ANALYTICS_VIEW
          });

          const [channels, customers, spendGroups] = await Promise.all([
            transaction.acquisitionChannel.findMany({
              where: { organizationId: parsedInput.organizationId },
              select: { id: true, name: true, status: true },
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }]
            }),
            transaction.customer.findMany({
              where: { organizationId: parsedInput.organizationId },
              select: { id: true, acquisitionChannelId: true }
            }),
            transaction.redemption.groupBy({
              by: ["customerId"],
              where: {
                organizationId: parsedInput.organizationId,
                status: RedemptionStatus.COMPLETED,
                billSubtotalCents: { not: null },
                netBillCents: { not: null }
              },
              _count: { _all: true },
              _sum: { netBillCents: true }
            })
          ]);

          return {
            scope: { organizationId: parsedInput.organizationId },
            methodology: {
              returnDefinition: "At least two completed redemptions with recorded bill amounts",
              spendDefinition: "Net bill amount from completed promotion-linked redemptions only"
            },
            channels: summarizeAcquisitionChannels(
              channels,
              customers,
              spendGroups.map((group) => ({
                customerId: group.customerId,
                recordedBillCount: group._count._all,
                netBillCents: group._sum.netBillCents ?? 0
              }))
            )
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
      );
    }
  };
}
