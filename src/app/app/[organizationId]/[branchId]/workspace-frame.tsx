"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

export function WorkspaceNavigationLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Link
      aria-current={pathname === href ? "page" : undefined}
      className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-teal-700"
      href={href}
    >
      {children}
    </Link>
  );
}

export function WorkspaceFrame({
  children,
  navigation,
  accountActions,
  organizationName,
  branchName,
  role,
  guidedDemo
}: {
  children: ReactNode;
  navigation: ReactNode;
  accountActions: ReactNode;
  organizationName: string;
  branchName: string;
  role: string;
  guidedDemo?: boolean;
}) {
  const pathname = usePathname();
  const analytics = /^\/app\/[^/]+\/[^/]+\/manager\/?$/.test(pathname);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`${analytics ? "analytics-workspace " : ""}min-h-screen bg-slate-50 lg:grid lg:grid-cols-[15rem_1fr]`}
    >
      <aside className="workspace-sidebar border-b border-slate-200 bg-white px-6 py-6 lg:min-h-screen lg:border-b-0 lg:border-r">
        <Link className="workspace-brand text-lg font-bold text-teal-900" href="/app">
          {analytics && (
            <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
              <path
                d="M4 5h16M4 12h10M4 19h16M18 9v6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
          {analytics ? "Restaurant Promotion" : "Restaurant workspace"}
        </Link>
        {analytics && (
          <button
            className="workspace-menu-toggle"
            aria-expanded={expanded}
            aria-controls="workspace-navigation"
            onClick={() => setExpanded(!expanded)}
          >
            Workspace menu <span aria-hidden="true">{expanded ? "−" : "+"}</span>
          </button>
        )}
        <div className="workspace-context mt-8 rounded-xl bg-teal-50 p-4 text-sm">
          {guidedDemo ? (
            <p className="mb-3 bg-teal-900 px-3 py-2 font-semibold text-white">
              Isolated demo session
            </p>
          ) : null}
          <p className="font-semibold text-slate-950">{organizationName}</p>
          <p className="mt-1 text-slate-700">{branchName}</p>
          <p className="workspace-role mt-2 font-semibold text-teal-800">{role}</p>
        </div>
        <div id="workspace-navigation" className="workspace-navigation" data-expanded={expanded}>
          {navigation}
          {accountActions}
        </div>
      </aside>
      <main
        id="workspace-main"
        className="workspace-main mx-auto w-full max-w-5xl px-6 py-10 lg:px-12"
      >
        {children}
      </main>
    </div>
  );
}
