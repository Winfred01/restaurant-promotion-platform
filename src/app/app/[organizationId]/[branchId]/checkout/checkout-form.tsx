"use client";

import { useState, type FormEvent } from "react";

import { money, parseSubtotalCents } from "./checkout-input";

type Customer = { id: string; phoneNumberDisplay: string };
type Offer = {
  promotionId: string;
  name: string;
  eligible: boolean;
  reasonCodes: string[];
  discountCents: number;
  finalBillCents: number;
  isBestDeal: boolean;
};
type CheckoutSuccess = {
  id: string;
  receiptNumber: string;
  billSubtotalCents: number;
  discountCents: number;
  netBillCents: number;
};

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Request failed. Please try again.");
  return body as T;
}

function maskedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `ending in ${digits.slice(-4)}` : "found";
}

export function CheckoutForm({
  organizationId,
  branchId,
  channels
}: {
  organizationId: string;
  branchId: string;
  channels: { id: string; name: string }[];
}) {
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [lookup, setLookup] = useState<"idle" | "missing" | "found">("idle");
  const [channelId, setChannelId] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [receipt, setReceipt] = useState("");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [selected, setSelected] = useState("");
  const [success, setSuccess] = useState<CheckoutSuccess | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function resetQuote() {
    setOffers(null);
    setSelected("");
    setSuccess(null);
  }

  async function findCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCustomer(null);
    setIsNewCustomer(false);
    setLookup("idle");
    resetQuote();
    setBusy(true);
    try {
      const query = new URLSearchParams({ organizationId, branchId, phoneNumber: phone });
      const result = await responseBody<{ customer: Customer | null }>(
        await fetch(`/api/staff/customers?${query}`, { cache: "no-store" })
      );
      setCustomer(result.customer);
      setIsNewCustomer(false);
      setLookup(result.customer ? "found" : "missing");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Customer lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!channelId) {
      setError("Choose an acquisition channel for this new customer.");
      return;
    }
    setBusy(true);
    try {
      const result = await responseBody<{ customer: Customer; isNewCustomer: boolean }>(
        await fetch("/api/staff/customers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            organizationId,
            branchId,
            phoneNumber: phone,
            acquisitionChannelId: channelId
          })
        })
      );
      setCustomer(result.customer);
      setIsNewCustomer(result.isNewCustomer);
      setLookup("found");
      setChannelId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Customer creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function quote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    resetQuote();
    const billSubtotalCents = parseSubtotalCents(subtotal);
    if (!customer || billSubtotalCents === null) {
      setError("Enter a valid bill subtotal greater than zero.");
      return;
    }
    setBusy(true);
    try {
      const result = await responseBody<{ offers: Offer[] }>(
        await fetch("/api/staff/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "quote",
            organizationId,
            branchId,
            customerId: customer.id,
            billSubtotalCents
          })
        })
      );
      setOffers(result.offers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Quote failed.");
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    setError("");
    const billSubtotalCents = parseSubtotalCents(subtotal);
    if (!customer || !selected || !receipt.trim() || billSubtotalCents === null) {
      setError("Select one offer and enter a receipt number and valid subtotal.");
      return;
    }
    setBusy(true);
    try {
      const result = await responseBody<CheckoutSuccess>(
        await fetch("/api/staff/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "redeem",
            organizationId,
            branchId,
            customerId: customer.id,
            promotionId: selected,
            receiptNumber: receipt,
            billSubtotalCents
          })
        })
      );
      setSuccess(result);
      setOffers(null);
      setSelected("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Redemption failed.");
      setOffers(null);
      setSelected("");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus-visible:outline-2 focus-visible:outline-teal-700";
  const button =
    "rounded-lg bg-teal-800 px-4 py-2 font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {success && (
        <section
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950"
        >
          <h2 className="text-lg font-semibold">Redemption completed</h2>
          <p className="mt-2">
            Receipt {success.receiptNumber}: {money(success.billSubtotalCents)} subtotal,{" "}
            {money(success.discountCents)} discount, {money(success.netBillCents)} final amount.
          </p>
          <p className="mt-1 text-sm">Confirmation ID: {success.id}</p>
        </section>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">1. Find customer</h2>
        <form onSubmit={findCustomer} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm font-medium">
            Phone number
            <input
              className={field}
              autoComplete="tel"
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setCustomer(null);
                setIsNewCustomer(false);
                setLookup("idle");
                resetQuote();
              }}
              disabled={busy}
              required
            />
          </label>
          <button className={button} disabled={busy} type="submit">
            Find customer
          </button>
        </form>
        {lookup === "found" && customer && (
          <p role="status" className="mt-4 text-sm text-emerald-800">
            {isNewCustomer ? "New customer created" : "Returning customer found"}{" "}
            {maskedPhone(customer.phoneNumberDisplay)}. Continue to checkout; acquisition channel is
            already recorded.
          </p>
        )}
        {lookup === "missing" && (
          <form onSubmit={createCustomer} className="mt-5 rounded-xl bg-slate-50 p-4">
            <p className="font-medium">New customer</p>
            <p className="mt-1 text-sm text-slate-600">
              Record their acquisition channel once before checkout.
            </p>
            <label className="mt-4 block text-sm font-medium">
              Acquisition channel
              <select
                className={field}
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                disabled={busy}
                required
              >
                <option value="">Choose a channel</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            {channels.length === 0 && (
              <p className="mt-2 text-sm text-amber-800">
                No active acquisition channels are available for this restaurant.
              </p>
            )}
            <button
              className={`${button} mt-4`}
              disabled={busy || channels.length === 0}
              type="submit"
            >
              Create customer
            </button>
          </form>
        )}
      </section>
      {customer && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">2. Enter bill and compare offers</h2>
          <form
            onSubmit={quote}
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <label className="text-sm font-medium">
              Bill subtotal ($)
              <input
                className={field}
                inputMode="decimal"
                placeholder="45.00"
                value={subtotal}
                onChange={(event) => {
                  setSubtotal(event.target.value);
                  resetQuote();
                }}
                disabled={busy}
                required
              />
            </label>
            <label className="text-sm font-medium">
              Receipt number
              <input
                className={field}
                maxLength={80}
                value={receipt}
                onChange={(event) => {
                  setReceipt(event.target.value);
                  resetQuote();
                }}
                disabled={busy}
                required
              />
            </label>
            <button className={button} disabled={busy} type="submit">
              Show offers
            </button>
          </form>
          {offers && (
            <div className="mt-6">
              <h3 className="font-semibold">Eligible promotions</h3>
              {offers.length === 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  No active promotions are available for this branch.
                </p>
              )}
              {offers.length > 0 && offers.every((offer) => !offer.eligible) && (
                <p className="mt-2 text-sm text-slate-600">No promotions qualify for this bill.</p>
              )}
              <div className="mt-3 space-y-3">
                {offers.map((offer) => (
                  <label
                    key={offer.promotionId}
                    className={`flex gap-3 rounded-xl border p-4 ${offer.eligible ? "border-teal-200" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                  >
                    <input
                      type="radio"
                      name="promotion"
                      value={offer.promotionId}
                      checked={selected === offer.promotionId}
                      onChange={() => setSelected(offer.promotionId)}
                      disabled={!offer.eligible || busy}
                    />
                    <span>
                      <span className="font-semibold">{offer.name}</span>
                      {offer.isBestDeal && (
                        <span className="ml-2 rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-900">
                          Best Deal
                        </span>
                      )}
                      <span className="mt-1 block text-sm">
                        {offer.eligible
                          ? `Save ${money(offer.discountCents)} · Final ${money(offer.finalBillCents)}`
                          : offer.reasonCodes.join(", ").replaceAll("_", " ").toLowerCase()}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                className={`${button} mt-5`}
                disabled={busy || !selected}
                onClick={redeem}
                type="button"
              >
                Confirm one redemption
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Eligibility and receipt uniqueness are checked again when you confirm.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
