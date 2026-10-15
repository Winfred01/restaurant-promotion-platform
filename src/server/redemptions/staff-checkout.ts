import { PromotionStatus, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
  getCurrentEmployeeSession,
  requireEmployeeSession,
  type EmployeeSession
} from "@/server/auth/session";
import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import {
  createPromotionEligibilityService,
  PromotionEligibilityUnavailableError
} from "@/server/promotions/eligibility";
import { createCheckoutRedemptionService } from "./checkout";

const id = z.string().trim().min(1).max(191);
const context = z.object({ organizationId: id, branchId: id, customerId: id }).strict();
const subtotal = z.number().int().positive().max(2_147_483_647);
const quoteInput = context.extend({ billSubtotalCents: subtotal }).strict();
const redeemInput = quoteInput
  .extend({
    promotionId: id,
    receiptNumber: z.string().trim().min(1).max(80)
  })
  .strict();

export type StaffCheckoutWorkflow = {
  quote(input: unknown): Promise<{
    offers: {
      promotionId: string;
      name: string;
      eligible: boolean;
      reasonCodes: string[];
      discountCents: number;
      finalBillCents: number;
      isBestDeal: boolean;
    }[];
  }>;
  redeem(input: unknown): Promise<{
    id: string;
    receiptNumber: string;
    billSubtotalCents: number;
    discountCents: number;
    netBillCents: number;
  }>;
};

export function createStaffCheckoutWorkflow(
  db: PrismaClient,
  loadSession: () => Promise<EmployeeSession | null> = getCurrentEmployeeSession
): StaffCheckoutWorkflow {
  const guard = createPrismaAuthorizationGuard(db);

  return {
    async quote(input) {
      const session = await requireEmployeeSession(loadSession);
      const parsed = quoteInput.parse(input);
      await guard.requireBranchPermission({
        organizationId: parsed.organizationId,
        branchId: parsed.branchId,
        userId: session.user.id,
        permission: Permission.PROMOTION_ELIGIBILITY_VIEW
      });

      const customer = await db.customer.findUnique({
        where: {
          id_organizationId: {
            id: parsed.customerId,
            organizationId: parsed.organizationId
          }
        },
        select: { id: true }
      });
      if (!customer) throw new PromotionEligibilityUnavailableError();

      const promotions = await db.promotion.findMany({
        where: {
          organizationId: parsed.organizationId,
          status: PromotionStatus.ACTIVE,
          OR: [
            { appliesToAllBranches: true },
            {
              branches: {
                some: { branchId: parsed.branchId, organizationId: parsed.organizationId }
              }
            }
          ]
        },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 101
      });

      if (promotions.length > 100) throw new PromotionEligibilityUnavailableError();
      if (promotions.length === 0) return { offers: [] };

      const evaluations = await createPromotionEligibilityService(db).evaluate({
        ...parsed,
        actorUserId: session.user.id,
        candidates: promotions.map(({ id: promotionId }) => ({ promotionId }))
      });
      const names = new Map(promotions.map(({ id: promotionId, name }) => [promotionId, name]));

      return {
        offers: evaluations.map((result) => ({
          ...result,
          name: names.get(result.promotionId) ?? "Promotion"
        }))
      };
    },

    async redeem(input) {
      const session = await requireEmployeeSession(loadSession);
      const parsed = redeemInput.parse(input);
      await guard.requireBranchPermission({
        organizationId: parsed.organizationId,
        branchId: parsed.branchId,
        userId: session.user.id,
        permission: Permission.REDEMPTION_CREATE
      });

      const redemption = await createCheckoutRedemptionService(db).create({
        ...parsed,
        actorUserId: session.user.id
      });
      return {
        id: redemption.id,
        receiptNumber: redemption.receiptNumber!,
        billSubtotalCents: redemption.billSubtotalCents!,
        discountCents: redemption.discountCents!,
        netBillCents: redemption.netBillCents!
      };
    }
  };
}
