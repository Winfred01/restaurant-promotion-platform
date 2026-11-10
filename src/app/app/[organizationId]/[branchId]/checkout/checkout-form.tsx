"use client";

import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";

import { normalizePhoneNumber } from "@/server/customers/phone";
import {
  CheckoutRequestError,
  checkoutRequest,
  redemptionIssue,
  type Customer,
  type Offer
} from "./checkout-api";
import { CheckoutDialog } from "./checkout-dialog";
import {
  checkoutDraftKey,
  checkoutDraftLifetimeMs,
  readCheckoutDraft,
  type CheckoutDraft,
  type CheckoutStep
} from "./checkout-draft";
import { isValidReceipt, money, parseSubtotalCents } from "./checkout-input";
import styles from "./checkout-wizard.module.css";

const field =
  "mt-2 w-full min-h-11 rounded-md border border-slate-400 bg-white px-3 py-2 text-base text-slate-950";
const primary =
  "min-h-11 rounded-md bg-teal-800 px-4 py-2 font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "min-h-11 rounded-md px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50";
const steps = [
  { number: 1, title: "Confirm customer", short: "Customer" },
  { number: 2, title: "Enter bill", short: "Bill" },
  { number: 3, title: "Choose promotion", short: "Promotion" },
  { number: 4, title: "Confirm redemption", short: "Confirm" }
] as const;

type Alert = NonNullable<ReturnType<typeof redemptionIssue>> | "discard";

function phoneSuffix(value: string) {
  return value.replace(/\D/g, "").slice(-4);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof CheckoutRequestError ? error.message : fallback;
}

