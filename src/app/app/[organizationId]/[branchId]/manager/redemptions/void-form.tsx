"use client";

import { useActionState } from "react";

import type { VoidFormState } from "./actions";

const initial: VoidFormState = { error: null, success: null };

export function VoidForm({
  action
}: {
  action: (state: VoidFormState, data: FormData) => Promise<VoidFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <label className="block text-sm font-medium text-slate-900">
        Reason for void
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          maxLength={1000}
          minLength={1}
          name="reason"
          required
          rows={2}
        />
      </label>
      <label className="mt-2 flex items-start gap-2 text-sm text-slate-800">
        <input className="mt-1" name="confirm" required type="checkbox" value="void" />I confirm
        this redemption is incorrect and should be voided.
      </label>
      {state.error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p aria-live="polite" className="mt-2 text-sm text-teal-800">
          {state.success}
        </p>
      )}
      <button
        className="mt-3 rounded-lg bg-amber-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Voiding…" : "Void redemption"}
      </button>
    </form>
  );
}
