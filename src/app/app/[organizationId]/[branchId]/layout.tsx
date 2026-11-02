import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { signOut } from "@/auth";
import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";
import { workspaceLinks } from "@/server/workspace/navigation";
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
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
            className="mt-5"
          >
            <button className="text-sm text-slate-600 underline" type="submit">
              Sign out
            </button>
          </form>
        </>
      }
    >
      {children}
    </WorkspaceFrame>
  );
}
