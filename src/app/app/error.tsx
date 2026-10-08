"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Workspace unavailable</h1>
      <p className="mt-3 text-slate-600">We could not load your workspace. Try again.</p>
      <button className="mt-6 rounded-xl bg-teal-800 px-5 py-3 text-white" onClick={reset}>
        Retry
      </button>
    </main>
  );
}
