"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import { createPrismaAuthorizationGuard } from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";
import {
  createRedemptionVoidService,
  RedemptionVoidConflictError,
  RedemptionVoidUnavailableError
} from "@/server/redemptions/void";

export type VoidFormState = { error: string | null; success: string | null };
type Context = { organizationId: string; branchId: string; redemptionId: string };

export async function voidRedemptionAction(
  context: Context,
  _state: VoidFormState,
  data: FormData
): Promise<VoidFormState> {
  try {
    const session = await getCurrentEmployeeSession();
    if (!session) return { error: "Sign in before voiding a redemption.", success: null };
    await createPrismaAuthorizationGuard(prisma).requireBranchPermission({
      organizationId: context.organizationId,
      branchId: context.branchId,
      userId: session.user.id,
      permission: Permission.REDEMPTION_VOID
    });
    if (data.get("confirm") !== "void") {
      return { error: "Confirm that this redemption should be voided.", success: null };
    }
    const redemption = await prisma.redemption.findFirst({
      where: {
        id: context.redemptionId,
        organizationId: context.organizationId,
        branchId: context.branchId
      },
      select: { id: true }
    });
    if (!redemption) throw new RedemptionVoidUnavailableError();

    const reason = data.get("reason");
    await createRedemptionVoidService(prisma).voidRedemption({
      organizationId: context.organizationId,
      redemptionId: context.redemptionId,
      actorUserId: session.user.id,
      reason: typeof reason === "string" ? reason : ""
    });
    revalidatePath(`/app/${context.organizationId}/${context.branchId}/manager/redemptions`);
    revalidatePath(`/app/${context.organizationId}/${context.branchId}/manager`);
    revalidatePath(`/app/${context.organizationId}/${context.branchId}/owner`);
    return { error: null, success: "Redemption voided. Its history is preserved." };
  } catch (error) {
    if (error instanceof RedemptionVoidConflictError)
      return {
        error: "This redemption was already voided or changed. Refresh the page.",
        success: null
      };
    if (error instanceof RedemptionVoidUnavailableError)
      return { error: "Redemption is unavailable in this branch.", success: null };
    if (error instanceof ZodError)
      return { error: error.issues[0]?.message ?? "Enter a void reason.", success: null };
    return {
      error: "You cannot void this redemption. Check your access and try again.",
      success: null
    };
  }
}
