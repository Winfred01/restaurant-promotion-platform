import { notFound, redirect } from "next/navigation";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";
import { CheckoutForm } from "./checkout-form";

export default async function StaffCheckoutPage({
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
      permission: Permission.REDEMPTION_CREATE
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  const [branch, channels] = await Promise.all([
    prisma.branch.findFirst({
      where: { id: branchId, organizationId, status: "ACTIVE" },
      select: { name: true }
    }),
    prisma.acquisitionChannel.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    })
  ]);
  if (!branch) notFound();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Staff checkout</h1>
      <CheckoutForm
        key={JSON.stringify([organizationId, branchId, session.user.id])}
        organizationId={organizationId}
        branchId={branchId}
        branchName={branch.name}
        employeeId={session.user.id}
        channels={channels}
      />
    </>
  );
}
