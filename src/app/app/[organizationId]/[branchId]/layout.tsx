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
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-slate-200 bg-white px-6 py-6 lg:min-h-screen lg:border-b-0 lg:border-r">
        <Link className="text-lg font-bold text-teal-900" href="/app">
          Restaurant workspace
        </Link>
        <div className="mt-8 rounded-xl bg-teal-50 p-4 text-sm">
          <p className="font-semibold text-slate-950">{branch.organization.name}</p>
          <p className="mt-1 text-slate-700">{branch.name}</p>
          <p className="mt-2 font-semibold text-teal-800">{role}</p>
        </div>
        <nav aria-label="Workspace" className="mt-8 flex flex-wrap gap-2 lg:flex-col">
          {workspaceLinks(basePath, role).map((link) => (
            <Link
              className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-teal-700"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
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
      </aside>
      <main className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-12">{children}</main>
    </div>
  );
}
