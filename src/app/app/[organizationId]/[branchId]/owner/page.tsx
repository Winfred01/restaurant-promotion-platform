import { notFound, redirect } from "next/navigation";

import { createAcquisitionAnalyticsService } from "@/server/analytics/acquisition";
import { createPromotionAnalyticsService } from "@/server/analytics/promotion";
import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";

import { Dashboard } from "../dashboard";

export default async function OwnerAreaPage({
  params
}: {
  params: Promise<{ organizationId: string; branchId: string }>;
}) {
  const session = await getCurrentEmployeeSession();
  if (!session) redirect("/login");

  const { organizationId, branchId } = await params;
  try {
    await createPrismaAuthorizationGuard(prisma).requireOrganizationPermission({
      organizationId,
      userId: session.user.id,
      permission: Permission.ORGANIZATION_ANALYTICS_VIEW
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  const [report, acquisition] = await Promise.all([
    createPromotionAnalyticsService(prisma).report({
      organizationId,
      actorUserId: session.user.id
    }),
    createAcquisitionAnalyticsService(prisma).report({
      organizationId,
      actorUserId: session.user.id
    })
  ]);
  const organization = await prisma.restaurantOrganization.findUnique({
    where: { id: organizationId },
    select: { currency: true }
  });
  if (!organization) notFound();

  return (
    <Dashboard
      scope="organization"
      report={report}
      acquisition={acquisition}
      currency={organization.currency}
      basePath={`/app/${organizationId}/${branchId}`}
    />
  );
}
