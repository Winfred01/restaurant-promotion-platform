"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";

const demoRoles = [
  ["Owner", "owner@restaurant-demo.example.com"],
  ["Manager", "manager@restaurant-demo.example.com"],
  ["Staff", "staff@restaurant-demo.example.com"]
] as const;

export function LoginForm({ showDemoAccounts }: { showDemoAccounts: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false
      });

      if (!result?.ok) {
        setError("We could not sign you in. Check your email and password.");
        return;
      }

      window.location.assign("/demo");
    } catch {
      setError("Sign in is unavailable right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
      <section>
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">
          Restaurant demo
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
          Sign in as a restaurant employee
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">
          Use an Owner, Manager, or Staff account to explore the employee experience. Customers do
          not need an account.
        </p>
        {showDemoAccounts ? (
          <div className="mt-8 rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <h2 className="font-semibold text-teal-950">Demo accounts</h2>
            <p className="mt-1 text-sm text-teal-900">
              These accounts exist only in a seeded demo environment. Ask the demo operator for the
              password.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-teal-950">
              {demoRoles.map(([role, accountEmail]) => (
                <li key={role}>
                  <span className="inline-block w-20 font-semibold">{role}</span>
                  <button
                    className="rounded text-left underline underline-offset-2 hover:text-teal-700"
                    type="button"
                    onClick={() => setEmail(accountEmail)}
                  >
                    {accountEmail}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-10">
        <h2 className="text-2xl font-semibold text-slate-950">Employee login</h2>
        <p className="mt-2 text-sm text-slate-600">
          Enter the credentials for your restaurant account.
        </p>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="username"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800" htmlFor="password">
              Password
            </label>
            <input
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          {error ? (
            <p
              aria-live="polite"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            className="w-full rounded-xl bg-teal-800 px-4 py-3 font-semibold text-white hover:bg-teal-900 disabled:cursor-wait disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
