"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import {
  BranchUnavailableError,
  createBranchManagementService,
  LastActiveBranchError
} from "@/server/organizations/management";

export type BranchFormState = { error: string | null; success: string | null };
type Context = { organizationId: string; branchId: string; targetBranchId?: string };

function value(data: FormData, key: string) {
  const item = data.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function message(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check branch fields.";
  if (error instanceof BranchUnavailableError || error instanceof LastActiveBranchError)
    return error.message;
  if (error instanceof Error && error.message === "Enter a valid IANA timezone.")
    return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    return "A branch with this name already exists in this restaurant.";
  return "This branch change could not be saved. Check your access and try again.";
}

async function actor() {
  const session = await getCurrentEmployeeSession();
  if (!session) throw new Error("Sign in before managing branches.");
  return session.user.id;
}

export async function saveBranch(
  context: Context,
  _state: BranchFormState,
  data: FormData
): Promise<BranchFormState> {
  try {
    const actorUserId = await actor();
    const input = {
      organizationId: context.organizationId,
      actorUserId,
      name: value(data, "name"),
      timezone: value(data, "timezone")
    };
    const service = createBranchManagementService(prisma);
    if (context.targetBranchId) {
      await service.edit({ ...input, branchId: context.targetBranchId });
    } else {
      await service.create(input);
    }
    revalidatePath(`/app/${context.organizationId}/${context.branchId}/manager/branches`);
    return { error: null, success: context.targetBranchId ? "Branch updated." : "Branch created." };
  } catch (error) {
    return { error: message(error), success: null };
  }
}

export async function archiveBranch(
  context: Context,
  _state: BranchFormState,
  data: FormData
): Promise<BranchFormState> {
  try {
    if (!context.targetBranchId || value(data, "confirm") !== "archive") {
      return { error: "Confirm the archive action.", success: null };
    }
    const actorUserId = await actor();
    await createBranchManagementService(prisma).archive({
      organizationId: context.organizationId,
      actorUserId,
      branchId: context.targetBranchId
    });
    revalidatePath(`/app/${context.organizationId}/${context.branchId}/manager/branches`);
    revalidatePath("/app");
  } catch (error) {
    return { error: message(error), success: null };
  }
  if (context.targetBranchId === context.branchId) redirect("/app");
  return { error: null, success: "Branch archived. Its history is retained." };
}
