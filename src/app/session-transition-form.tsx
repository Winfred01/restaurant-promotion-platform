"use client";

import type { ReactNode } from "react";

import { clearTabCheckoutDrafts } from "@/app/checkout-draft-storage";

export function SessionTransitionForm({
  action,
  className,
  children
}: {
  action: (formData: FormData) => Promise<void>;
  className: string;
  children: ReactNode;
}) {
  return (
    <form action={action} className={className} onSubmit={clearTabCheckoutDrafts}>
      {children}
    </form>
  );
}
