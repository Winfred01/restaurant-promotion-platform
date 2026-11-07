"use client";

import { useState, type FormEvent } from "react";

import styles from "./claim.module.css";

export default function ClaimForm({
  context
}: {
  context: { organizationId: string; branchId: string; promotionId: string };
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/public/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...context, phoneNumber: form.get("phoneNumber") })
      });
      const result = (await response.json()) as { message?: string; error?: string };
      setError(!response.ok);
      setMessage(
        response.ok
          ? (result.message ?? "Request received. Ask restaurant staff at checkout.")
          : (result.error ?? "This request is temporarily unavailable.")
      );
    } catch {
      setError(true);
      setMessage("This request is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <label htmlFor="claim-phone">Phone number</label>
      <input
        id="claim-phone"
        name="phoneNumber"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        maxLength={32}
        required
        placeholder="(416) 555-0103"
      />
      <button type="submit" disabled={pending}>
        {pending ? "Sending request…" : "Request promotion"}
      </button>
      {message ? (
        <p role={error ? "alert" : "status"} className={error ? styles.error : styles.success}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
