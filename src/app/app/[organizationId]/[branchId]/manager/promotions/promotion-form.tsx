"use client";

import { PromotionRewardType } from "@prisma/client";
import { useActionState, useState } from "react";

import type { PromotionFormState } from "./actions";

type Action = (state: PromotionFormState, data: FormData) => Promise<PromotionFormState>;
type Branch = { id: string; name: string };
export type FormPromotion = {
  name: string;
  description: string;
  rewardType: PromotionRewardType;
  discountCents: number | null;
  discountPercent: number | null;
  maxDiscountCents: number | null;
  minimumSpendCents: number | null;
  validFrom: string;
  validUntil: string;
  appliesToAllBranches: boolean;
  branchIds: string[];
};

const initial: PromotionFormState = { error: null, success: null };
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950";
const money = (value: number | null | undefined) => (value == null ? "" : (value / 100).toFixed(2));

export function PromotionForm({
  action,
  branches,
  promotion,
  owner
}: {
  action: Action;
  branches: Branch[];
  promotion?: FormPromotion;
  owner: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [reward, setReward] = useState<PromotionRewardType>(
    promotion?.rewardType ?? PromotionRewardType.FIXED_AMOUNT
  );
  const [scope, setScope] = useState(promotion?.appliesToAllBranches ? "all" : "selected");

  return (
    <form action={formAction} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">
        Name
        <input
          className={inputClass}
          defaultValue={promotion?.name}
          maxLength={200}
          name="name"
          required
        />
      </label>
      <label className="text-sm font-medium">
        Reward type
        <select
          className={inputClass}
          name="rewardType"
          onChange={(event) => setReward(event.target.value as PromotionRewardType)}
          value={reward}
        >
          <option value={PromotionRewardType.FIXED_AMOUNT}>Fixed amount</option>
          <option value={PromotionRewardType.PERCENTAGE}>Percentage</option>
          <option value={PromotionRewardType.SPEND_THRESHOLD}>Spend threshold</option>
        </select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Description
        <textarea
          className={inputClass}
          defaultValue={promotion?.description}
          maxLength={2000}
          name="description"
          rows={2}
        />
      </label>
      {reward !== PromotionRewardType.PERCENTAGE && (
        <label className="text-sm font-medium">
          Discount ($)
          <input
            className={inputClass}
            defaultValue={money(promotion?.discountCents)}
            min="0.01"
            name="discount"
            required
            step="0.01"
            type="number"
          />
        </label>
      )}
      {reward === PromotionRewardType.PERCENTAGE && (
        <>
          <label className="text-sm font-medium">
            Discount (%)
            <input
              className={inputClass}
              defaultValue={promotion?.discountPercent ?? ""}
              max="100"
              min="1"
              name="percent"
              required
              step="1"
              type="number"
            />
          </label>
          <label className="text-sm font-medium">
            Maximum discount ($, optional)
            <input
              className={inputClass}
              defaultValue={money(promotion?.maxDiscountCents)}
              min="0.01"
              name="maximum"
              step="0.01"
              type="number"
            />
          </label>
        </>
      )}
      {reward === PromotionRewardType.SPEND_THRESHOLD && (
        <label className="text-sm font-medium">
          Minimum spend ($)
          <input
            className={inputClass}
            defaultValue={money(promotion?.minimumSpendCents)}
            min="0.01"
            name="minimum"
            required
            step="0.01"
            type="number"
          />
        </label>
      )}
      <label className="text-sm font-medium">
        Starts (UTC, optional)
        <input
          className={inputClass}
          defaultValue={promotion?.validFrom}
          name="validFrom"
          type="datetime-local"
        />
      </label>
      <label className="text-sm font-medium">
        Ends (UTC, optional)
        <input
          className={inputClass}
          defaultValue={promotion?.validUntil}
          name="validUntil"
          type="datetime-local"
        />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-semibold">Branch targeting</legend>
        {owner && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              checked={scope === "all"}
              name="scope"
              onChange={() => setScope("all")}
              type="radio"
              value="all"
            />
            All branches
          </label>
        )}
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            checked={scope === "selected"}
            name="scope"
            onChange={() => setScope("selected")}
            type="radio"
            value="selected"
          />
          Selected branches
        </label>
        {scope === "selected" && (
          <div className="mt-2 flex flex-wrap gap-4 rounded-lg bg-slate-50 p-3">
            {branches.map((branch) => (
              <label className="flex items-center gap-2 text-sm" key={branch.id}>
                <input
                  defaultChecked={
                    promotion ? promotion.branchIds.includes(branch.id) : branches.length === 1
                  }
                  name="branchIds"
                  type="checkbox"
                  value={branch.id}
                />
                {branch.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="sm:col-span-2">
        {state.error && (
          <p aria-live="polite" className="mb-3 text-sm text-red-700" role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p aria-live="polite" className="mb-3 text-sm text-teal-800">
            {state.success}
          </p>
        )}
        <button
          className="rounded-lg bg-teal-800 px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : promotion ? "Save changes" : "Create draft"}
        </button>
      </div>
    </form>
  );
}

export function PromotionStatusForm({
  action,
  canActivate,
  canPause,
  canArchive
}: {
  action: Action;
  canActivate: boolean;
  canPause: boolean;
  canArchive: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-center gap-2">
      {canActivate && (
        <button
          className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white"
          disabled={pending}
          name="action"
          type="submit"
          value="activate"
        >
          Activate
        </button>
      )}
      {canPause && (
        <button
          className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold text-amber-800"
          disabled={pending}
          name="action"
          type="submit"
          value="pause"
        >
          Pause
        </button>
      )}
      {canArchive && (
        <button
          className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold"
          disabled={pending}
          name="action"
          type="submit"
          value="archive"
        >
          Archive
        </button>
      )}
      {state.error && (
        <p className="w-full text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="w-full text-sm text-teal-800" aria-live="polite">
          {state.success}
        </p>
      )}
    </form>
  );
}
