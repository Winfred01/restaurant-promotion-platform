"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function CheckoutDialog({
  open,
  labelledBy,
  describedBy,
  className,
  onDismiss,
  children,
  alert = false
}: {
  open: boolean;
  labelledBy: string;
  describedBy?: string;
  className: string;
  onDismiss: () => void;
  children: ReactNode;
  alert?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (open) {
      dialog.showModal();
      return () => dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={className}
      role={alert ? "alertdialog" : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:enabled, input:enabled, select:enabled, a[href]"
          )
        ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = controls.at(0);
        const last = controls.at(-1);
        // Native modality blocks the page, but some browsers still tab out to browser chrome.
        if (
          !first ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
    >
      {children}
    </dialog>
  );
}
