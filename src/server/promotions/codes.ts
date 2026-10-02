import { randomInt } from "node:crypto";

import { Prisma, type PrismaClient, PromotionCodeStatus, PromotionCodeType } from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import {
  authorizePromotionTarget,
  loadPromotion,
  promotionTarget,
  type PromotionAuthorizationContext,
  type PromotionWithBranches
} from "./management";

export const PROMOTION_CODE_MIN_LENGTH = 3;
export const PROMOTION_CODE_MAX_LENGTH = 32;
export const GENERATED_PROMOTION_CODE_LENGTH = 12;
export const GENERATED_PROMOTION_CODE_ATTEMPTS = 5;

const promotionCodePattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/i;
const generatedCodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const identifierSchema = z.string().trim().min(1).max(191);
const actorPromotionSchema = z
  .object({
    organizationId: identifierSchema,
    actorUserId: identifierSchema,
    promotionId: identifierSchema
  })
  .strict();
const sharedCodeSchema = actorPromotionSchema.extend({
  code: z.string().max(256)
});
const validationSchema = actorPromotionSchema.extend({
  branchId: identifierSchema,
  code: z.string().max(256)
});

export type CreateSharedPromotionCodeInput = z.infer<typeof sharedCodeSchema>;
export type ValidatePromotionCodeInput = z.infer<typeof validationSchema>;

export class PromotionCodeValidationError extends Error {
  constructor() {
    super(
      `Promotion codes must be ${PROMOTION_CODE_MIN_LENGTH}-${PROMOTION_CODE_MAX_LENGTH} characters using letters, numbers, and single hyphens.`
    );
    this.name = "PromotionCodeValidationError";
  }
}

export class PromotionCodeConflictError extends Error {
  constructor() {
    super("Promotion code is unavailable.");
    this.name = "PromotionCodeConflictError";
  }
}

export class PromotionCodeUnavailableError extends Error {
  constructor() {
    super("Promotion code is unavailable.");
    this.name = "PromotionCodeUnavailableError";
  }
}

export class PromotionCodeGenerationError extends Error {
  constructor() {
    super("Unable to generate a unique promotion code.");
    this.name = "PromotionCodeGenerationError";
  }
}

export function normalizePromotionCode(value: string) {
  const trimmedCode = value.trim();

  if (
    trimmedCode.length < PROMOTION_CODE_MIN_LENGTH ||
    trimmedCode.length > PROMOTION_CODE_MAX_LENGTH ||
    !promotionCodePattern.test(trimmedCode)
  ) {
    throw new PromotionCodeValidationError();
  }

  return trimmedCode.toUpperCase();
}

export function isValidPromotionCode(value: string) {
  try {
    normalizePromotionCode(value);
    return true;
  } catch (error) {
    if (error instanceof PromotionCodeValidationError) {
      return false;
    }
    throw error;
  }
}

export function generatePromotionCode() {
  return Array.from(
    { length: GENERATED_PROMOTION_CODE_LENGTH },
    () => generatedCodeAlphabet[randomInt(generatedCodeAlphabet.length)]
  ).join("");
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function recordPromotionCodeAudit(
  db: Prisma.TransactionClient,
  input: {
    context: PromotionAuthorizationContext;
    promotion: PromotionWithBranches;
    promotionCode: {
      id: string;
      codeType: PromotionCodeType;
      status: PromotionCodeStatus;
    };
  }
) {
  await db.auditLog.create({
    data: {
      organizationId: input.context.organizationId,
      branchId: input.context.auditBranchId,
      actorUserId: input.context.actorUserId,
      actorRole: input.context.role,
      action: "PROMOTION_CODE_CREATED",
      entityType: "Promotion",
      entityId: input.promotion.id,
      promotionId: input.promotion.id,
      afterJson: {
        promotionCodeId: input.promotionCode.id,
        codeType: input.promotionCode.codeType,
        status: input.promotionCode.status
      },
      metadataJson: {
        source: "promotion-code-service"
      }
    }
  });
}

export function createPromotionCodeService(
  db: PrismaClient,
  options: {
    generateCode?: () => string;
  } = {}
) {
  async function createCode(input: {
    organizationId: string;
    actorUserId: string;
    promotionId: string;
    code: string;
    codeType: PromotionCodeType;
  }) {
    return db.$transaction(async (transaction) => {
      const promotion = await loadPromotion(transaction, input);
      const context = await authorizePromotionTarget(
        transaction,
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId
        },
        promotionTarget(promotion)
      );
      const promotionCode = await transaction.promotionCode.create({
        data: {
          organizationId: input.organizationId,
          promotionId: input.promotionId,
          code: input.code,
          codeType: input.codeType
        }
      });
      await recordPromotionCodeAudit(transaction, { context, promotion, promotionCode });
      return promotionCode;
    });
  }

  return {
    async createShared(input: CreateSharedPromotionCodeInput) {
      const parsedInput = sharedCodeSchema.parse(input);
      const code = normalizePromotionCode(parsedInput.code);

      try {
        return await createCode({
          ...parsedInput,
          code,
          codeType: PromotionCodeType.SHARED
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new PromotionCodeConflictError();
        }
        throw error;
      }
    },

    async createGenerated(input: z.infer<typeof actorPromotionSchema>) {
      const parsedInput = actorPromotionSchema.parse(input);

      for (let attempt = 0; attempt < GENERATED_PROMOTION_CODE_ATTEMPTS; attempt += 1) {
        const code = normalizePromotionCode((options.generateCode ?? generatePromotionCode)());

        try {
          return await createCode({
            ...parsedInput,
            code,
            codeType: PromotionCodeType.UNIQUE
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) {
            throw error;
          }
        }
      }

      throw new PromotionCodeGenerationError();
    },

    async validate(input: ValidatePromotionCodeInput) {
      const parsedInput = validationSchema.parse(input);
      const code = normalizePromotionCode(parsedInput.code);
      const authorization = createPrismaAuthorizationGuard(db);

      await authorization.requireBranchPermission({
        organizationId: parsedInput.organizationId,
        branchId: parsedInput.branchId,
        userId: parsedInput.actorUserId,
        permission: Permission.PROMOTION_ELIGIBILITY_VIEW
      });

      const promotionCode = await db.promotionCode.findFirst({
        where: {
          organizationId: parsedInput.organizationId,
          promotionId: parsedInput.promotionId,
          code,
          status: PromotionCodeStatus.ACTIVE
        }
      });

      if (!promotionCode) {
        throw new PromotionCodeUnavailableError();
      }

      return promotionCode;
    }
  };
}