export function CheckoutForm({
  organizationId,
  branchId,
  branchName,
  employeeId,
  channels
}: {
  organizationId: string;
  branchId: string;
  branchName: string;
  employeeId: string;
  channels: { id: string; name: string }[];
}) {
  const key = checkoutDraftKey(organizationId, branchId, employeeId);
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [open, setOpen] = useState(false);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState("");
  const [alert, setAlert] = useState<Alert | null>(null);
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const request = useRef<AbortController | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const returnToPhone = useRef(false);

  const eligible = offers?.filter((offer) => offer.eligible) ?? [];
  const selectedOffer = eligible.find((offer) => offer.promotionId === draft?.selected);
  const step = draft?.step ?? 1;

  function persist(next: CheckoutDraft) {
    const saved = { ...next, expiresAt: Date.now() + checkoutDraftLifetimeMs };
    setDraft(saved);
    try {
      sessionStorage.setItem(key, JSON.stringify(saved));
      return true;
    } catch {
      return false;
    }
  }

  function showToast(message: string) {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(message);
    toastTimeout.current = setTimeout(() => setToast(""), 2000);
  }

  async function run(
    task: (signal: AbortSignal) => Promise<void>,
    onError: (cause: unknown) => void
  ) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setBusy(true);
    try {
      await task(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) onError(cause);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  async function lookupCustomer(number: string, signal: AbortSignal) {
    const result = await checkoutRequest<{ customer: Customer | null }>(
      "/api/staff/customers",
      signal,
      { action: "lookup", organizationId, branchId, phoneNumber: number }
    );
    return result.customer;
  }

  async function getOffers(
    next: CheckoutDraft,
    currentCustomer: Customer,
    billSubtotalCents: number,
    signal: AbortSignal
  ) {
    const result = await checkoutRequest<{ offers: Offer[] }>("/api/staff/checkout", signal, {
      action: "quote",
      organizationId,
      branchId,
      customerId: currentCustomer.id,
      billSubtotalCents
    });
    const retained = result.offers.some(
      (offer) => offer.eligible && offer.promotionId === next.selected
    );
    setOffers(result.offers);
    persist({
      ...next,
      step: next.step === 4 && retained ? 4 : 3,
      selected: retained ? next.selected : ""
    });
  }

  async function openCheckout(number: string, saved: CheckoutDraft | null, signal: AbortSignal) {
    if (saved?.redemptionPending) {
      setDraft({ ...saved, step: 2 });
      setOffers(null);
      setOpen(true);
      setNotice("");
      return;
    }
    const found = await lookupCustomer(number, signal);
    const samePhone = saved?.phone === number;
    const next: CheckoutDraft = {
      phone: number,
      step: found && samePhone ? saved.step : 1,
      channelId:
        !found && samePhone && channels.some(({ id }) => id === saved.channelId)
          ? saved.channelId
          : "",
      subtotal: saved?.subtotal ?? "",
      receipt: saved?.receipt ?? "",
      selected: found && samePhone ? saved.selected : "",
      expiresAt: 0
    };
    const subtotal = parseSubtotalCents(next.subtotal);
    setCustomer(found ? { id: found.id } : null);
    setOffers(null);
    setOpen(true);
    setNotice("");
    if (found && next.step >= 3 && subtotal !== null && isValidReceipt(next.receipt)) {
      persist({ ...next, step: 3 });
      await getOffers(next, found, subtotal, signal);
    } else {
      persist({ ...next, step: next.step >= 3 ? 2 : next.step });
    }
  }

  const restore = useEffectEvent(() => {
    let saved: CheckoutDraft | null;
    try {
      saved = readCheckoutDraft(sessionStorage, key);
    } catch {
      return;
    }
    if (!saved) return;
    setPhone(saved.phone);
    setDraft(saved);
    void run(
      (signal) => openCheckout(saved.phone, saved, signal),
      (cause) => setError(errorMessage(cause, "The draft could not be verified. Try again."))
    );
  });

  useEffect(() => {
    const timer = setTimeout(() => restore(), 0);
    return () => {
      clearTimeout(timer);
      request.current?.abort();
      request.current = null;
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, [key]);

  const expireDraft = useEffectEvent(() => {
    if (request.current) return;
    resetCheckout();
    setNotice("The checkout draft expired.");
  });

  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => expireDraft(), Math.max(0, draft.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [draft, busy]);

  useEffect(() => {
    if (open && !alert) stepHeading.current?.focus();
    if (!open && !busy && returnToPhone.current) {
      returnToPhone.current = false;
      phoneInput.current?.focus();
    }
  }, [open, step, alert, busy]);

  function findCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = draft && draft.expiresAt > Date.now() ? draft : null;
    let number: string;
    try {
      number = saved?.redemptionPending ? saved.phone : normalizePhoneNumber(phone);
    } catch {
      setError("Enter a valid phone number, including the country code for international numbers.");
      return;
    }
    void run(
      (signal) => openCheckout(number, saved, signal),
      (cause) => setError(errorMessage(cause, "Customer lookup failed. Try again."))
    );
  }

  function goTo(nextStep: CheckoutStep) {
    if (!draft || draft.redemptionPending) return;
    setError("");
    persist({ ...draft, step: nextStep });
  }

  function closeWizard(changePhone = false) {
    if (!draft || request.current || alert) return;
    const saved = persist(draft);
    setPhone(draft.phone);
    setError("");
    setNotice(
      draft.redemptionPending
        ? "Redemption outcome unknown. Reopen checkout to review the receipt."
        : changePhone
          ? "Enter a different phone number to change the customer and keep the bill details."
          : saved
            ? "Draft saved in this tab for 30 minutes. Find the customer again to resume."
            : "Draft kept while this page is open. Browser storage is unavailable."
    );
    returnToPhone.current = true;
    setOpen(false);
  }

  function resetCheckout() {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // A blocked storage API cannot be used to restore a draft.
    }
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast("");
    setOpen(false);
    setPhone("");
    setCustomer(null);
    setDraft(null);
    setOffers(null);
    setError("");
    setAlert(null);
    setNotice("");
    returnToPhone.current = true;
  }

  function confirmCustomer() {
    if (!draft) return;
    if (customer) {
      goTo(2);
      return;
    }
    if (!draft.channelId) {
      setError("Choose an acquisition channel for this new customer.");
      return;
    }
    void run(
      async (signal) => {
        const result = await checkoutRequest<{ customer: Customer; isNewCustomer: boolean }>(
          "/api/staff/customers",
          signal,
          {
            organizationId,
            branchId,
            phoneNumber: draft.phone,
            acquisitionChannelId: draft.channelId
          }
        );
        setCustomer({ id: result.customer.id });
        persist({ ...draft, channelId: "", step: 2 });
        if (result.isNewCustomer)
          showToast("Customer created · phone ending in " + phoneSuffix(draft.phone));
      },
      (cause) => setError(errorMessage(cause, "Customer creation failed. Try again."))
    );
  }

  function refreshOffers(verifyCustomer = false) {
    if (!draft || !customer || request.current) return;
    const subtotal = parseSubtotalCents(draft.subtotal);
    if (subtotal === null || !isValidReceipt(draft.receipt)) {
      goTo(2);
      setError(
        subtotal === null
          ? "Enter a subtotal greater than zero with up to two decimal places."
          : "Enter a receipt number starting with a letter or number. You can also use spaces, periods, underscores, slashes and hyphens."
      );
      return;
    }

    const next = { ...draft, step: 3 } as const;
    setOffers(null);
    persist(next);
    void run(
      async (signal) => {
        const current = verifyCustomer ? await lookupCustomer(next.phone, signal) : customer;
        setCustomer(current ? { id: current.id } : null);
        if (!current) {
          persist({ ...next, step: 1, selected: "" });
          setError("Customer details changed. Confirm the customer before continuing.");
          return;
        }
        await getOffers(
          current.id === customer.id ? next : { ...next, selected: "" },
          current,
          subtotal,
          signal
        );
      },
      (cause) => setError(errorMessage(cause, "Offers could not be loaded. Try again."))
    );
  }

  function editBill(update: { subtotal: string } | { receipt: string }) {
    if (!draft || draft.redemptionPending) return;
    setOffers(null);
    setError("");
    persist({ ...draft, ...update });
  }

  function redeem() {
    if (
      !draft ||
      draft.redemptionPending ||
      draft.step !== 4 ||
      !customer ||
      !selectedOffer ||
      alert ||
      request.current
    )
      return;
    const billSubtotalCents = parseSubtotalCents(draft.subtotal);
    if (billSubtotalCents === null || !isValidReceipt(draft.receipt)) return;
    const attempted = {
      ...draft,
      step: 2,
      redemptionPending: true,
      expiresAt: Date.now() + checkoutDraftLifetimeMs
    } as const;
    // Record uncertainty before the POST so reloads cannot reopen a ready-to-submit checkout.
    try {
      sessionStorage.setItem(key, JSON.stringify(attempted));
    } catch {
      setError("Enable tab storage before confirming. Checkout could not save a recovery draft.");
      return;
    }
    void run(
      async (signal) => {
        const result = await checkoutRequest<{ id: string }>(
          "/api/staff/checkout",
          AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
          {
            action: "redeem",
            organizationId,
            branchId,
            customerId: customer.id,
            promotionId: selectedOffer.promotionId,
            receiptNumber: draft.receipt.trim(),
            billSubtotalCents,
            expectedDiscountCents: selectedOffer.discountCents
          },
          201
        );
        if (typeof result.id !== "string" || !result.id) throw new Error("Unconfirmed redemption");
        resetCheckout();
        showToast("Redemption completed");
      },
      (cause) => {
        const issue = redemptionIssue(cause);
        setOffers(null);
        persist(issue ? { ...draft, step: issue.target } : attempted);
        if (issue) setAlert(issue);
      }
    );
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || alert || draft?.redemptionPending) return;
    if (step === 1) confirmCustomer();
    if (step === 2) refreshOffers();
    if (step === 3 && selectedOffer) goTo(4);
  }

  const closeAlert = () => setAlert(null);
  const toastStyle =
    "pointer-events-none absolute right-3 bottom-[4.75rem] z-10 max-w-[calc(100%-1.5rem)]";
  const toastContent = toast && (
    <div className="rounded-md bg-teal-950 px-4 py-3 text-sm font-semibold text-white shadow-lg">
      {toast}
    </div>
  );

  return (
    <div className="mt-6">
      <form
        className="max-w-2xl rounded-xl border border-slate-200 bg-white p-4 sm:p-6"
        onSubmit={findCustomer}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-[1_1_15rem] text-sm font-semibold">
            Phone number
            <input
              ref={phoneInput}
              className={field}
              autoComplete="off"
              type="tel"
              maxLength={64}
              value={open ? "" : phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setError("");
              }}
              disabled={busy}
              required
            />
          </label>
          <button className={primary} disabled={busy} type="submit">
            {busy && !open ? "Finding customer…" : "Find customer"}
          </button>
        </div>
        {notice && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            {notice}
          </p>
        )}
        {!open && error && (
          <p role="alert" className="mt-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </form>
      <div
        role="status"
        className="pointer-events-none fixed right-4 top-4 z-50 max-w-[calc(100%-2rem)]"
      >
        {!open && toastContent}
      </div>

      <CheckoutDialog
        open={open && !!draft}
        labelledBy="checkout-title"
        describedBy="checkout-branch"
        onDismiss={() => closeWizard()}
        className={styles.dialog}
      >
        {draft && (
          <div className={styles.layout} data-ui>
            <header className="border-b border-slate-200 px-4 pt-4 sm:px-7 sm:pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="checkout-title" className="text-2xl font-semibold tracking-tight">
                    Promotion checkout
                  </h2>
                  <p id="checkout-branch" className="mt-1 text-sm text-slate-600">
                    {branchName}
                  </p>
                </div>
                <button
                  className={secondary}
                  type="button"
                  disabled={busy}
                  onClick={() => closeWizard()}
                >
                  Close <span className="sr-only">and keep draft</span>
                </button>
              </div>
              <nav aria-label="Checkout progress" className="mt-4">
                <ol className="grid grid-cols-4 gap-1 sm:gap-3">
                  {steps.map(({ number, title, short }) => {
                    const done = number < step;
                    const current = number === step;
                    const label = (
                      <>
                        {done ? (
                          <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 16 16">
                            <path
                              d="m3 8 3 3 7-7"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            />
                          </svg>
                        ) : (
                          <span aria-hidden="true" className="font-semibold tabular-nums">
                            {number}
                          </span>
                        )}
                        <span className="hidden sm:inline">{title}</span>
                        <span aria-hidden="true" className="sm:hidden">
                          {short}
                        </span>
                        <span className="sr-only sm:hidden">{title}</span>
                        {done && <span className="sr-only"> (completed)</span>}
                      </>
                    );
                    const classes = [
                      "flex min-h-12 w-full flex-col items-center justify-center gap-1 border-b-2 px-0.5 py-1.5 text-center text-xs leading-tight sm:flex-row sm:px-2 sm:text-sm",
                      current
                        ? "border-teal-700 bg-teal-50 font-semibold text-teal-950"
                        : "border-transparent",
                      done ? "font-medium text-teal-900 hover:bg-slate-100" : "text-slate-600"
                    ].join(" ");
                    return (
                      <li key={number} aria-current={current ? "step" : undefined}>
                        {done && !draft.redemptionPending ? (
                          <button
                            type="button"
                            disabled={busy}
                            className={classes}
                            onClick={() => goTo(number)}
                          >
                            {label}
                          </button>
                        ) : (
                          <span className={classes}>{label}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </header>

            <form
              id="checkout-step-form"
              onSubmit={next}
              className={styles.content + " px-4 py-5 sm:px-7 sm:py-6"}
            >
              <h3 ref={stepHeading} tabIndex={-1} className="text-xl font-semibold outline-none">
                <span className="sr-only">Step {step} of 4. </span>
                {steps[step - 1].title}
              </h3>
              {draft.redemptionPending && (
                <div
                  role="alert"
                  className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-950"
                >
                  <p className="font-semibold">Redemption outcome unknown</p>
                  <p className="mt-1">
                    This redemption may have completed. Ask a manager to check this receipt in this
                    branch’s redemption history before starting over.
                  </p>
                </div>
              )}
              {step === 1 && (
                <>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-4 py-2">
                    <div className="py-2">
                      <p className="font-semibold">
                        {customer ? "Returning customer found" : "New customer"}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Phone ending in {phoneSuffix(draft.phone)}
                      </p>
                    </div>
                    <button
                      className={secondary}
                      type="button"
                      disabled={busy}
                      onClick={() => closeWizard(true)}
                    >
                      Change phone
                    </button>
                  </div>
                  {!customer && (
                    <label className="mt-5 block text-sm font-semibold">
                      Acquisition channel
                      <span className="mt-1 block font-normal text-slate-600">
                        Record how this customer first heard about the restaurant.
                      </span>
                      <select
                        className={field}
                        value={draft.channelId}
                        required
                        disabled={busy || channels.length === 0}
                        onChange={(event) => persist({ ...draft, channelId: event.target.value })}
                      >
                        <option value="">Choose a channel</option>
                        {channels.map(({ id, name }) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {channels.length === 0 && (
                        <span className="mt-2 block text-red-800">
                          No active acquisition channels are available.
                        </span>
                      )}
                    </label>
                  )}
                </>
              )}
              {step === 2 && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Bill subtotal ($)
                    <input
                      className={field}
                      inputMode="decimal"
                      placeholder="45.00"
                      value={draft.subtotal}
                      readOnly={draft.redemptionPending}
                      maxLength={16}
                      onChange={(event) => editBill({ subtotal: event.target.value })}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Receipt number
                    <input
                      className={field}
                      value={draft.receipt}
                      readOnly={draft.redemptionPending}
                      maxLength={80}
                      onChange={(event) => editBill({ receipt: event.target.value })}
                      required
                      disabled={busy}
                    />
                  </label>
                </div>
              )}
              {step === 3 && (
                <fieldset className="mt-3" disabled={busy}>
                  <legend className="sr-only">Eligible promotions</legend>
                  <p className="text-sm text-slate-600">
                    {busy
                      ? "Checking current offers…"
                      : offers
                        ? "Choose one offer. Best Deal marks the highest savings."
                        : "Refresh the offers to get a current quote."}
                  </p>
                  {offers && eligible.length === 0 && (
                    <p className="mt-3 font-medium">No promotions qualify for this bill.</p>
                  )}
                  <div className="mt-3 space-y-2">
                    {eligible.map((offer) => (
                      <label
                        key={offer.promotionId}
                        className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-slate-200 p-3 has-checked:border-teal-700 has-checked:bg-teal-50"
                      >
                        <input
                          className="size-4 accent-teal-800"
                          type="radio"
                          name="promotion"
                          value={offer.promotionId}
                          checked={draft.selected === offer.promotionId}
                          onChange={() => persist({ ...draft, selected: offer.promotionId })}
                        />
                        <span className="min-w-0 break-words">
                          <span className="font-semibold">{offer.name}</span>
                          {offer.isBestDeal && (
                            <span className="ml-2 inline-block text-xs font-semibold text-teal-900">
                              Best Deal
                            </span>
                          )}
                          <span className="mt-0.5 block text-sm text-teal-900">
                            Save {money(offer.discountCents)}
                          </span>
                        </span>
                        <span className="text-right tabular-nums">
                          <span className="block text-xs text-slate-600">Final</span>
                          <strong>{money(offer.finalBillCents)}</strong>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!offers && !busy && (
                    <button className={secondary} type="button" onClick={() => refreshOffers(true)}>
                      Refresh offers
                    </button>
                  )}
                </fieldset>
              )}
              {step === 4 && selectedOffer && (
                <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-4 gap-y-2 rounded-md bg-slate-50 p-4 text-sm tabular-nums sm:p-5">
                  <dt className="text-slate-600">Customer phone</dt>
                  <dd className="text-right">Ending in {phoneSuffix(draft.phone)}</dd>
                  <dt className="text-slate-600">Branch</dt>
                  <dd className="break-words text-right">{branchName}</dd>
                  <dt className="text-slate-600">Receipt number</dt>
                  <dd className="break-words text-right">{draft.receipt.trim()}</dd>
                  <dt className="text-slate-600">Bill subtotal</dt>
                  <dd className="text-right">{money(parseSubtotalCents(draft.subtotal)!)}</dd>
                  <dt className="text-slate-600">Promotion</dt>
                  <dd className="break-words text-right">{selectedOffer.name}</dd>
                  <dt className="text-slate-600">Discount</dt>
                  <dd className="text-right text-teal-900">
                    −{money(selectedOffer.discountCents)}
                  </dd>
                  <dt className="mt-2 self-center font-semibold">Final amount</dt>
                  <dd className="mt-2 text-right text-2xl font-semibold">
                    {money(selectedOffer.finalBillCents)}
                  </dd>
                </dl>
              )}
              {error && (
                <p role="alert" className="mt-4 text-sm font-medium text-red-800">
                  {error}
                </p>
              )}
            </form>

            <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-200 px-4 py-3 sm:px-7">
              <button
                type="button"
                className={secondary + " pl-0 text-sm"}
                disabled={busy}
                onClick={() => setAlert("discard")}
              >
                Start over
              </button>
              {!draft.redemptionPending && (
                <div className="ml-auto flex items-center gap-1 sm:gap-2">
                  {step > 1 && (
                    <button
                      type="button"
                      className={secondary}
                      disabled={busy}
                      onClick={() => goTo((step - 1) as CheckoutStep)}
                    >
                      Back
                    </button>
                  )}
                  {step === 4 ? (
                    <button
                      type="button"
                      className={primary}
                      disabled={busy || !selectedOffer}
                      onClick={redeem}
                    >
                      {busy ? "Confirming…" : "Confirm redemption"}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      form="checkout-step-form"
                      className={primary}
                      disabled={
                        busy ||
                        (step === 3 && !selectedOffer) ||
                        (step === 1 && !customer && channels.length === 0)
                      }
                    >
                      {step === 1
                        ? customer
                          ? "Continue to bill"
                          : busy
                            ? "Creating…"
                            : "Create customer"
                        : step === 2
                          ? "Show offers"
                          : "Review redemption"}
                    </button>
                  )}
                </div>
              )}
            </footer>
            <div role="status" className={toastStyle}>
              {open && toastContent}
            </div>
          </div>
        )}
      </CheckoutDialog>

      <CheckoutDialog
        open={alert !== null}
        alert
        labelledBy="checkout-alert-title"
        describedBy="checkout-alert-description"
        onDismiss={closeAlert}
        className={styles.errorDialog}
      >
        {alert && (
          <div className="p-5 sm:p-6">
            <h2 id="checkout-alert-title" className="text-xl font-semibold">
              {alert === "discard" ? "Start a new checkout?" : alert.title}
            </h2>
            <div
              id="checkout-alert-description"
              className="mt-2 space-y-2 text-sm leading-6 text-slate-700"
            >
              {alert === "discard" ? (
                <p>
                  {draft?.redemptionPending
                    ? "Confirm that a manager checked this receipt before clearing the saved checkout fields."
                    : "This will clear the saved checkout fields."}
                </p>
              ) : (
                alert.messages.map((message) => <p key={message}>{message}</p>)
              )}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className={secondary} onClick={closeAlert}>
                {alert === "discard" ? "Keep checkout" : "Close"}
              </button>
              <button
                type="button"
                className={primary}
                onClick={() => {
                  closeAlert();
                  if (alert === "discard") resetCheckout();
                  else if (alert.target === 3) refreshOffers(true);
                }}
              >
                {alert === "discard"
                  ? draft?.redemptionPending
                    ? "Receipt checked. Start over"
                    : "Clear draft and start over"
                  : alert.action}
              </button>
            </div>
          </div>
        )}
      </CheckoutDialog>
    </div>
  );
}
