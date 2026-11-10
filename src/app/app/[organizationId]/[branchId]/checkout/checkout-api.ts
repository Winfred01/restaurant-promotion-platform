import type { StaffCheckoutWorkflow } from "@/server/redemptions/staff-checkout";

export type Customer = { id: string };
export type Offer = Awaited<ReturnType<StaffCheckoutWorkflow["quote"]>>["offers"][number];

export class CheckoutRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reasonCodes: readonly string[] = [],
    readonly status?: number
  ) {
    super(message);
  }
}

export async function checkoutRequest<T>(
  url: string,
  signal: AbortSignal,
  input?: Record<string, unknown>,
  expectedStatus?: number
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    signal,
    ...(input && {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    })
  });
  const body = await response.json().catch(() => null);
  signal.throwIfAborted();
  if (!response.ok) {
    throw new CheckoutRequestError(
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? "The request could not be completed.",
      Array.isArray(body?.error?.reasonCodes) ? body.error.reasonCodes : [],
      response.status
    );
  }
  if (!body || (expectedStatus !== undefined && response.status !== expectedStatus)) {
    throw new CheckoutRequestError("INTERNAL_ERROR", "The response could not be verified.");
  }
  return body as T;
}

const promotionReasons: Record<string, string> = {
  ALREADY_REDEEMED: "This customer has already redeemed this promotion.",
  PROMOTION_EXPIRED: "This promotion has expired.",
  PROMOTION_STATUS_PAUSED: "This promotion has been paused.",
  MINIMUM_SPEND_NOT_MET: "The subtotal is below this promotion’s minimum spend.",
  BRANCH_NOT_TARGETED: "This promotion does not apply to this branch.",
  PROMOTION_STATUS_DRAFT: "This promotion is still a draft.",
  PROMOTION_STATUS_SCHEDULED: "This promotion is scheduled.",
  PROMOTION_NOT_STARTED: "This promotion has not started yet.",
  PROMOTION_STATUS_ENDED: "This promotion has ended.",
  PROMOTION_STATUS_ARCHIVED: "This promotion was archived.",
  PROMOTION_CODE_UNAVAILABLE: "The promotion code is no longer available."
};

export function redemptionIssue(error: unknown) {
  if (!(error instanceof CheckoutRequestError)) return null;

  switch (error.status + ":" + error.code) {
    case "409:RECEIPT_ALREADY_REDEEMED":
      return {
        title: "Receipt already used",
        messages: [
          "This receipt number has already been used at this branch. Check the receipt and enter the correct number."
        ],
        action: "Edit receipt",
        target: 2
      } as const;
    case "409:PROMOTION_INELIGIBLE":
    case "409:PROMOTION_UNAVAILABLE": {
      const reasons = error.reasonCodes.flatMap((reason) =>
        Object.hasOwn(promotionReasons, reason) ? [promotionReasons[reason]] : []
      );
      return {
        title: "Promotion unavailable",
        messages: reasons.length ? reasons : ["The selected promotion is no longer available."],
        action: "Refresh offers",
        target: 3
      } as const;
    }
    case "404:CONTEXT_UNAVAILABLE":
    case "409:CHECKOUT_CONTEXT_CHANGED":
      return {
        title: "Checkout details changed",
        messages: [
          "Get an updated quote and review the latest customer and bill details before confirming."
        ],
        action: "Refresh offers",
        target: 3
      } as const;
    case "409:REDEMPTION_CONFLICT":
      return {
        title: "Redemption conflict",
        messages: [
          "The exact cause could not be verified. Refresh the offers and check the receipt before trying again."
        ],
        action: "Refresh offers",
        target: 3
      } as const;
    case "400:INVALID_REQUEST":
      return {
        title: "Check the bill details",
        messages: ["Verify the subtotal and receipt number before continuing."],
        action: "Edit bill",
        target: 2
      } as const;
    case "401:AUTHENTICATION_REQUIRED":
    case "403:AUTHORIZATION_DENIED":
    case "403:CSRF_VALIDATION_FAILED":
      return {
        title: "Checkout access unavailable",
        messages: ["Check your employee session and branch access before continuing."],
        action: "Review customer",
        target: 1
      } as const;
    default:
      return null;
  }
}
