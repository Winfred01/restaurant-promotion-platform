import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { getCurrentEmployeeSession } from "@/server/auth/session";
import { listAccessibleBranches } from "@/server/workspace/access";

export default async function WorkspaceSelectionPage() {
  const session = await getCurrentEmployeeSession();
  if (!session) redirect("/login");

  const branches = await listAccessibleBranches(session.user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
        Employee workspace
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-slate-950">Choose a branch</h1>
      <p className="mt-3 text-slate-600">Signed in as {session.user.name}</p>
      {branches.length ? (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {branches.map((branch) => (
            <li key={`${branch.organizationId}:${branch.branchId}`}>
              <Link
                className="block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-teal-600 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                href={`/app/${branch.organizationId}/${branch.branchId}`}
              >
                <span className="block text-sm text-slate-600">{branch.organizationName}</span>
                <span className="mt-2 block text-xl font-semibold text-slate-950">
                  {branch.branchName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          No active branch is available for this employee. Contact an Owner for access.
        </p>
      )}
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        className="mt-8"
      >
        <button className="text-sm font-medium text-teal-800 underline" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
