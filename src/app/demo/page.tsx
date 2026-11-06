import Link from "next/link";

import { isGuidedDemoEnabled } from "@/server/demo/entry";
import { enterGuidedDemo } from "./actions";
import styles from "./demo.module.css";

const roles = [
  {
    value: "OWNER",
    label: "Owner",
    description: "See both branches, organization analytics, and branch management.",
    first: "Begin with the organization dashboard."
  },
  {
    value: "MANAGER",
    label: "Manager",
    description: "Manage promotions, review branch results, and void a mistaken redemption.",
    first: "Begin with Promotions."
  },
  {
    value: "STAFF",
    label: "Staff",
    description: "Look up a customer, compare Best Deal, and complete a checkout.",
    first: "Begin with Staff checkout."
  }
] as const;

const errorMessages: Record<string, string> = {
  disabled: "Guided demo access is disabled in this environment.",
  role: "Choose one of the three available roles.",
  full: "All isolated demo sessions are in use. Please return after the operator replenishes the pool.",
  unavailable: "The demo is temporarily unavailable. Please try again later."
};

export default async function DemoPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const enabled = isGuidedDemoEnabled();
  const { error } = await searchParams;
  const message = error ? errorMessages[error] : undefined;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Restaurant Promotion Platform
        </Link>
        <Link href="/login">Employee sign in</Link>
      </header>

      <section className={styles.hero} aria-labelledby="demo-title">
        <div>
          <h1 id="demo-title">Choose your place in the restaurant.</h1>
          <p>
            Enter a real, isolated demo workspace as an Owner, Manager, or Staff member. Each visit
            has its own fictional restaurant data.
          </p>
        </div>
        <div className={styles.status} aria-live="polite">
          {enabled ? "Guided demo is ready" : "Guided demo is unavailable here"}
        </div>
      </section>

      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}

      {enabled ? (
        <section className={styles.roles} aria-labelledby="role-title" data-ui>
          <h2 id="role-title">Enter as</h2>
          <div className={styles.roleList}>
            {roles.map((role) => (
              <form action={enterGuidedDemo} className={styles.role} key={role.value}>
                <input name="role" type="hidden" value={role.value} />
                <div>
                  <h3>{role.label}</h3>
                  <p>{role.description}</p>
                  <span>{role.first}</span>
                </div>
                <button type="submit" aria-label={`Enter as ${role.label}`}>
                  Enter as {role.label} <span aria-hidden="true">↗</span>
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : (
        <section className={styles.disabled} aria-labelledby="disabled-title">
          <h2 id="disabled-title">Demo access is closed</h2>
          <p>
            The operator must enable the dedicated demo environment and provision isolated sessions.
          </p>
        </section>
      )}

      <section className={styles.note} aria-labelledby="visit-title">
        <h2 id="visit-title">Your own visit</h2>
        <p>
          Every role opens the real employee application with server-checked permissions. Demo data
          is fictional; customers never need an account. The operator controls session supply and
          reset.
        </p>
      </section>
    </main>
  );
}
