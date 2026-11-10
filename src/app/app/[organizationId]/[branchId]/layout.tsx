import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MembershipRole } from "@prisma/client";

import { signOut } from "@/auth";
import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";
import { workspaceLinks } from "@/server/workspace/navigation";
import { SessionTransitionForm } from "@/app/session-transition-form";
import { WorkspaceFrame, WorkspaceNavigationLink } from "./workspace-frame";

type WorkspaceParams = Promise<{ organizationId: string; branchId: string }>;

export default async function BranchLayout({
  children,
  params
}: Readonly<{ children: React.ReactNode; params: WorkspaceParams }>) {
  const session = await getCurrentEmployeeSession();
  if (!session) redirect("/login");

  const { organizationId, branchId } = await params;
  const guard = createPrismaAuthorizationGuard(prisma);
  let role;

  try {
    ({ role } = await guard.requireBranchPermission({
      organizationId,
      branchId,
      userId: session.user.id,
      permission: Permission.CUSTOMER_LOOKUP
    }));
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, organizationId, status: "ACTIVE", organization: { status: "ACTIVE" } },
    select: { name: true, organization: { select: { name: true } } }
  });
  if (!branch) notFound();

  const basePath = `/app/${organizationId}/${branchId}`;

  return (
    <WorkspaceFrame
      organizationName={branch.organization.name}
      branchName={branch.name}
      role={role}
      guidedDemo={Boolean(session.user.demoLeaseId)}
      navigation={
        <nav aria-label="Workspace" className="mt-8 flex flex-wrap gap-2 lg:flex-col">
          {workspaceLinks(basePath, role).map((link) => (
            <WorkspaceNavigationLink href={link.href} key={link.href}>
              {link.label}
            </WorkspaceNavigationLink>
          ))}
        </nav>
      }
      accountActions={
        <>
          <Link className="mt-8 block text-sm text-teal-800 underline" href="/app">
            Change branch
          </Link>
          <SessionTransitionForm
            action={async () => {
              "use server";
              await signOut({ redirectTo: session.user.demoLeaseId ? "/demo" : "/login" });
            }}
            className="mt-5"
          >
            <button className="text-sm text-slate-600 underline" type="submit">
              Sign out
            </button>
          </SessionTransitionForm>
        </>
      }
    >
      {session.user.demoLeaseId ? (
        <details className="mb-8 bg-teal-950 p-5 text-white" open>
          <summary className="cursor-pointer font-semibold">Guided demo: {role} next steps</summary>
          {role === MembershipRole.STAFF ? (
            <p className="mt-3 text-sm leading-6">
              Open{" "}
              <Link className="underline" href={`${basePath}/checkout`}>
                Staff checkout
              </Link>
              . Look up (416) 555-0103, compare Best Deal, then use a new receipt to redeem. Create
              another fictional customer to see one-time acquisition channel capture.
            </p>
          ) : role === MembershipRole.MANAGER ? (
            <p className="mt-3 text-sm leading-6">
              Start in{" "}
              <Link className="underline" href={`${basePath}/manager/promotions`}>
                Promotions
              </Link>
              , then try checkout and review{" "}
              <Link className="underline" href={`${basePath}/manager/redemptions`}>
                redemption history and void
              </Link>
              . The branch dashboard shows promotion-linked sales and discounts.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6">
              Inspect both branches, then open{" "}
              <Link className="underline" href={`${basePath}/owner`}>
                organization analytics
              </Link>
              . Manage promotions, try checkout and Best Deal, and review voided history.
              Acquisition channels and promotion results are separate reports.
            </p>
          )}
        </details>
      ) : null}
      {children}
    </WorkspaceFrame>
  );
}
