import { notFound, redirect } from "next/navigation";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";

export default async function OwnerAreaPage({
  params
}: {
  params: Promise<{ organizationId: string; branchId: string }>;
}) {
  const session = await getCurrentEmployeeSession();
  if (!session) redirect("/login");

  const { organizationId } = await params;
  try {
    await createPrismaAuthorizationGuard(prisma).requireOrganizationPermission({
      organizationId,
      userId: session.user.id,
      permission: Permission.ORGANIZATION_MANAGE
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Owner area</p>
      <h1 className="mt-3 text-3xl font-semibold">Organization tools</h1>
      <p className="mt-4 max-w-2xl text-slate-700">
        This route is restricted to an active organization Owner. Organization settings, membership
        management, and organization analytics screens are planned.
      </p>
    </>
  );
}
