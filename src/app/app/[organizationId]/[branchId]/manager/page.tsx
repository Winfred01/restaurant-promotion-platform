import { notFound, redirect } from "next/navigation";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";

export default async function ManagerAreaPage({
  params
}: {
  params: Promise<{ organizationId: string; branchId: string }>;
}) {
  const session = await getCurrentEmployeeSession();
  if (!session) redirect("/login");

  const { organizationId, branchId } = await params;
  try {
    await createPrismaAuthorizationGuard(prisma).requireBranchPermission({
      organizationId,
      branchId,
      userId: session.user.id,
      permission: Permission.PROMOTION_MANAGE
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Manager area</p>
      <h1 className="mt-3 text-3xl font-semibold">Manager tools</h1>
      <p className="mt-4 max-w-2xl text-slate-700">
        This route is restricted to authorized Managers and Owners. Promotion management and branch
        analytics screens are planned and are not available here yet.
      </p>
    </>
  );
}
