import {
  PromotionCodeStatus,
  PromotionRewardType,
  PromotionStatus,
  RedemptionStatus,
  type PrismaClient
} from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { markBestDeal } from "./best-deal";

export const PromotionEligibilityReason = {
  STATUS_DRAFT: "PROMOTION_STATUS_DRAFT",
  STATUS_SCHEDULED: "PROMOTION_STATUS_SCHEDULED",
  STATUS_PAUSED: "PROMOTION_STATUS_PAUSED",
  STATUS_ENDED: "PROMOTION_STATUS_ENDED",
  STATUS_ARCHIVED: "PROMOTION_STATUS_ARCHIVED",
  NOT_STARTED: "PROMOTION_NOT_STARTED",
  EXPIRED: "PROMOTION_EXPIRED",
  BRANCH_NOT_TARGETED: "BRANCH_NOT_TARGETED",
  MINIMUM_SPEND_NOT_MET: "MINIMUM_SPEND_NOT_MET",
  CODE_UNAVAILABLE: "PROMOTION_CODE_UNAVAILABLE",
  ALREADY_REDEEMED: "ALREADY_REDEEMED"
} as const;

export type PromotionEligibilityReason =
  (typeof PromotionEligibilityReason)[keyof typeof PromotionEligibilityReason];

const statusReason: Readonly<Record<PromotionStatus, PromotionEligibilityReason | null>> = {
  [PromotionStatus.DRAFT]: PromotionEligibilityReason.STATUS_DRAFT,
  [PromotionStatus.SCHEDULED]: PromotionEligibilityReason.STATUS_SCHEDULED,
  [PromotionStatus.ACTIVE]: null,
  [PromotionStatus.PAUSED]: PromotionEligibilityReason.STATUS_PAUSED,
  [PromotionStatus.ENDED]: PromotionEligibilityReason.STATUS_ENDED,
  [PromotionStatus.ARCHIVED]: PromotionEligibilityReason.STATUS_ARCHIVED
};

const identifierSchema = z.string().trim().min(1).max(191);
const candidateSchema = z
  .object({
    promotionId: identifierSchema,
    promotionCodeId: identifierSchema.optional()
  })
  .strict();
const evaluationInputSchema = z
  .object({
    organizationId: identifierSchema,
    actorUserId: identifierSchema,
    branchId: identifierSchema,
    customerId: identifierSchema,
    billSubtotalCents: z.number().int().nonnegative().safe(),
    evaluatedAt: z.date().optional(),
    candidates: z.array(candidateSchema).min(1).max(100)
  })
  .strict()
  .superRefine((input, context) => {
    const promotionIds = new Set<string>();

    for (const [index, candidate] of input.candidates.entries()) {
      if (promotionIds.has(candidate.promotionId)) {
        context.addIssue({
          code: "custom",
          message: "Each promotion may be evaluated only once.",
          path: ["candidates", index, "promotionId"]
        });
      }
      promotionIds.add(candidate.promotionId);
    }
  });

export type EvaluatePromotionsInput = z.infer<typeof evaluationInputSchema>;

export type PromotionEligibilityFacts = {
  promotionId: string;
  status: PromotionStatus;
  rewardType: PromotionRewardType;
  discountCents: number | null;
  discountPercent: number | null;
  maxDiscountCents: number | null;
  minimumSpendCents: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  appliesToAllBranches: boolean;
  targetBranchIds: readonly string[];
  branchId: string;
  billSubtotalCents: number;
  evaluatedAt: Date;
  promotionCodeAvailable?: boolean;
  hasPriorSuccessfulRedemption: boolean;
};

export type PromotionEligibilityResult = {
  promotionId: string;
  eligible: boolean;
  reasonCodes: PromotionEligibilityReason[];
  discountCents: number;
  finalBillCents: number;
};

export class PromotionEligibilityValidationError extends Error {
  constructor() {
    super("Promotion eligibility inputs are invalid.");
    this.name = "PromotionEligibilityValidationError";
  }
}

export class PromotionEligibilityUnavailableError extends Error {
  constructor() {
    super("Promotion eligibility context is unavailable.");
    this.name = "PromotionEligibilityUnavailableError";
  }
}

function requireSafeInteger(value: number | null, minimum: number) {
  if (value === null || !Number.isSafeInteger(value) || value < minimum) {
    throw new PromotionEligibilityValidationError();
  }
  return value;
}

function percentageDiscount(subtotalCents: number, discountPercent: number) {
  const rounded = (BigInt(subtotalCents) * BigInt(discountPercent) + 50n) / 100n;
  const discountCents = Number(rounded);

  if (!Number.isSafeInteger(discountCents)) {
    throw new PromotionEligibilityValidationError();
  }

  return discountCents;
}

function calculateDiscount(input: PromotionEligibilityFacts) {
  if (input.rewardType === PromotionRewardType.PERCENTAGE) {
    const discountPercent = requireSafeInteger(input.discountPercent, 1);
    if (discountPercent > 100) {
      throw new PromotionEligibilityValidationError();
    }

    const calculatedDiscount = percentageDiscount(input.billSubtotalCents, discountPercent);
    const cappedDiscount =
      input.maxDiscountCents === null
        ? calculatedDiscount
        : Math.min(calculatedDiscount, requireSafeInteger(input.maxDiscountCents, 1));

    return Math.min(cappedDiscount, input.billSubtotalCents);
  }

  return Math.min(requireSafeInteger(input.discountCents, 1), input.billSubtotalCents);
}

