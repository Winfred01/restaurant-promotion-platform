import { notFound, redirect } from "next/navigation";

import { createPromotionAnalyticsService } from "@/server/analytics/promotion";
import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";

import { BranchAnalytics } from "./branch-analytics";
import "./branch-analytics.css";

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
      permission: Permission.BRANCH_ANALYTICS_VIEW
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  const report = await createPromotionAnalyticsService(prisma).report({
    organizationId,
    branchId,
    actorUserId: session.user.id
  });
  const organization = await prisma.restaurantOrganization.findUnique({
    where: { id: organizationId },
    select: { currency: true }
  });
  if (!organization) notFound();

  return (
    <BranchAnalytics
      report={report}
      currency={organization.currency}
      basePath={`/app/${organizationId}/${branchId}`}
    />
  );
}
