import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { prisma } from "@/server/db";
import { getCurrentEmployeeSession } from "@/server/auth/session";

export default async function DemoPage() {
  const session = await getCurrentEmployeeSession();

  if (!session) {
    redirect("/login");
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      organization: { status: "ACTIVE" }
    },
    select: {
      role: true,
      organization: { select: { id: true, name: true } }
    },
    orderBy: { organization: { name: "asc" } }
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
        Employee access
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-slate-950">Welcome, {session.user.name}</h1>
      <p className="mt-3 text-slate-600">Signed in as {session.user.email}</p>

      {memberships.length > 0 ? (
        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-950">Your restaurant roles</h2>
          <ul className="mt-4 space-y-3">
            {memberships.map((membership) => (
              <li
                className="flex justify-between gap-4 text-slate-700"
                key={membership.organization.id}
              >
                <span>{membership.organization.name}</span>
                <span className="font-semibold text-teal-800">{membership.role}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          This employee does not have an active restaurant membership. Contact an Owner for access.
        </p>
      )}

      <p className="mt-8 text-sm leading-6 text-slate-600">
        Role-aware navigation and business screens are being built. This page confirms employee
        login and current restaurant membership; it does not process claims or redemptions.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        className="mt-8"
      >
        <button
          className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-800 hover:bg-slate-100"
          type="submit"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
