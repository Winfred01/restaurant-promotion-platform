import {
  MembershipRole,
  Prisma,
  type PrismaClient,
  PromotionRewardType,
  PromotionStatus
} from "@prisma/client";
import { z } from "zod";

import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import {
  createPromotionRecord,
  normalizeBranchTargets,
  promotionDefinitionData,
  PromotionUnavailableError,
  requireAvailablePromotionBranches,
  transitionPromotionStatus,
  type PromotionDefinitionInput,
  type PromotionPersistence
} from "./lifecycle";

const identifierSchema = z.string().trim().min(1).max(191);
const branchIdsSchema = z.array(identifierSchema).max(100).optional();
const baseDefinitionShape = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  validFrom: z.date().optional(),
  validUntil: z.date().optional(),
  appliesToAllBranches: z.boolean(),
  branchIds: branchIdsSchema
};
const promotionDefinitionSchema = z.discriminatedUnion("rewardType", [
  z.object({
    ...baseDefinitionShape,
    rewardType: z.literal(PromotionRewardType.FIXED_AMOUNT),
    discountCents: z.number().int().positive()
  }),
  z.object({
    ...baseDefinitionShape,
    rewardType: z.literal(PromotionRewardType.PERCENTAGE),
    discountPercent: z.number().int().min(1).max(100),
    maxDiscountCents: z.number().int().positive().optional()
  }),
  z.object({
    ...baseDefinitionShape,
    rewardType: z.literal(PromotionRewardType.SPEND_THRESHOLD),
    discountCents: z.number().int().positive(),
    minimumSpendCents: z.number().int().positive()
  })
]);
const actorSchema = z.object({
  organizationId: identifierSchema,
  actorUserId: identifierSchema
});
const promotionIdentitySchema = actorSchema.extend({
  promotionId: identifierSchema
});
const lifecycleInputSchema = promotionIdentitySchema
  .extend({
    reason: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

type ActorInput = z.infer<typeof actorSchema>;

export type CreateManagedPromotionInput = ActorInput & PromotionDefinitionInput;

export type EditManagedPromotionInput = ActorInput &
  PromotionDefinitionInput & {
    promotionId: string;
  };

export type PromotionLifecycleManagementInput = ActorInput & {
  promotionId: string;
  reason?: string;
};

type PromotionWithBranches = Prisma.PromotionGetPayload<{
  include: { branches: { select: { branchId: true } } };
}>;

type PromotionAuthorizationContext = ActorInput & {
  role: MembershipRole;
  auditBranchId: string | null;
};

export class PromotionNotEditableError extends Error {
  constructor() {
    super("Promotion can no longer be edited.");
    this.name = "PromotionNotEditableError";
  }
}

function parseDefinition(input: PromotionDefinitionInput) {
  return promotionDefinitionSchema.parse(input) as PromotionDefinitionInput;
}

function promotionTarget(promotion: PromotionWithBranches) {
  return {
    appliesToAllBranches: promotion.appliesToAllBranches,
    branchIds: promotion.branches.map(({ branchId }) => branchId)
  };
}

async function authorizeTarget(
  db: PromotionPersistence,
  actor: ActorInput,
  target: { appliesToAllBranches: boolean; branchIds: string[] }
): Promise<PromotionAuthorizationContext> {
  const authorization = createPrismaAuthorizationGuard(db);

  try {
    const owner = await authorization.requireOrganizationPermission({
      organizationId: actor.organizationId,
      userId: actor.actorUserId,
      permission: Permission.PROMOTION_MANAGE
    });

    return {
      ...actor,
      role: owner.role,
      auditBranchId: null
    };
  } catch (error) {
    if (!(error instanceof AuthorizationDeniedError)) {
      throw error;
    }
  }

  if (target.appliesToAllBranches || target.branchIds.length === 0) {
    throw new AuthorizationDeniedError();
  }

  let role: MembershipRole | null = null;
  for (const branchId of target.branchIds) {
    const branchContext = await authorization.requireBranchPermission({
      organizationId: actor.organizationId,
      branchId,
      userId: actor.actorUserId,
      permission: Permission.PROMOTION_MANAGE
    });
    role = role ?? branchContext.role;
  }

  return {
    ...actor,
    role: role ?? MembershipRole.MANAGER,
    auditBranchId: target.branchIds.length === 1 ? target.branchIds[0] : null
  };
}

function snapshotPromotion(promotion: PromotionWithBranches) {
  return {
    id: promotion.id,
    name: promotion.name,
    description: promotion.description,
    status: promotion.status,
    rewardType: promotion.rewardType,
    discountCents: promotion.discountCents,
    discountPercent: promotion.discountPercent,
    maxDiscountCents: promotion.maxDiscountCents,
    minimumSpendCents: promotion.minimumSpendCents,
    validFrom: promotion.validFrom?.toISOString() ?? null,
    validUntil: promotion.validUntil?.toISOString() ?? null,
    appliesToAllBranches: promotion.appliesToAllBranches,
    branchIds: promotion.branches.map(({ branchId }) => branchId).sort()
  };
}

async function loadPromotion(
  db: PromotionPersistence,
  input: { organizationId: string; promotionId: string }
) {
  const promotion = await db.promotion.findUnique({
    where: {
      id_organizationId: {
        id: input.promotionId,
        organizationId: input.organizationId
      }
    },
    include: {
      branches: {
        select: { branchId: true },
        orderBy: { branchId: "asc" }
      }
    }
  });

  if (!promotion) {
    throw new PromotionUnavailableError();
  }

  return promotion;
}

async function recordPromotionAudit(
  db: PromotionPersistence,
  input: {
    context: PromotionAuthorizationContext;
    action: string;
    promotion: PromotionWithBranches;
    before?: ReturnType<typeof snapshotPromotion>;
    reason?: string;
  }
) {
  return db.auditLog.create({
    data: {
      organizationId: input.context.organizationId,
      branchId: input.context.auditBranchId,
      actorUserId: input.context.actorUserId,
      actorRole: input.context.role,
      action: input.action,
      entityType: "Promotion",
      entityId: input.promotion.id,
      promotionId: input.promotion.id,
      reason: input.reason,
      beforeJson: input.before as Prisma.InputJsonValue | undefined,
      afterJson: snapshotPromotion(input.promotion),
      metadataJson: {
        source: "promotion-management-service"
      }
    }
  });
}

const editableStatuses = new Set<PromotionStatus>([
  PromotionStatus.DRAFT,
  PromotionStatus.SCHEDULED,
  PromotionStatus.ACTIVE,
  PromotionStatus.PAUSED
]);

export function createPromotionManagementService(db: PrismaClient) {
  return {
    async create(input: CreateManagedPromotionInput) {
      const { organizationId, actorUserId } = actorSchema.parse(input);
      const definition = parseDefinition(input);
      const branchIds = normalizeBranchTargets(definition);

      return db.$transaction(async (transaction) => {
        const context = await authorizeTarget(
          transaction,
          { organizationId, actorUserId },
          {
            appliesToAllBranches: definition.appliesToAllBranches,
            branchIds
          }
        );
        const promotion = await createPromotionRecord(transaction, {
          ...definition,
          organizationId,
          createdByUserId: actorUserId
        });
        await recordPromotionAudit(transaction, {
          context,
          action: "PROMOTION_CREATED",
          promotion
        });
        return promotion;
      });
    },

    async edit(input: EditManagedPromotionInput) {
      const { organizationId, actorUserId, promotionId } = promotionIdentitySchema.parse(input);
      const definition = parseDefinition(input);
      const branchIds = normalizeBranchTargets(definition);

      return db.$transaction(async (transaction) => {
        const existing = await loadPromotion(transaction, { organizationId, promotionId });
        const existingTarget = promotionTarget(existing);
        const existingContext = await authorizeTarget(
          transaction,
          { organizationId, actorUserId },
          existingTarget
        );
        const nextContext = await authorizeTarget(
          transaction,
          { organizationId, actorUserId },
          {
            appliesToAllBranches: definition.appliesToAllBranches,
            branchIds
          }
        );

        if (!editableStatuses.has(existing.status)) {
          throw new PromotionNotEditableError();
        }

        await requireAvailablePromotionBranches(transaction, {
          organizationId,
          branchIds
        });

        const update = await transaction.promotion.updateMany({
          where: {
            id: promotionId,
            organizationId,
            status: existing.status
          },
          data: promotionDefinitionData(definition)
        });

        if (update.count !== 1) {
          throw new PromotionNotEditableError();
        }

        await transaction.promotionBranch.deleteMany({
          where: { organizationId, promotionId }
        });
        if (branchIds.length > 0) {
          await transaction.promotionBranch.createMany({
            data: branchIds.map((branchId) => ({ organizationId, promotionId, branchId }))
          });
        }

        const promotion = await loadPromotion(transaction, { organizationId, promotionId });
        await recordPromotionAudit(transaction, {
          context: {
            ...nextContext,
            auditBranchId:
              existingContext.auditBranchId === nextContext.auditBranchId
                ? existingContext.auditBranchId
                : null
          },
          action: "PROMOTION_UPDATED",
          promotion,
          before: snapshotPromotion(existing)
        });
        return promotion;
      });
    },

    async pause(input: PromotionLifecycleManagementInput) {
      return changeStatus(input, PromotionStatus.PAUSED, "PROMOTION_PAUSED");
    },

    async archive(input: PromotionLifecycleManagementInput) {
      return changeStatus(input, PromotionStatus.ARCHIVED, "PROMOTION_ARCHIVED");
    }
  };

  async function changeStatus(
    input: PromotionLifecycleManagementInput,
    status: PromotionStatus,
    action: string
  ) {
    const parsedInput = lifecycleInputSchema.parse(input);

    return db.$transaction(async (transaction) => {
      const existing = await loadPromotion(transaction, parsedInput);
      const context = await authorizeTarget(
        transaction,
        {
          organizationId: parsedInput.organizationId,
          actorUserId: parsedInput.actorUserId
        },
        promotionTarget(existing)
      );
      await transitionPromotionStatus(transaction, {
        organizationId: parsedInput.organizationId,
        promotionId: parsedInput.promotionId,
        status
      });
      const promotion = await loadPromotion(transaction, parsedInput);
      await recordPromotionAudit(transaction, {
        context,
        action,
        promotion,
        before: snapshotPromotion(existing),
        reason: parsedInput.reason
      });
      return promotion;
    });
  }
}
