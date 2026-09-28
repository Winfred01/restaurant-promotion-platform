import {
  PromotionRewardType,
  PromotionStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

type BasePromotionInput = {
  organizationId: string;
  createdByUserId: string;
  name: string;
  description?: string;
  validFrom?: Date;
  validUntil?: Date;
  appliesToAllBranches: boolean;
  branchIds?: string[];
};

type FixedAmountReward = {
  rewardType: typeof PromotionRewardType.FIXED_AMOUNT;
  discountCents: number;
};

type PercentageReward = {
  rewardType: typeof PromotionRewardType.PERCENTAGE;
  discountPercent: number;
  maxDiscountCents?: number;
};

type SpendThresholdReward = {
  rewardType: typeof PromotionRewardType.SPEND_THRESHOLD;
  discountCents: number;
  minimumSpendCents: number;
};

export type CreatePromotionInput = BasePromotionInput &
  (FixedAmountReward | PercentageReward | SpendThresholdReward);

export class PromotionValidationError extends Error {
  constructor(message = "Promotion details are invalid.") {
    super(message);
    this.name = "PromotionValidationError";
  }
}

export class PromotionTargetingError extends Error {
  constructor(message = "Promotion branch targeting is invalid.") {
    super(message);
    this.name = "PromotionTargetingError";
  }
}

export class PromotionUnavailableError extends Error {
  constructor() {
    super("Promotion is unavailable.");
    this.name = "PromotionUnavailableError";
  }
}

export class InvalidPromotionTransitionError extends Error {
  constructor() {
    super("Promotion lifecycle transition is invalid.");
    this.name = "InvalidPromotionTransitionError";
  }
}

const allowedTransitions: Readonly<Record<PromotionStatus, readonly PromotionStatus[]>> = {
  DRAFT: [PromotionStatus.SCHEDULED, PromotionStatus.ACTIVE, PromotionStatus.ARCHIVED],
  SCHEDULED: [PromotionStatus.ACTIVE, PromotionStatus.ENDED, PromotionStatus.ARCHIVED],
  ACTIVE: [PromotionStatus.PAUSED, PromotionStatus.ENDED],
  PAUSED: [PromotionStatus.ACTIVE, PromotionStatus.ENDED, PromotionStatus.ARCHIVED],
  ENDED: [PromotionStatus.ARCHIVED],
  ARCHIVED: []
};

export function canTransitionPromotionStatus(from: PromotionStatus, to: PromotionStatus) {
  return allowedTransitions[from].includes(to);
}

function validatePositiveInteger(value: number | undefined) {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function validatePromotionInput(input: CreatePromotionInput) {
  if (!input.name.trim()) {
    throw new PromotionValidationError("Promotion name is required.");
  }

  if (input.validFrom && input.validUntil && input.validUntil <= input.validFrom) {
    throw new PromotionValidationError("Promotion end time must be after its start time.");
  }

  if (
    input.rewardType === PromotionRewardType.FIXED_AMOUNT &&
    !validatePositiveInteger(input.discountCents)
  ) {
    throw new PromotionValidationError();
  }

  if (
    input.rewardType === PromotionRewardType.PERCENTAGE &&
    (!validatePositiveInteger(input.discountPercent) ||
      input.discountPercent > 100 ||
      (input.maxDiscountCents !== undefined && !validatePositiveInteger(input.maxDiscountCents)))
  ) {
    throw new PromotionValidationError();
  }

  if (
    input.rewardType === PromotionRewardType.SPEND_THRESHOLD &&
    (!validatePositiveInteger(input.discountCents) ||
      !validatePositiveInteger(input.minimumSpendCents))
  ) {
    throw new PromotionValidationError();
  }
}

function normalizeBranchTargets(input: CreatePromotionInput) {
  const branchIds = [...new Set((input.branchIds ?? []).map((id) => id.trim()).filter(Boolean))];

  if (input.appliesToAllBranches && branchIds.length > 0) {
    throw new PromotionTargetingError(
      "All-branch promotions cannot also contain selected branch targets."
    );
  }

  if (!input.appliesToAllBranches && branchIds.length === 0) {
    throw new PromotionTargetingError(
      "Selected-branch promotions require at least one branch target."
    );
  }

  return branchIds;
}

export async function createPromotion(db: PrismaClient, input: CreatePromotionInput) {
  validatePromotionInput(input);
  const branchIds = normalizeBranchTargets(input);

  return db.$transaction(async (transaction) => {
    if (branchIds.length > 0) {
      const matchingBranches = await transaction.branch.count({
        where: {
          organizationId: input.organizationId,
          id: { in: branchIds }
        }
      });

      if (matchingBranches !== branchIds.length) {
        throw new PromotionTargetingError("One or more branch targets are unavailable.");
      }
    }

    const rewardData =
      input.rewardType === PromotionRewardType.PERCENTAGE
        ? {
            rewardType: input.rewardType,
            discountPercent: input.discountPercent,
            maxDiscountCents: input.maxDiscountCents
          }
        : input.rewardType === PromotionRewardType.SPEND_THRESHOLD
          ? {
              rewardType: input.rewardType,
              discountCents: input.discountCents,
              minimumSpendCents: input.minimumSpendCents
            }
          : {
              rewardType: input.rewardType,
              discountCents: input.discountCents
            };

    return transaction.promotion.create({
      data: {
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        appliesToAllBranches: input.appliesToAllBranches,
        ...rewardData,
        branches:
          branchIds.length > 0
            ? {
                create: branchIds.map((branchId) => ({
                  organizationId: input.organizationId,
                  branchId
                }))
              }
            : undefined
      },
      include: {
        branches: { orderBy: { branchId: "asc" } }
      }
    });
  });
}

export async function transitionPromotionStatus(
  db: DatabaseClient,
  input: {
    organizationId: string;
    promotionId: string;
    status: PromotionStatus;
  }
) {
  const promotion = await db.promotion.findUnique({
    where: {
      id_organizationId: {
        id: input.promotionId,
        organizationId: input.organizationId
      }
    }
  });

  if (!promotion) {
    throw new PromotionUnavailableError();
  }

  if (promotion.status === input.status) {
    return promotion;
  }

  if (!canTransitionPromotionStatus(promotion.status, input.status)) {
    throw new InvalidPromotionTransitionError();
  }

  const update = await db.promotion.updateMany({
    where: {
      id: promotion.id,
      organizationId: input.organizationId,
      status: promotion.status
    },
    data: { status: input.status }
  });

  if (update.count !== 1) {
    throw new InvalidPromotionTransitionError();
  }

  return db.promotion.findUniqueOrThrow({
    where: {
      id_organizationId: {
        id: promotion.id,
        organizationId: input.organizationId
      }
    }
  });
}
