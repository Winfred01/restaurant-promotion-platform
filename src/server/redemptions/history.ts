import { RedemptionStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";

const inputSchema = z
  .object({
    organizationId: z.string().trim().min(1).max(191),
    branchId: z.string().trim().min(1).max(191),
    actorUserId: z.string().trim().min(1).max(191),
    status: z.enum(["ALL", RedemptionStatus.COMPLETED, RedemptionStatus.VOIDED])
  })
  .strict();

export type RedemptionHistoryInput = z.infer<typeof inputSchema>;

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : "•••";
}

export function createRedemptionHistoryService(db: PrismaClient) {
  return {
    async list(input: RedemptionHistoryInput) {
      const parsed = inputSchema.parse(input);
      await createPrismaAuthorizationGuard(db).requireBranchPermission({
        organizationId: parsed.organizationId,
        branchId: parsed.branchId,
        userId: parsed.actorUserId,
        permission: Permission.REDEMPTION_VOID
      });

      const rows = await db.redemption.findMany({
        where: {
          organizationId: parsed.organizationId,
          branchId: parsed.branchId,
          ...(parsed.status === "ALL" ? {} : { status: parsed.status })
        },
        orderBy: [{ redeemedAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          receiptNumber: true,
          billSubtotalCents: true,
          discountCents: true,
          netBillCents: true,
          status: true,
          redeemedAt: true,
          voidedAt: true,
          customer: { select: { phoneNumberDisplay: true } },
          promotion: { select: { name: true } },
          redeemedByMembership: { select: { user: { select: { name: true } } } },
          redemptionVoid: {
            select: {
              reason: true,
              voidedByMembership: { select: { user: { select: { name: true } } } }
            }
          }
        }
      });

      return rows.map((row) => ({
        id: row.id,
        receiptNumber: row.receiptNumber,
        billSubtotalCents: row.billSubtotalCents,
        discountCents: row.discountCents,
        netBillCents: row.netBillCents,
        status: row.status,
        redeemedAt: row.redeemedAt,
        voidedAt: row.voidedAt,
        customerPhone: maskPhone(row.customer.phoneNumberDisplay),
        promotionName: row.promotion.name,
        staffName: row.redeemedByMembership?.user.name ?? "Unknown",
        voidReason: row.redemptionVoid?.reason ?? null,
        voidedByName: row.redemptionVoid?.voidedByMembership.user.name ?? null
      }));
    }
  };
}
