"use client";

import { useActionState } from "react";

import type { BranchFormState } from "./actions";

type Action = (state: BranchFormState, data: FormData) => Promise<BranchFormState>;
const initial: BranchFormState = { error: null, success: null };

export function BranchForm({
  action,
  branch
}: {
  action: Action;
  branch?: { name: string; timezone: string };
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-sm font-medium text-slate-700">
        Branch name
        <input
          className="mt-1 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950"
          defaultValue={branch?.name}
          maxLength={100}
          name="name"
          required
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        IANA timezone
        <input
          className="mt-1 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950"
          defaultValue={branch?.timezone ?? "America/Toronto"}
          maxLength={100}
          name="timezone"
          required
        />
      </label>
      <button
        className="min-h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : branch ? "Save changes" : "Create branch"}
      </button>
      {state.error && (
        <p className="text-sm text-red-700 sm:col-span-3" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-teal-800 sm:col-span-3" role="status">
          {state.success}
        </p>
      )}
    </form>
  );
}

export function ArchiveBranchForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
      <label className="text-sm text-slate-700">
        <input className="mr-2" name="confirm" required type="checkbox" value="archive" />
        Confirm archive
      </label>
      <button
        className="text-sm font-semibold text-red-700 underline disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Archiving…" : "Archive branch"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="w-full text-sm text-teal-800" role="status">
          {state.success}
        </p>
      )}
    </form>
  );
}
