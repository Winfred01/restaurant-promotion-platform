import {
  Prisma,
  PromotionClaimSource,
  PromotionCodeStatus,
  RedemptionStatus,
  type PrismaClient
} from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { calculatePromotionClaimEligibility, type PromotionEligibilityReason } from "./eligibility";

const identifierSchema = z.string().trim().min(1).max(191);
const claimInputSchema = z
  .object({
    organizationId: identifierSchema,
    actorUserId: identifierSchema,
    branchId: identifierSchema,
    customerId: identifierSchema,
    promotionId: identifierSchema,
    promotionCodeId: identifierSchema.optional()
  })
  .strict();

export type CreateStaffPromotionClaimInput = z.infer<typeof claimInputSchema>;

export class PromotionClaimUnavailableError extends Error {
  constructor() {
    super("Promotion claim context is unavailable.");
    this.name = "PromotionClaimUnavailableError";
  }
}

export class PromotionClaimIneligibleError extends Error {
  constructor(readonly reasonCodes: readonly PromotionEligibilityReason[]) {
    super("Promotion is not eligible to be claimed.");
    this.name = "PromotionClaimIneligibleError";
  }
}

export class PromotionClaimConflictError extends Error {
  constructor() {
    super("An active claim already exists or the claim context changed.");
    this.name = "PromotionClaimConflictError";
  }
}

function isClaimConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export function createStaffPromotionClaimService(
  db: PrismaClient,
  options: { now?: () => Date } = {}
) {
  return {
    async create(input: CreateStaffPromotionClaimInput) {
      const parsedInput = claimInputSchema.parse(input);

      try {
        return await db.$transaction(
          async (transaction) => {
            const authorization = createPrismaAuthorizationGuard(transaction);
            const context = await authorization.requireBranchPermission({
              organizationId: parsedInput.organizationId,
              branchId: parsedInput.branchId,
              userId: parsedInput.actorUserId,
              permission: Permission.PROMOTION_CLAIM
            });

            const [customer, promotion, promotionCode, priorRedemption] = await Promise.all([
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
              parsedInput.promotionCodeId
                ? transaction.promotionCode.findUnique({
                    where: {
                      id_organizationId_promotionId: {
                        id: parsedInput.promotionCodeId,
                        organizationId: parsedInput.organizationId,
                        promotionId: parsedInput.promotionId
                      }
                    },
                    select: { id: true, status: true }
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
              })
            ]);

            if (!customer || !promotion) {
              throw new PromotionClaimUnavailableError();
            }

            const claimedAt = options.now?.() ?? new Date();
            const eligibility = calculatePromotionClaimEligibility({
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
              evaluatedAt: claimedAt,
              promotionCodeAvailable: parsedInput.promotionCodeId
                ? promotionCode?.status === PromotionCodeStatus.ACTIVE
                : undefined,
              hasPriorSuccessfulRedemption: priorRedemption !== null
            });

            if (!eligibility.eligible) {
              throw new PromotionClaimIneligibleError(eligibility.reasonCodes);
            }

            const claim = await transaction.customerPromotionClaim.create({
              data: {
                organizationId: parsedInput.organizationId,
                branchId: parsedInput.branchId,
                customerId: parsedInput.customerId,
                promotionId: parsedInput.promotionId,
                promotionCodeId: parsedInput.promotionCodeId,
                claimedByUserId: parsedInput.actorUserId,
                source: PromotionClaimSource.STAFF,
                claimedAt
              }
            });

            await transaction.auditLog.create({
              data: {
                organizationId: parsedInput.organizationId,
                branchId: parsedInput.branchId,
                actorUserId: parsedInput.actorUserId,
                actorRole: context.role,
                action: "PROMOTION_CLAIM_CREATED",
                entityType: "CustomerPromotionClaim",
                entityId: claim.id,
                afterJson: {
                  customerId: claim.customerId,
                  promotionId: claim.promotionId,
                  promotionCodeId: claim.promotionCodeId,
                  status: claim.status,
                  source: claim.source
                }
              }
            });

            return claim;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (isClaimConflict(error)) {
          throw new PromotionClaimConflictError();
        }
        throw error;
      }
    }
  };
}
