import { MembershipRole } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentEmployeeSession } from "@/server/auth/session";
import {
  AuthorizationDeniedError,
  createPrismaAuthorizationGuard
} from "@/server/authorization/guard";
import { Permission } from "@/server/authorization/permissions";
import { prisma } from "@/server/db";
import { archiveBranch, saveBranch } from "./actions";
import { ArchiveBranchForm, BranchForm } from "./branch-form";

type Params = Promise<{ organizationId: string; branchId: string }>;

export default async function BranchManagementPage({ params }: { params: Params }) {
  const session = await getCurrentEmployeeSession();
  if (!session) redirect("/login");
  const { organizationId, branchId } = await params;
  let role: MembershipRole;
  try {
    ({ role } = await createPrismaAuthorizationGuard(prisma).requireBranchPermission({
      organizationId,
      branchId,
      userId: session.user.id,
      permission: Permission.BRANCH_ANALYTICS_VIEW
    }));
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) notFound();
    throw error;
  }

  const owner = role === MembershipRole.OWNER;
  const branches = await prisma.branch.findMany({
    where: {
      organizationId,
      ...(!owner && {
        branchMemberships: {
          some: {
            userId: session.user.id,
            status: "ACTIVE",
            role: MembershipRole.MANAGER,
            organizationMembership: { status: "ACTIVE", user: { status: "ACTIVE" } }
          }
        }
      })
    },
    select: {
      id: true,
      name: true,
      timezone: true,
      status: true,
      branchMemberships: {
        where: {
          status: "ACTIVE",
          organizationMembership: { status: "ACTIVE", user: { status: "ACTIVE" } }
        },
        select: {
          role: true,
          organizationMembership: { select: { user: { select: { name: true } } } }
        },
        orderBy: { organizationMembership: { user: { name: "asc" } } }
      }
    },
    orderBy: { name: "asc" }
  });

  const context = { organizationId, branchId };
  return (
    <>
      <p className="text-sm font-semibold text-teal-800">Restaurant settings</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-950">Branches</h1>
        <span className="text-sm text-slate-600">{branches.length} in view</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {owner
          ? "All branches in this restaurant. Archive preserves assignments and transaction history."
          : "Branches assigned to you. An Owner manages branch details and status."}
      </p>

      {owner && (
        <section
          className="mt-8 border-t border-slate-200 pt-6"
          aria-labelledby="create-branch-heading"
        >
          <h2 className="text-lg font-semibold" id="create-branch-heading">
            Create a branch
          </h2>
          <BranchForm action={saveBranch.bind(null, context)} />
        </section>
      )}

      <section
        className="mt-8 border-t border-slate-200 pt-6"
        aria-labelledby="branch-list-heading"
      >
        <h2 className="text-lg font-semibold" id="branch-list-heading">
          Branch directory
        </h2>
        {branches.length === 0 && (
          <p className="mt-4 text-sm text-slate-600">No branches are available in your scope.</p>
        )}
        <div className="mt-4 divide-y divide-slate-200">
          {branches.map((branch) => {
            const target = { ...context, targetBranchId: branch.id };
            const staff = branch.branchMemberships.filter(
              ({ role: memberRole }) => memberRole === MembershipRole.STAFF
            );
            return (
              <article className="py-5" key={branch.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">{branch.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{branch.timezone}</p>
                  </div>
                  <span className="text-sm font-medium text-slate-700">{branch.status}</span>
                </div>
                <p className="mt-3 text-sm text-slate-700">
                  {staff.length} Staff{" "}
                  {branch.status === "ACTIVE" ? "assigned" : "assignments on record"}
                  {staff.length
                    ? `: ${staff.map(({ organizationMembership }) => organizationMembership.user.name).join(", ")}`
                    : "."}
                </p>
                {branch.status === "ACTIVE" && (
                  <Link
                    className="mt-2 inline-block text-sm font-semibold text-teal-800 underline"
                    href={`/app/${organizationId}/${branch.id}`}
                  >
                    Open workspace
                  </Link>
                )}
                {owner && branch.status !== "ARCHIVED" && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-teal-800">
                      Edit or archive
                    </summary>
                    <BranchForm action={saveBranch.bind(null, target)} branch={branch} />
                    <ArchiveBranchForm action={archiveBranch.bind(null, target)} />
                  </details>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