export function calculatePromotionEligibility(
  input: PromotionEligibilityFacts
): PromotionEligibilityResult {
  requireSafeInteger(input.billSubtotalCents, 0);
  if (!Number.isFinite(input.evaluatedAt.getTime())) {
    throw new PromotionEligibilityValidationError();
  }

  const reasonCodes: PromotionEligibilityReason[] = [];
  const lifecycleReason = statusReason[input.status];
  if (lifecycleReason) {
    reasonCodes.push(lifecycleReason);
  }

  if (input.validFrom && input.evaluatedAt < input.validFrom) {
    reasonCodes.push(PromotionEligibilityReason.NOT_STARTED);
  }
  if (input.validUntil && input.evaluatedAt > input.validUntil) {
    reasonCodes.push(PromotionEligibilityReason.EXPIRED);
  }

  if (!input.appliesToAllBranches && !input.targetBranchIds.includes(input.branchId)) {
    reasonCodes.push(PromotionEligibilityReason.BRANCH_NOT_TARGETED);
  }

  if (input.rewardType === PromotionRewardType.SPEND_THRESHOLD) {
    const minimumSpendCents = requireSafeInteger(input.minimumSpendCents, 1);
    if (input.billSubtotalCents < minimumSpendCents) {
      reasonCodes.push(PromotionEligibilityReason.MINIMUM_SPEND_NOT_MET);
    }
  }

  if (input.promotionCodeAvailable === false) {
    reasonCodes.push(PromotionEligibilityReason.CODE_UNAVAILABLE);
  }
  if (input.hasPriorSuccessfulRedemption) {
    reasonCodes.push(PromotionEligibilityReason.ALREADY_REDEEMED);
  }

  const eligible = input.status === PromotionStatus.ACTIVE && reasonCodes.length === 0;
  const discountCents = eligible ? calculateDiscount(input) : 0;

  return {
    promotionId: input.promotionId,
    eligible,
    reasonCodes,
    discountCents,
    finalBillCents: input.billSubtotalCents - discountCents
  };
}

export function createPromotionEligibilityService(db: PrismaClient) {
  return {
    async evaluate(input: EvaluatePromotionsInput) {
      const parsedInput = evaluationInputSchema.parse(input);
      const authorization = createPrismaAuthorizationGuard(db);

      await authorization.requireBranchPermission({
        organizationId: parsedInput.organizationId,
        branchId: parsedInput.branchId,
        userId: parsedInput.actorUserId,
        permission: Permission.PROMOTION_ELIGIBILITY_VIEW
      });

      const customer = await db.customer.findUnique({
        where: {
          id_organizationId: {
            id: parsedInput.customerId,
            organizationId: parsedInput.organizationId
          }
        },
        select: { id: true }
      });
      if (!customer) {
        throw new PromotionEligibilityUnavailableError();
      }

      const promotionIds = parsedInput.candidates.map(({ promotionId }) => promotionId);
      const promotionCodeIds = parsedInput.candidates.flatMap(({ promotionCodeId }) =>
        promotionCodeId ? [promotionCodeId] : []
      );
      const [promotions, promotionCodes, priorRedemptions] = await Promise.all([
        db.promotion.findMany({
          where: {
            organizationId: parsedInput.organizationId,
            id: { in: promotionIds }
          },
          include: {
            branches: { select: { branchId: true } }
          }
        }),
        db.promotionCode.findMany({
          where: {
            organizationId: parsedInput.organizationId,
            id: { in: promotionCodeIds },
            status: PromotionCodeStatus.ACTIVE
          },
          select: { id: true, promotionId: true }
        }),
        db.redemption.findMany({
          where: {
            organizationId: parsedInput.organizationId,
            customerId: parsedInput.customerId,
            promotionId: { in: promotionIds },
            status: RedemptionStatus.COMPLETED
          },
          select: { promotionId: true }
        })
      ]);

      if (promotions.length !== promotionIds.length) {
        throw new PromotionEligibilityUnavailableError();
      }

      const promotionsById = new Map(promotions.map((promotion) => [promotion.id, promotion]));
      const availableCodeKeys = new Set(
        promotionCodes.map((promotionCode) => `${promotionCode.id}:${promotionCode.promotionId}`)
      );
      const redeemedPromotionIds = new Set(priorRedemptions.map(({ promotionId }) => promotionId));
      const evaluatedAt = parsedInput.evaluatedAt ?? new Date();

      return markBestDeal(
        parsedInput.candidates.map((candidate) => {
          const promotion = promotionsById.get(candidate.promotionId);
          if (!promotion) {
            throw new PromotionEligibilityUnavailableError();
          }

          return calculatePromotionEligibility({
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
            evaluatedAt,
            promotionCodeAvailable: candidate.promotionCodeId
              ? availableCodeKeys.has(`${candidate.promotionCodeId}:${candidate.promotionId}`)
              : undefined,
            hasPriorSuccessfulRedemption: redeemedPromotionIds.has(promotion.id)
          });
        })
      );
    }
  };
}
