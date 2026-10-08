import {
  Prisma,
  PromotionClaimStatus,
  PromotionCodeStatus,
  RedemptionStatus,
  type PrismaClient
} from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import {
  calculatePromotionEligibility,
  type PromotionEligibilityReason
} from "@/server/promotions/eligibility";

const identifierSchema = z.string().trim().min(1).max(191);
const checkoutInputSchema = z
  .object({
    organizationId: identifierSchema,
    actorUserId: identifierSchema,
    branchId: identifierSchema,
    customerId: identifierSchema,
    promotionId: identifierSchema,
    promotionCodeId: identifierSchema.optional(),
    claimId: identifierSchema.optional(),
    receiptNumber: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u),
    billSubtotalCents: z.number().int().positive().max(2_147_483_647)
  })
  .strict();

export type CreateCheckoutRedemptionInput = z.infer<typeof checkoutInputSchema>;

export function normalizeReceiptNumber(receiptNumber: string) {
  return receiptNumber.normalize("NFKC").trim().replace(/\s+/gu, " ").toUpperCase();
}

export class RedemptionUnavailableError extends Error {
  constructor() {
    super("Checkout context is unavailable.");
    this.name = "RedemptionUnavailableError";
  }
}

export class RedemptionIneligibleError extends Error {
  constructor(readonly reasonCodes: readonly PromotionEligibilityReason[]) {
    super("Promotion is not eligible for this bill.");
    this.name = "RedemptionIneligibleError";
  }
}

export class RedemptionConflictError extends Error {
  constructor() {
    super("This receipt or promotion was already redeemed, or checkout context changed.");
    this.name = "RedemptionConflictError";
  }
}

function isTransactionConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export function createCheckoutRedemptionService(
  db: PrismaClient,
  options: { now?: () => Date } = {}
) {
  return {
    async create(input: CreateCheckoutRedemptionInput) {
      const parsedInput = checkoutInputSchema.parse(input);
      const normalizedReceiptNumber = normalizeReceiptNumber(parsedInput.receiptNumber);

      try {
        return await db.$transaction(
          async (transaction) => {
            const context = await createPrismaAuthorizationGuard(
              transaction
            ).requireBranchPermission({
              organizationId: parsedInput.organizationId,
              branchId: parsedInput.branchId,
              userId: parsedInput.actorUserId,
              permission: Permission.REDEMPTION_CREATE
            });

            const [customer, promotion, claim, priorRedemption, priorReceipt] = await Promise.all([
              transaction.customer.findUnique({
                where: {
                  id_organizationId: {
                    id: parsedInput.customerId,
                    organizationId: parsedInput.organizationId
                  }
                },
                select: { id: true }
              }),
              transaction.promotion.findUnique({
                where: {
                  id_organizationId: {
                    id: parsedInput.promotionId,
                    organizationId: parsedInput.organizationId
                  }
                },
                include: { branches: { select: { branchId: true } } }
              }),
              parsedInput.claimId
                ? transaction.customerPromotionClaim.findUnique({
                    where: {
                      id_organizationId_branchId_customerId_promotionId: {
                        id: parsedInput.claimId,
                        organizationId: parsedInput.organizationId,
                        branchId: parsedInput.branchId,
                        customerId: parsedInput.customerId,
                        promotionId: parsedInput.promotionId
                      }
                    },
                    select: { id: true, status: true, promotionCodeId: true }
                  })
                : Promise.resolve(null),
              transaction.redemption.findFirst({
                where: {
                  organizationId: parsedInput.organizationId,
                  customerId: parsedInput.customerId,
                  promotionId: parsedInput.promotionId,
                  status: RedemptionStatus.COMPLETED
                },
                select: { id: true }
              }),
              transaction.redemption.findFirst({
                where: {
                  organizationId: parsedInput.organizationId,
                  branchId: parsedInput.branchId,
                  normalizedReceiptNumber,
                  status: RedemptionStatus.COMPLETED
                },
                select: { id: true }
              })
            ]);

            if (!customer || !promotion || (parsedInput.claimId && !claim)) {
              throw new RedemptionUnavailableError();
            }
            if (claim && claim.status !== PromotionClaimStatus.CLAIMED) {
              throw new RedemptionConflictError();
            }
            if (
              claim?.promotionCodeId &&
              parsedInput.promotionCodeId &&
              claim.promotionCodeId !== parsedInput.promotionCodeId
            ) {
              throw new RedemptionUnavailableError();
            }
            if (priorReceipt) {
              throw new RedemptionConflictError();
            }

            const promotionCodeId = parsedInput.promotionCodeId ?? claim?.promotionCodeId ?? null;
            const promotionCode = promotionCodeId
              ? await transaction.promotionCode.findUnique({
                  where: {
                    id_organizationId_promotionId: {
                      id: promotionCodeId,
                      organizationId: parsedInput.organizationId,
                      promotionId: parsedInput.promotionId
                    }
                  },
                  select: { id: true, status: true }
                })
              : null;
            const redeemedAt = options.now?.() ?? new Date();
            const eligibility = calculatePromotionEligibility({
              promotionId: promotion.id,
              status: promotion.status,
              rewardType: promotion.rewardType,
              discountCents: promotion.discountCents,
              discountPercent: promotion.discountPercent,
              maxDiscountCents: promotion.maxDiscountCents,
              minimumSpendCents: promotion.minimumSpendCents,
              validFrom: promotion.validFrom,
              validUntil: promotion.validUntil,
              appliesToAllBranches: promotion.appliesToAllBranches,
              targetBranchIds: promotion.branches.map(({ branchId }) => branchId),
              branchId: parsedInput.branchId,
              billSubtotalCents: parsedInput.billSubtotalCents,
              evaluatedAt: redeemedAt,
              promotionCodeAvailable: promotionCodeId
                ? promotionCode?.status === PromotionCodeStatus.ACTIVE
                : undefined,
              hasPriorSuccessfulRedemption: priorRedemption !== null
            });

            if (!eligibility.eligible) {
              throw new RedemptionIneligibleError(eligibility.reasonCodes);
            }

            const redemption = await transaction.redemption.create({
              data: {
                organizationId: parsedInput.organizationId,
                branchId: parsedInput.branchId,
                customerId: parsedInput.customerId,
                promotionId: parsedInput.promotionId,
                promotionCodeId,
                claimId: claim?.id,
                redeemedByUserId: parsedInput.actorUserId,
                receiptNumber: parsedInput.receiptNumber,
                normalizedReceiptNumber,
                billSubtotalCents: parsedInput.billSubtotalCents,
                discountCents: eligibility.discountCents,
                netBillCents: eligibility.finalBillCents,
                redeemedAt
              }
            });

            if (claim) {
              const updated = await transaction.customerPromotionClaim.updateMany({
                where: {
                  id: claim.id,
                  organizationId: parsedInput.organizationId,
                  status: PromotionClaimStatus.CLAIMED
                },
                data: { status: PromotionClaimStatus.REDEEMED }
              });
              if (updated.count !== 1) {
                throw new RedemptionConflictError();
              }
            }

            await transaction.auditLog.create({
              data: {
                organizationId: parsedInput.organizationId,
                branchId: parsedInput.branchId,
                actorUserId: parsedInput.actorUserId,
                actorRole: context.role,
                action: "REDEMPTION_CREATED",
                entityType: "Redemption",
                entityId: redemption.id,
                afterJson: {
                  customerId: redemption.customerId,
                  promotionId: redemption.promotionId,
                  promotionCodeId: redemption.promotionCodeId,
                  claimId: redemption.claimId,
                  billSubtotalCents: redemption.billSubtotalCents,
                  discountCents: redemption.discountCents,
                  netBillCents: redemption.netBillCents,
                  status: redemption.status
                }
              }
            });

            return redemption;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (isTransactionConflict(error)) {
          throw new RedemptionConflictError();
        }
        throw error;
      }
    }
  };
}
