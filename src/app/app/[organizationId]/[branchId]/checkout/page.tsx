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

  const channels = await prisma.acquisitionChannel.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
        Staff checkout
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-950">Redeem a promotion</h1>
      <p className="mt-3 max-w-2xl text-slate-700">
        Find the customer, enter the bill, compare eligible offers, then confirm one redemption.
        Best Deal is a suggestion; the final choice is yours.
      </p>
      <CheckoutForm organizationId={organizationId} branchId={branchId} channels={channels} />
    </>
  );
}
