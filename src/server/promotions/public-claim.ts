import { createHmac } from "node:crypto";

import {
  BranchStatus,
  Prisma,
  PromotionClaimSource,
  RedemptionStatus,
  RestaurantOrganizationStatus,
  type PrismaClient
} from "@prisma/client";
import { z } from "zod";

import { InvalidPhoneNumberError, normalizePhoneNumber } from "@/server/customers/phone";
import {
  createRetryingTransactionClient,
  isPrismaKnownRequestErrorCode
} from "@/server/serializable-transaction";
import { calculatePromotionClaimEligibility } from "./eligibility";

const inputSchema = z
  .object({
    organizationId: z.string().trim().min(1).max(191),
    branchId: z.string().trim().min(1).max(191),
    promotionId: z.string().trim().min(1).max(191),
    phoneNumber: z.string().trim().min(1).max(32),
    remoteAddress: z.string().trim().min(1).max(255)
  })
  .strict();

export type PublicClaimInput = z.infer<typeof inputSchema>;

const limits = [
  { name: "address", durationMs: 60_000, maximum: 20 },
  { name: "branch", durationMs: 60_000, maximum: 120 },
  { name: "promotion", durationMs: 60_000, maximum: 60 },
  { name: "phone", durationMs: 3_600_000, maximum: 3 }
] as const;

export class PublicClaimConfigurationError extends Error {
  constructor() {
    super("Public claim configuration is unavailable.");
    this.name = "PublicClaimConfigurationError";
  }
}

function rateKey(secret: string, value: string) {
  return createHmac("sha256", secret).update(`public-claim:v1:${value}`).digest("hex");
}

function rateDimensions(input: PublicClaimInput, normalizedPhone: string) {
  return [
    `${input.organizationId}:${input.remoteAddress}`,
    `${input.organizationId}:${input.branchId}`,
    `${input.organizationId}:${input.branchId}:${input.promotionId}`,
    `${input.organizationId}:${input.promotionId}:${normalizedPhone}`
  ];
}

export function createPublicClaimService(
  db: PrismaClient,
  options: { hashSecret?: string; now?: () => Date } = {}
) {
  const retryingDb = createRetryingTransactionClient(db);

  return {
    async claim(input: PublicClaimInput): Promise<void> {
      const parsed = inputSchema.parse(input);
      const normalizedPhone = normalizePhoneNumber(parsed.phoneNumber);
      const secret = options.hashSecret ?? process.env.AUTH_SECRET;
      if (!secret || secret.length < 32) {
        throw new PublicClaimConfigurationError();
      }

      const now = options.now?.() ?? new Date();
      const dimensions = rateDimensions(parsed, normalizedPhone);
      let withinLimits = false;

      try {
        withinLimits = await retryingDb.$transaction(
          async (transaction) => {
            for (const [index, limit] of limits.entries()) {
              const windowStart = new Date(
                Math.floor(now.getTime() / limit.durationMs) * limit.durationMs
              );
              const key = rateKey(
                secret,
                `${limit.name}:${windowStart.toISOString()}:${dimensions[index]}`
              );
              const counter = await transaction.publicClaimRateLimit.upsert({
                where: { key },
                create: {
                  key,
                  organizationId: parsed.organizationId,
                  windowStart,
                  count: 1,
                  expiresAt: new Date(windowStart.getTime() + limit.durationMs)
                },
                update: { count: { increment: 1 } },
                select: { count: true }
              });
              if (counter.count > limit.maximum) {
                return false;
              }
            }
            return true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (
          isPrismaKnownRequestErrorCode(error, "P2034") ||
          isPrismaKnownRequestErrorCode(error, "P2002")
        ) {
          return;
        }
        throw error;
      }

      if (!withinLimits) {
        return;
      }

      try {
        await retryingDb.$transaction(
          async (transaction) => {
            const [branch, promotion, customer] = await Promise.all([
              transaction.branch.findUnique({
                where: {
                  id_organizationId: {
                    id: parsed.branchId,
                    organizationId: parsed.organizationId
                  }
                },
                select: { status: true, organization: { select: { status: true } } }
              }),
              transaction.promotion.findUnique({
                where: {
                  id_organizationId: {
                    id: parsed.promotionId,
                    organizationId: parsed.organizationId
                  }
                },
                include: { branches: { select: { branchId: true } } }
              }),
              transaction.customer.findUnique({
                where: {
                  organizationId_phoneNumberNormalized: {
                    organizationId: parsed.organizationId,
                    phoneNumberNormalized: normalizedPhone
                  }
                },
                select: { id: true }
              })
            ]);

            if (
              !branch ||
              branch.status !== BranchStatus.ACTIVE ||
              branch.organization.status !== RestaurantOrganizationStatus.ACTIVE ||
              !promotion ||
              !customer
            ) {
              return;
            }

            const priorRedemption = await transaction.redemption.findFirst({
              where: {
                organizationId: parsed.organizationId,
                customerId: customer.id,
                promotionId: promotion.id,
                status: RedemptionStatus.COMPLETED
              },
              select: { id: true }
            });
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
              branchId: parsed.branchId,
              evaluatedAt: now,
              hasPriorSuccessfulRedemption: priorRedemption !== null
            });

            if (!eligibility.eligible) {
              return;
            }

            const claim = await transaction.customerPromotionClaim.create({
              data: {
                organizationId: parsed.organizationId,
                branchId: parsed.branchId,
                customerId: customer.id,
                promotionId: promotion.id,
                source: PromotionClaimSource.QR,
                claimedAt: now
              }
            });

            await transaction.auditLog.create({
              data: {
                organizationId: parsed.organizationId,
                branchId: parsed.branchId,
                action: "PROMOTION_CLAIM_CREATED",
                entityType: "CustomerPromotionClaim",
                entityId: claim.id,
                afterJson: {
                  customerId: customer.id,
                  promotionId: promotion.id,
                  status: claim.status,
                  source: PromotionClaimSource.QR
                }
              }
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (
          isPrismaKnownRequestErrorCode(error, "P2034") ||
          isPrismaKnownRequestErrorCode(error, "P2002")
        ) {
          return;
        }
        throw error;
      }
    }
  };
}

export { InvalidPhoneNumberError };
