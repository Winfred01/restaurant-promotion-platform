import { describe, expect, it } from "vitest";

import { CheckoutRequestError, redemptionIssue } from "./checkout-api";

describe("checkout error messages", () => {
  it.each([
    ["ALREADY_REDEEMED", "already redeemed"],
    ["PROMOTION_EXPIRED", "expired"],
    ["PROMOTION_STATUS_PAUSED", "paused"],
    ["MINIMUM_SPEND_NOT_MET", "minimum spend"],
    ["BRANCH_NOT_TARGETED", "does not apply to this branch"]
  ])("explains the verified reason %s", (reason, message) => {
    const issue = redemptionIssue(
      new CheckoutRequestError("PROMOTION_INELIGIBLE", "", [reason], 409)
    );
    expect(issue?.messages.join(" ")).toContain(message);
    expect(issue?.target).toBe(3);
  });

  it("ignores unrecognized reason codes and never displays an arbitrary error payload", () => {
    const issue = redemptionIssue(
      new CheckoutRequestError(
        "PROMOTION_UNAVAILABLE",
        "private detail",
        ["UNKNOWN_SQL_ERROR"],
        409
      )
    );
    expect(issue?.messages).toEqual(["The selected promotion is no longer available."]);
  });

  it.each([
    new TypeError("Failed to fetch"),
    new DOMException("Signal timed out", "TimeoutError"),
    new CheckoutRequestError("INTERNAL_ERROR", "", [], 500),
    new CheckoutRequestError("RECEIPT_ALREADY_REDEEMED", "", [], 502),
    new CheckoutRequestError("UNEXPECTED", "", [], 409)
  ])("keeps the outcome uncertain when the response is unverified", (error) => {
    expect(redemptionIssue(error)).toBeNull();
  });
});
