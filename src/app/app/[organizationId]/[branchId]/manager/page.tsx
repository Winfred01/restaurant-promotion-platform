import Link from "next/link";
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
        This route is restricted to authorized Managers and Owners. Promotion management is
        available; branch analytics are planned.
      </p>
      <Link
        className="mt-6 inline-block rounded-lg bg-teal-800 px-4 py-2 font-semibold text-white"
        href={`/app/${organizationId}/${branchId}/manager/promotions`}
      >
        Manage promotions
      </Link>
    </>
  );
}
