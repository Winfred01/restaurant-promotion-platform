"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";
import {
  createPromotionManagementService,
  PromotionNotEditableError
} from "@/server/promotions/management";
import {
  InvalidPromotionTransitionError,
  PromotionTargetingError,
  PromotionUnavailableError,
  PromotionValidationError
} from "@/server/promotions/lifecycle";
import { parsePromotionForm } from "./form-input";

export type PromotionFormState = { error: string | null; success: string | null };

type Context = { organizationId: string; branchId: string; promotionId?: string };

function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function message(error: unknown) {
  if (error instanceof Error && error.message === "Sign in before managing promotions.") {
    return error.message;
  }
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Check promotion fields.";
  if (
    error instanceof PromotionValidationError ||
    error instanceof PromotionTargetingError ||
    error instanceof PromotionNotEditableError ||
    error instanceof InvalidPromotionTransitionError
  )
    return error.message;
  if (error instanceof PromotionUnavailableError) return "Promotion is unavailable.";
  if (
    error instanceof Error &&
    /^(Discount|Maximum discount|Minimum spend|Percentage|Enter valid|Choose a supported)/.test(
      error.message
    )
  ) {
    return error.message;
  }
  return "This change could not be saved. Check your access and try again.";
}

async function actor(context: Context) {
  const session = await getCurrentEmployeeSession();
  if (!session) throw new Error("Sign in before managing promotions.");
  await createPrismaAuthorizationGuard(prisma).requireBranchPermission({
    organizationId: context.organizationId,
    branchId: context.branchId,
    userId: session.user.id,
    permission: Permission.PROMOTION_MANAGE
  });
  return session.user.id;
}

export async function savePromotion(
  context: Context,
  _state: PromotionFormState,
  data: FormData
): Promise<PromotionFormState> {
  try {
    const actorUserId = await actor(context);
    const definition = parsePromotionForm(data);
    const service = createPromotionManagementService(prisma);
    if (context.promotionId) {
      await service.edit({
        ...definition,
        ...context,
        actorUserId,
        promotionId: context.promotionId
      });
    } else {
      await service.create({ ...definition, organizationId: context.organizationId, actorUserId });
    }
    revalidatePath(`/app/${context.organizationId}/${context.branchId}/manager/promotions`);
    return {
      error: null,
      success: context.promotionId ? "Promotion updated." : "Draft created. Activate it when ready."
    };
  } catch (error) {
    return { error: message(error), success: null };
  }
}

export async function changePromotionStatus(
  context: Context,
  _state: PromotionFormState,
  data: FormData
): Promise<PromotionFormState> {
  try {
    const actorUserId = await actor(context);
    if (!context.promotionId) throw new PromotionUnavailableError();
    const input = {
      organizationId: context.organizationId,
      actorUserId,
      promotionId: context.promotionId
    };
    const service = createPromotionManagementService(prisma);
    const action = field(data, "action");
    if (action === "activate") await service.activate(input);
    else if (action === "pause") await service.pause(input);
    else if (action === "archive") await service.archive(input);
    else throw new Error("Unsupported action.");
    revalidatePath(`/app/${context.organizationId}/${context.branchId}/manager/promotions`);
    return { error: null, success: "Promotion status updated." };
  } catch (error) {
    return { error: message(error), success: null };
  }
}
