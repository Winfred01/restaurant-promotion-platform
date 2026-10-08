export default function BranchOverviewPage() {
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
          Customer lookup, claims, checkout, and redemption screens are planned. No transaction can
          be submitted from this workspace yet.
        </p>
      </section>
    </>
  );
}
