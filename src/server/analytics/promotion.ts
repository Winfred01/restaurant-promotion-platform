import { Prisma, RedemptionStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";

export const PROMOTION_LINKED_SALES_LABEL = "Promotion-linked sales";

const identifierSchema = z.string().trim().min(1).max(191);
const analyticsInputSchema = z
  .object({
    organizationId: identifierSchema,
    actorUserId: identifierSchema,
    branchId: identifierSchema.optional()
  })
  .strict();

export type PromotionAnalyticsInput = z.infer<typeof analyticsInputSchema>;

export function redemptionRateBasisPoints(redemptionCount: number, claimCount: number) {
  if (claimCount === 0) {
    return null;
  }

  return Math.round((redemptionCount * 10_000) / claimCount);
}

export function createPromotionAnalyticsService(db: PrismaClient) {
  return {
    async report(input: PromotionAnalyticsInput) {
      const parsedInput = analyticsInputSchema.parse(input);

      return db.$transaction(
        async (transaction) => {
          const authorization = createPrismaAuthorizationGuard(transaction);
          if (parsedInput.branchId) {
            await authorization.requireBranchPermission({
              organizationId: parsedInput.organizationId,
              branchId: parsedInput.branchId,
              userId: parsedInput.actorUserId,
              permission: Permission.BRANCH_ANALYTICS_VIEW
            });
          } else {
            await authorization.requireOrganizationPermission({
              organizationId: parsedInput.organizationId,
              userId: parsedInput.actorUserId,
              permission: Permission.ORGANIZATION_ANALYTICS_VIEW
            });
          }

          const promotions = await transaction.promotion.findMany({
            where: {
              organizationId: parsedInput.organizationId,
              ...(parsedInput.branchId
                ? {
                    OR: [
                      { appliesToAllBranches: true },
                      {
                        branches: {
                          some: {
                            organizationId: parsedInput.organizationId,
                            branchId: parsedInput.branchId
                          }
                        }
                      }
                    ]
                  }
                : {})
            },
            select: {
              id: true,
              name: true,
              status: true
            },
            orderBy: [{ name: "asc" }, { id: "asc" }]
          });
          const promotionIds = promotions.map(({ id }) => id);

          if (promotionIds.length === 0) {
            return {
              terminology: PROMOTION_LINKED_SALES_LABEL,
              scope: {
                organizationId: parsedInput.organizationId,
                branchId: parsedInput.branchId ?? null
              },
              promotions: []
            };
          }

          const branchFilter = parsedInput.branchId ? { branchId: parsedInput.branchId } : {};
          const [claimGroups, redemptionGroups, uniqueCustomerGroups] = await Promise.all([
            transaction.customerPromotionClaim.groupBy({
              by: ["promotionId"],
              where: {
                organizationId: parsedInput.organizationId,
                promotionId: { in: promotionIds },
                ...branchFilter
              },
              _count: { _all: true }
            }),
            transaction.redemption.groupBy({
              by: ["promotionId"],
              where: {
                organizationId: parsedInput.organizationId,
                promotionId: { in: promotionIds },
                status: RedemptionStatus.COMPLETED,
                ...branchFilter
              },
              _count: {
                _all: true,
                billSubtotalCents: true
              },
              _sum: {
                billSubtotalCents: true,
                discountCents: true,
                netBillCents: true
              }
            }),
            transaction.redemption.groupBy({
              by: ["promotionId", "customerId"],
              where: {
                organizationId: parsedInput.organizationId,
                promotionId: { in: promotionIds },
                status: RedemptionStatus.COMPLETED,
                ...branchFilter
              }
            })
          ]);

          const claimsByPromotion = new Map(
            claimGroups.map((group) => [group.promotionId, group._count._all])
          );
          const redemptionsByPromotion = new Map(
            redemptionGroups.map((group) => [group.promotionId, group])
          );
          const uniqueCustomersByPromotion = new Map<string, number>();
          for (const group of uniqueCustomerGroups) {
            uniqueCustomersByPromotion.set(
              group.promotionId,
              (uniqueCustomersByPromotion.get(group.promotionId) ?? 0) + 1
            );
          }

          return {
            terminology: PROMOTION_LINKED_SALES_LABEL,
            scope: {
              organizationId: parsedInput.organizationId,
              branchId: parsedInput.branchId ?? null
            },
            promotions: promotions.map((promotion) => {
              const claimCount = claimsByPromotion.get(promotion.id) ?? 0;
              const redemption = redemptionsByPromotion.get(promotion.id);
              const redemptionCount = redemption?._count._all ?? 0;
              const redemptionsWithBillAmounts = redemption?._count.billSubtotalCents ?? 0;
              const grossBillCents = redemption?._sum.billSubtotalCents ?? 0;

              return {
                promotionId: promotion.id,
                promotionName: promotion.name,
                promotionStatus: promotion.status,
                claimCount,
                redemptionCount,
                redemptionRateBasisPoints: redemptionRateBasisPoints(redemptionCount, claimCount),
                grossBillCents,
                totalDiscountCents: redemption?._sum.discountCents ?? 0,
                netBillCents: redemption?._sum.netBillCents ?? 0,
                averageBillCents:
                  redemptionsWithBillAmounts === 0
                    ? null
                    : Math.round(grossBillCents / redemptionsWithBillAmounts),
                redemptionsWithBillAmounts,
                uniqueCustomers: uniqueCustomersByPromotion.get(promotion.id) ?? 0
              };
            })
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
      );
    }
  };
}
