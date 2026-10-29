import { Prisma, RedemptionStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { createRetryingTransactionClient } from "@/server/serializable-transaction";

const identifierSchema = z.string().trim().min(1).max(191);
const voidInputSchema = z
  .object({
    organizationId: identifierSchema,
    actorUserId: identifierSchema,
    redemptionId: identifierSchema,
    reason: z.string().trim().min(1).max(1_000)
  })
  .strict();

export type VoidRedemptionInput = z.infer<typeof voidInputSchema>;

export class RedemptionVoidUnavailableError extends Error {
  constructor() {
    super("Redemption is unavailable.");
    this.name = "RedemptionVoidUnavailableError";
  }
}

export class RedemptionVoidConflictError extends Error {
  constructor() {
    super("Redemption was already voided or changed.");
    this.name = "RedemptionVoidConflictError";
  }
}

function isTransactionConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export function createRedemptionVoidService(db: PrismaClient, options: { now?: () => Date } = {}) {
  const retryingDb = createRetryingTransactionClient(db);

  return {
    async voidRedemption(input: VoidRedemptionInput) {
      const parsedInput = voidInputSchema.parse(input);

      try {
        return await retryingDb.$transaction(
          async (transaction) => {
            const redemption = await transaction.redemption.findUnique({
              where: {
                id_organizationId: {
                  id: parsedInput.redemptionId,
                  organizationId: parsedInput.organizationId
                }
              },
              select: {
                id: true,
                organizationId: true,
                branchId: true,
                customerId: true,
                promotionId: true,
                promotionCodeId: true,
                claimId: true,
                billSubtotalCents: true,
                discountCents: true,
                netBillCents: true,
                status: true,
                redeemedAt: true,
                voidedAt: true
              }
            });

            if (!redemption) {
              throw new RedemptionVoidUnavailableError();
            }

            const context = await createPrismaAuthorizationGuard(
              transaction
            ).requireBranchPermission({
              organizationId: parsedInput.organizationId,
              branchId: redemption.branchId,
              userId: parsedInput.actorUserId,
              permission: Permission.REDEMPTION_VOID
            });

            if (redemption.status !== RedemptionStatus.COMPLETED) {
              throw new RedemptionVoidConflictError();
            }

            const voidedAt = options.now?.() ?? new Date();
            const updated = await transaction.redemption.updateMany({
              where: {
                id: redemption.id,
                organizationId: parsedInput.organizationId,
                status: RedemptionStatus.COMPLETED
              },
              data: {
                status: RedemptionStatus.VOIDED,
                voidedAt
              }
            });

            if (updated.count !== 1) {
              throw new RedemptionVoidConflictError();
            }

            const redemptionVoid = await transaction.redemptionVoid.create({
              data: {
                organizationId: parsedInput.organizationId,
                redemptionId: redemption.id,
                voidedByUserId: parsedInput.actorUserId,
                reason: parsedInput.reason,
                createdAt: voidedAt
              }
            });

            await transaction.auditLog.create({
              data: {
                organizationId: parsedInput.organizationId,
                branchId: redemption.branchId,
                actorUserId: parsedInput.actorUserId,
                actorRole: context.role,
                action: "REDEMPTION_VOIDED",
                entityType: "Redemption",
                entityId: redemption.id,
                reason: parsedInput.reason,
                beforeJson: {
                  customerId: redemption.customerId,
                  promotionId: redemption.promotionId,
                  promotionCodeId: redemption.promotionCodeId,
                  claimId: redemption.claimId,
                  billSubtotalCents: redemption.billSubtotalCents,
                  discountCents: redemption.discountCents,
                  netBillCents: redemption.netBillCents,
                  status: redemption.status,
                  redeemedAt: redemption.redeemedAt.toISOString(),
                  voidedAt: redemption.voidedAt?.toISOString() ?? null
                },
                afterJson: {
                  status: RedemptionStatus.VOIDED,
                  voidedAt: voidedAt.toISOString(),
                  redemptionVoidId: redemptionVoid.id
                },
                metadataJson: {
                  source: "redemption-void-service"
                }
              }
            });

            return {
              redemption: {
                ...redemption,
                status: RedemptionStatus.VOIDED,
                voidedAt
              },
              redemptionVoid
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (isTransactionConflict(error)) {
          throw new RedemptionVoidConflictError();
        }
        throw error;
      }
    }
  };
}
