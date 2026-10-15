import Link from "next/link";

export default async function BranchOverviewPage({
  params
}: {
  params: Promise<{ organizationId: string; branchId: string }>;
}) {
  const { organizationId, branchId } = await params;
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
        Branch overview
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-950">Ready for your team</h1>
      <p className="mt-4 max-w-2xl text-slate-700">
        You are signed in to an active restaurant branch. Use the navigation to view the areas
        available to your role.
      </p>
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Staff workflow</h2>
        <p className="mt-2 text-slate-600">
          Customer lookup, one-time acquisition channel capture, offer comparison, and checkout
          redemption are available. Claims and other business screens are still being built.
        </p>
        <Link
          className="mt-4 inline-block rounded-lg bg-teal-800 px-4 py-2 font-semibold text-white"
          href={`/app/${organizationId}/${branchId}/checkout`}
        >
          Open Staff checkout
        </Link>
      </section>
    </>
  );
}
